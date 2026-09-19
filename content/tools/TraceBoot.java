import java.io.ByteArrayOutputStream;
import java.io.PrintStream;

// Launch wrapper used by Tracer: captures everything Main prints into OUT (so the
// tracer can read the output-so-far at every step), then runs Main.main.
// begin() and done() are empty markers the tracer puts breakpoints on.
public class TraceBoot {
    public static final ByteArrayOutputStream OUT = new ByteArrayOutputStream();

    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(OUT, true, "UTF-8"));
        begin();
        Main.main(new String[0]);
        done();
    }

    static void begin() {}

    static void done() {}
}
