import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

// =============================================================================
// Tracer — records a program's execution, line by line, for the lessons'
// "Watch it run" step. Content-authoring tool only (never runs in production).
//
//   java Tracer <dir-with-compiled-Main-and-TraceBoot> [maxSteps]
//
// It launches the program in a second JVM under the Java Debug Interface (JDI),
// single-steps every line of the student-visible code, and at each step records:
// the line about to run, every stack frame (method, line, local variables),
// objects of the program's own classes (for linked lists / trees), and the
// output printed so far. The result is printed as JSON.
//
// Because the values come from the real JVM, the animation can never show a
// value the program didn't actually have. Compile the program with -g.
// =============================================================================
public class Tracer {
    static final String[] EXCLUDE = {"java.*", "javax.*", "jdk.*", "sun.*", "com.sun.*", "TraceBoot"};
    static final StringBuilder json = new StringBuilder();
    static int frames = 0;
    static int maxSteps = 300;
    static boolean truncated = false;
    static StepRequest step;
    static MethodExitRequest exits; // to see what each method returns
    static String pendingReturn = null; // the last return, attached to the next frame

    public static void main(String[] args) throws Exception {
        String cp = args[0];
        if (args.length > 1) maxSteps = Integer.parseInt(args[1]);

        LaunchingConnector conn = Bootstrap.virtualMachineManager().defaultConnector();
        Map<String, Connector.Argument> a = conn.defaultArguments();
        a.get("main").setValue("TraceBoot");
        a.get("options").setValue("-cp " + cp);
        VirtualMachine vm = conn.launch(a);
        drain(vm.process().getInputStream());
        drain(vm.process().getErrorStream());

        EventRequestManager erm = vm.eventRequestManager();
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter("TraceBoot");
        cpr.enable();

        json.append("{\"frames\":[");
        EventQueue q = vm.eventQueue();
        boolean running = true;
        while (running) {
            EventSet set = q.remove();
            for (Event e : set) {
                if (e instanceof ClassPrepareEvent cp1) {
                    // Break at TraceBoot.begin() (start stepping) and done() (finish).
                    ReferenceType boot = cp1.referenceType();
                    for (String m : new String[] {"begin", "done"}) {
                        Location loc = boot.methodsByName(m).get(0).location();
                        erm.createBreakpointRequest(loc).enable();
                    }
                } else if (e instanceof BreakpointEvent bp) {
                    String m = bp.location().method().name();
                    if (m.equals("begin")) {
                        step = erm.createStepRequest(bp.thread(), StepRequest.STEP_LINE, StepRequest.STEP_INTO);
                        for (String x : EXCLUDE) step.addClassExclusionFilter(x);
                        step.enable();
                        exits = erm.createMethodExitRequest();
                        exits.addThreadFilter(bp.thread());
                        for (String x : EXCLUDE) exits.addClassExclusionFilter(x);
                        exits.enable();
                    } else {
                        if (step != null) step.disable();
                        if (exits != null) exits.disable();
                        record(bp.thread(), vm, true);
                    }
                } else if (e instanceof MethodExitEvent me) {
                    // Remember what a method handed back, so the next frame can say so.
                    // Constructors and main itself are not interesting returns.
                    String m = me.method().name();
                    if (!m.equals("main") && !m.startsWith("<")) {
                        Value rv = me.returnValue();
                        String v = rv == null || rv instanceof VoidValue ? "null" : val(rv, new LinkedHashMap<>(), me.thread(), 0);
                        pendingReturn = "{\"m\":" + str(m) + ",\"v\":" + v + "}";
                    }
                } else if (e instanceof StepEvent se) {
                    if (frames >= maxSteps) {
                        truncated = true;
                        step.disable();
                        if (exits != null) exits.disable();
                    } else {
                        record(se.thread(), vm, false);
                    }
                } else if (e instanceof VMDeathEvent || e instanceof VMDisconnectEvent) {
                    running = false;
                }
            }
            if (running) set.resume();
        }
        json.append("],\"truncated\":").append(truncated).append("}");
        System.out.println(json);
    }

