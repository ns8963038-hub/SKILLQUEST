# M7 — Learn mode: a lesson before every topic's challenges

**Status:** BUILT (2026-09-19). All 19 topics have a machine-verified lesson; §9 records what changed from the design while building.

---

## 1. The gap this closes

PRD goal G1 is to *teach* Java + DSA "through hands-on coding games". Until now
SkillQuest only *tested*: a student who has never seen a loop gets a loop
problem and three hints. That is practice, not learning, and it is exactly
where beginners quit.

The fix must not contradict the PRD's own diagnosis ("passive learning →
dropout — watching is not doing"). So: **no videos, no pages of notes.** Every
lesson step asks the student to *do* something.

## 2. The method: PRIMM

Each topic (skill) gets one ~5-minute lesson, then its existing levels. The
lesson follows **PRIMM — Predict, Run, Investigate, Modify, Make** (Sentance,
Waite & Kallia, 2019), a published, classroom-tested method for teaching
programming. Its core idea: novices learn to *read and trace* code before they
write it (Lister et al., 2004 showed many novices who can't trace can't write),
and predicting before seeing is retrieval practice, which beats re-reading
(Roediger & Karpicke, 2006).

| Step | PRIMM | What the student does |
|---|---|---|
| **Hook** | — | A tiny real scenario ("Infosys's test asks you to count vowels…") and what they'll be able to do after 5 minutes |
| **Predict** | Predict | Reads a short program and taps what it will print. A wrong option explains *that specific* misconception |
| **Watch it run** | Run | Steps through the same program line by line: variables, arrays, the call stack and the output update, with Nova narrating |
| **Understand** | Investigate | 2–4 key ideas and the pattern to remember |
| **Check** | Predict | A second, trickier prediction aimed at the classic mistake for this topic |
| **Try it** | Modify | The program with one line missing — they write it |
| **Prove it** | Make | The topic's first level (the existing vault / tests / XP) |

## 3. The "wow": traces recorded from the real JVM

The Watch-it-run animation is **not hand-drawn**. `content/tools/Tracer.java`
runs the program under the Java Debug Interface (JDI) — the API debuggers use —
and single-steps every line, recording the line, each stack frame's local
variables, the program's own objects (for linked lists and trees), and the
output so far. So the animation can never show a value the program didn't
actually have. This is authoring-time only: the recorded trace is stored with
the lesson, so production never runs a debugger.

## 4. Correctness, the same way as levels

`content/build-lessons.mjs` (like `verify-levels.mjs`):

- runs every Predict program and requires **exactly one** option to equal the
  real output (so the "right answer" is never a typo, and no distractor is
  accidentally right);
- regenerates every trace with the Tracer;
- runs the Try-it program with **each accepted answer** and requires the
  expected output, and confirms the blank (nothing filled in) does *not* produce
  it;
- compiles everything for Java 11.

## 5. Adaptive, not one-size-fits-all

- **Tested out** in the onboarding quiz → the topic isn't in the plan at all.
- **Mastery already ≥ 60%** → the lesson opens with "You seem to know this —
  quick recap, or straight to the challenge?"