    // One snapshot of the program state.
    static void record(ThreadReference t, VirtualMachine vm, boolean finished) throws Exception {
        Map<Long, ObjectReference> heap = new LinkedHashMap<>();
        StringBuilder f = new StringBuilder();
        if (frames > 0) json.append(',');
        f.append("{\"done\":").append(finished);
        // The call stack, innermost first, skipping TraceBoot's own frame. Every
        // value is read BEFORE any serialisation: calling toString() inside the
        // traced JVM resumes the thread briefly, which invalidates stack frames.
        record Var(String name, Value value) {}
        record Snap(String method, int line, List<Var> vars) {}
        List<Snap> snaps = new ArrayList<>();
        if (!finished) {
            for (StackFrame fr : t.frames()) {
                if (fr.location().declaringType().name().equals("TraceBoot")) continue;
                List<Var> vars = new ArrayList<>();
                ObjectReference self = fr.thisObject();
                if (self != null) vars.add(new Var("this", self));
                List<LocalVariable> locals;
                try {
                    locals = fr.visibleVariables();
                } catch (AbsentInformationException ex) {
                    locals = List.of();
                }
                Map<LocalVariable, Value> values = fr.getValues(locals);
                for (LocalVariable lv : locals) {
                    if (!lv.name().equals("args")) vars.add(new Var(lv.name(), values.get(lv)));
                }
                snaps.add(new Snap(fr.location().method().name(), fr.location().lineNumber(), vars));
            }
        }
        f.append(",\"stack\":[");
        boolean first = true;
        for (Snap sn : snaps) {
            if (!first) f.append(',');
            first = false;
            f.append("{\"m\":").append(str(sn.method())).append(",\"line\":").append(sn.line()).append(",\"vars\":{");
            boolean fv = true;
            for (Var v : sn.vars()) {
                if (!fv) f.append(',');
                fv = false;
                f.append(str(v.name())).append(':').append(val(v.value(), heap, t, 0));
            }
            f.append("}}");
        }
        f.append(']');
        // Objects of the program's own classes, reachable from the locals.
        f.append(",\"heap\":{");
        boolean fh = true;
        Set<Long> done = new HashSet<>();
        Deque<ObjectReference> todo = new ArrayDeque<>(heap.values());
        StringBuilder h = new StringBuilder();
        while (!todo.isEmpty() && done.size() < 40) {
            ObjectReference o = todo.poll();
            if (!done.add(o.uniqueID())) continue;
            Map<Long, ObjectReference> more = new LinkedHashMap<>();
            if (!fh) h.append(',');
            fh = false;
            h.append(str(String.valueOf(o.uniqueID()))).append(":{\"cls\":").append(str(o.referenceType().name()));
            h.append(",\"fields\":{");
            boolean ff = true;
            for (Field fd : o.referenceType().allFields()) {
                if (fd.isStatic()) continue;
                if (!ff) h.append(',');
                ff = false;
                h.append(str(fd.name())).append(':').append(val(o.getValue(fd), more, t, 0));
            }
            h.append("}}");
            todo.addAll(more.values());
        }
        f.append(h).append('}');
        f.append(",\"out\":").append(str(output(vm)));
        if (pendingReturn != null) {
            f.append(",\"ret\":").append(pendingReturn);
            pendingReturn = null;
        }
        f.append('}');
        json.append(f);
        frames++;
    }

    // A value as JSON: primitives, strings, arrays, boxed numbers, java.util
    // collections (via toString), and references to the program's own objects.
    static String val(Value v, Map<Long, ObjectReference> heap, ThreadReference t, int depth) throws Exception {
        if (v == null) return "{\"t\":\"null\"}";
        if (v instanceof BooleanValue b) return "{\"t\":\"boolean\",\"v\":" + b.value() + "}";
        if (v instanceof CharValue c) return "{\"t\":\"char\",\"v\":" + str(String.valueOf(c.value())) + "}";
        if (v instanceof IntegerValue || v instanceof ShortValue || v instanceof ByteValue)
            return "{\"t\":\"int\",\"v\":" + ((PrimitiveValue) v).longValue() + "}";
        if (v instanceof LongValue l) return "{\"t\":\"long\",\"v\":" + str(String.valueOf(l.value())) + "}";
        if (v instanceof DoubleValue || v instanceof FloatValue)
            return "{\"t\":\"double\",\"v\":" + ((PrimitiveValue) v).doubleValue() + "}";
        if (v instanceof StringReference s) return "{\"t\":\"str\",\"v\":" + str(s.value()) + "}";
        if (v instanceof ArrayReference arr) {
            StringBuilder sb = new StringBuilder("{\"t\":\"array\",\"id\":" + arr.uniqueID() + ",\"cls\":" + str(arr.referenceType().name()) + ",\"items\":[");
            int n = Math.min(arr.length(), 30);
            for (int i = 0; i < n; i++) {
                if (i > 0) sb.append(',');
                sb.append(depth < 2 ? val(arr.getValue(i), heap, t, depth + 1) : "{\"t\":\"more\"}");
            }
            return sb.append("]}").toString();
        }
        ObjectReference o = (ObjectReference) v;
        String cls = o.referenceType().name();
        if (cls.startsWith("java.lang.") && o.referenceType().fieldByName("value") != null
                && !(o.getValue(o.referenceType().fieldByName("value")) instanceof ArrayReference)) {
            return val(o.getValue(o.referenceType().fieldByName("value")), heap, t, depth);
        }
        if (cls.startsWith("java.") ) {
            return "{\"t\":\"coll\",\"cls\":" + str(cls.substring(cls.lastIndexOf('.') + 1)) + ",\"v\":" + str(toStringOf(o, t)) + "}";
        }
        heap.put(o.uniqueID(), o);
        return "{\"t\":\"ref\",\"id\":" + o.uniqueID() + ",\"cls\":" + str(cls) + "}";
    }

    // Call toString() inside the traced JVM (event requests paused so the call
    // can't trigger our own events and deadlock).
    static String toStringOf(ObjectReference o, ThreadReference t) {
        try {
            if (step != null) step.disable();
            if (exits != null) exits.disable();
            Method m = o.referenceType().methodsByName("toString", "()Ljava/lang/String;").get(0);
            Value r = o.invokeMethod(t, m, List.of(), ObjectReference.INVOKE_SINGLE_THREADED);
            return r instanceof StringReference s ? s.value() : String.valueOf(r);
        } catch (Exception ex) {
            return o.referenceType().name();
        } finally {
            if (step != null && !truncated) step.enable();
            if (exits != null && !truncated) exits.enable();
        }
    }

    // Everything printed so far: TraceBoot.OUT's internal buffer.
    static String output(VirtualMachine vm) {
        ReferenceType boot = vm.classesByName("TraceBoot").get(0);
        ObjectReference baos = (ObjectReference) boot.getValue(boot.fieldByName("OUT"));
        ReferenceType bt = baos.referenceType();
        ArrayReference buf = (ArrayReference) baos.getValue(bt.fieldByName("buf"));
        int count = ((IntegerValue) baos.getValue(bt.fieldByName("count"))).value();
        byte[] bytes = new byte[count];
        List<Value> vals = count > 0 ? buf.getValues(0, count) : List.of();
        for (int i = 0; i < count; i++) bytes[i] = ((ByteValue) vals.get(i)).value();
        return new String(bytes, StandardCharsets.UTF_8);
    }

    static String str(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append('"').toString();
    }

    static void drain(InputStream in) {
        Thread th = new Thread(() -> {
            try {
                in.transferTo(System.err);
            } catch (Exception ignored) {
            }
        });
        th.setDaemon(true);
        th.start();
    }
}