- **Answers are evidence — but only after the teaching.** The first answer to a
  question that comes *after* the Understand step updates the same BKT mastery
  estimate as levels, with multiple-choice parameters: guess 0.4 (options can be
  eliminated), slip 0.2 (the questions are deliberate traps) and **no learning
  credit** (answering isn't practice). A right answer takes a new student from
  0.20 to 0.33; the levels are still needed to reach mastery (0.95). The first
  Predict, made *before* anything is taught, is logged but never counted (§9).
- **Stuck in a level?** The play screen links back to the topic's lesson.

## 6. Answers stay on the server

The browser receives the options without knowing which is right (same
principle as hidden tests). The student's choice is sent to the server, which
checks it, records it and returns the explanation. Try-it answers are checked
against the accepted list first; an answer we didn't list is **actually run**
(through the same executor as levels) and accepted if it produces the right
output — so a correct alternative is never marked wrong.

## 7. Flow

- Opening a topic (from the map, constellation, dashboard or placement) opens
  its lesson if it isn't finished; otherwise its next unfinished level.
- "Skip to the challenge" is always available (logged). Students are adults;
  forcing a lesson on someone who knows the topic is how you lose them.
- The lesson ends by opening the topic's first level. Completed lessons can be
  replayed from the play screen.

## 8. Data

- `lessons` (skill_id, version, content jsonb) — seeded from
  `content/lessons/<skill>.json`, like levels.
- `user_lessons` (user, skill, status started/completed/skipped, first-try
  correct / total, try-it attempts, timestamps). RLS on both.
- Events: `lesson_start`, `lesson_answer`, `lesson_fill`, `lesson_complete`,
  `lesson_skip` — so the UAT can report lesson completion and whether
  lesson-takers do better on the first level than skippers (observational only;
  not a controlled experiment).

## 9. As built (2026-09-19) — and what changed from the design

**Files.** Content: `content/lessons/<skill>.json` (19), `content/build-lessons.mjs`,
`content/tools/Tracer.java` + `TraceBoot.java`. Backend: `src/lessons/content.ts`
(+ tests), `src/lessons/progress.ts`, `src/routes/lessons.ts`, migration
`20260919090000_lessons`. Frontend: `screens/LessonScreen.tsx`,
`features/learn/{TracePlayer,PredictStep,FillStep,CodeView,Inline,types}`.

**What the tracer records.** At every line: the line, every stack frame with its
locals (and `this`), the program's own objects reachable from them, the output
so far, and — via JDI method-exit events — **what a method just returned**. So
the recursion lesson visibly unwinds: `fact()` returns 1, 2, 6, then 24 to
`main()`. Linked lists are drawn as a chain (#1 → #2 → #3 → null). Object ids
are renumbered 1, 2, 3… so traces are deterministic: `build-lessons.mjs` (no
flags) re-records every trace and requires it to match byte for byte.

**Changed while building (and why):**
1. *Pre-teaching answers no longer count.* Testing on the real API, one wrong
   first prediction dropped a student's Loops estimate from 28% to 6%. In PRIMM
   that first prediction comes *before* any teaching — being wrong is expected —
   so it now only gets logged. Only questions after the Understand step count,
   with a higher slip rate (0.2) because they are deliberately tricky.
2. *Answer order shuffled.* The first draft put the right answer at A for every
   first question; students would learn "pick A" within two lessons. Options are
   now shuffled with a fixed seed per question (right answers: A 9, B 12, C 7,
   D 10 of 38) and the builder recomputes the answer index.
3. *Try-it steps test several inputs.* Every fill-in program checks the line
   against multiple cases (three pairs of numbers, four targets, three arrays…)
   so typing the literal answer (`20`, `"desserts"`) cannot pass — only a
   genuinely correct line does. Where that needs a loop or array before those
   are taught, the scaffold is commented ("tries three pairs") and never edited.
4. *Font ligatures off in lesson code.* The code font drew `<=` as `≤` and `i++`
   as a joined glyph — confusing for someone learning what to type.
5. *Returns narrated.* After a call returns, the program is back on the calling
   line, whose narration describes the call again; Nova now says "square()
   returned 9, back in main()" instead.

**Verified.** Every lesson built and re-checked clean (answers, traces, fill-ins
including listed wrong answers). Real API: answers never reach the browser; the
first answer only is recorded (atomic insert-if-absent); an unlisted-but-correct
fill (`i != 11`) is run on Paiza and accepted (~4 s); lesson → first level →
replay-lesson button works; demo mode plays all 19 lessons offline.
Deep link for demos: `?lesson=<skillId>` (e.g. `?demo&lesson=recursion`).

**Honest limits.** Lesson content is written by us from general Java knowledge;
once the course resources arrive it should be checked against the syllabus
order and wording. Traces were recorded with JDK 26 (`--release 11`); a very
different JDK could step lines slightly differently, so re-run
`build-lessons.mjs --fill` if the check ever fails on another machine. Whether
lessons improve first-level success is an *observational* question for the UAT
(lesson-takers vs skippers), not a controlled experiment.

## 10. Likely viva questions

**Q: Isn't this just adding tutorials — the passive learning you criticised?**
No step is passive. Every step is a prediction, a trace the student drives, or
code they write; there is no video and no long text.

**Q: Why PRIMM and not just explanations?**
Predicting before seeing forces retrieval and exposes misconceptions early;
tracing before writing matches the evidence that reading ability precedes
writing ability in novices.

**Q: How do you know the animations are correct?**
They are recorded from the real JVM through JDI, and the build script
re-records them and re-checks every expected output before content ships.

**Q: Why do lesson answers barely move mastery?**
A multiple-choice answer is weak evidence of being able to *write* the code,
so it gets a high guess rate and no learning credit. Mastery is earned in the
levels.

**Q: Why doesn't the first prediction count at all?**
It is asked before anything is taught. Its job is to make the student commit to
a mental model so the trace can confirm or correct it — penalising a wrong guess
there would punish exactly the behaviour PRIMM wants.

**Q: Couldn't a student just type the expected output into the fill-in?**
No — every Try-it program checks the line against several inputs, so only a
line that works in general produces the expected output.

**Q: How does the trace know what a method returned?**
The tracer subscribes to the JVM's method-exit events through JDI, which carry
the return value; it attaches that to the next recorded frame.
