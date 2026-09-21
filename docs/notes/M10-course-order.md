# M10 — Taught before tested: every question uses only what has been taught

**Status:** BUILT (2026-09-21). Found by the team while testing the live site.

## 1. What was noticed

Testing with a fresh account, a teammate hit this in **lesson 1** (*Java basics:
variables and output*):

```java
int[] as = {5, 10, 7};
int[] bs = {3, 20, 0};
for (int i = 0; i < 3; i++) {
    int a = as[i];
    int b = bs[i];
    System.out.println("Sum: " + ____);   // answer: (a + b)
}
```

The student has learned variables, `int`, `String` and `println`. To answer, they
had to read **arrays, a `for` loop and indexing**, topics 4 and 6 of the course.
The teammate's point was sharper still: check *every* question for this, not just
this one.

## 2. Why it happened

The loop was deliberate. The server accepts any answer that prints the right
output, so with only `a = 5, b = 3` a student could type `8` and "pass" without
learning anything. Running the line on three pairs of numbers stopped that, but
the cost was a first lesson that reads like lesson six. Lessons 2 and 3 used the
same trick.

The rest had a different cause. Several topics used something shown **earlier in
the course list** that was not a declared **prerequisite**. The roadmap engine
orders topics by the student's goal, so only a prerequisite is *guaranteed* to
come first. For the higher-studies goal the old graph really did put Collections
(step 11) before OOP-advanced (step 16), so those students would have met
`implements Comparator` before interfaces were taught.

## 3. The rule, and how it is enforced

> No lesson or level may use a topic the student hasn't been taught. The code a
> student **reads** or must **write** uses only what the topic itself and its
> prerequisites (directly or indirectly) teach.

`content/check-order.mjs` enforces it and runs in CI. It maps each construct to
the topic that teaches it: `%` and casts, `if`/`switch`, loops, your own methods,
arrays, String methods, classes, inheritance/interfaces, exceptions, recursion
(overload-aware, so `max(max(a, b), c)` isn't mistaken for it), collections, and
self-referencing nodes. It also flags constructs the course never teaches:
lambdas and method references, streams, `enum`/`record`/`var`, and generic class
definitions. It reads:

- **lessons:** every predict, trace and fill program, pattern boxes, and code
  written inside the text (key ideas, prompts, hints, concept questions, options);
- **levels:** starter code, the model solution (what the student must be able to
  write), and code in the statement and hints.

Reading input with `Scanner` is given in every level and isn't a topic, so it is
not checked. Neither is `main(String[] args)`.

The checker was tested against the problem it exists for. With the old lesson 1
and the old varargs level put back, it reported both, marked "later".

## 4. Keeping fill-ins honest without loops: hidden cases

A fill step may now carry **cases**: other values for variables declared in main.

```json
"cases": [ { "a": "10", "b": "20" }, { "a": "7", "b": "0" } ]
```

The student sees one simple program (`int a = 5; int b = 3;`). The build script
generates a **check program** that runs their line for the values on screen and
for each case, each in its own `{ block }` with a marker line between, plus the
expected output. It verifies that every accepted answer passes every case, every
listed wrong answer fails (now including `8`, `7.5` and `true`), and no case
merely repeats the shown one. The server runs that one program for any answer it
hasn't seen before.

When an answer is right on screen but wrong for a hidden case, the student sees:

> **Almost.** It works for the numbers above, but we also tried `a = 10, b = 20`:
> your line printed `Sum: 8` — it should print `Sum: 30`.
> Use the variables, not the answer — then your line works for any numbers.

That message *is* lesson 1's point: a variable lets one line work for any value.
The cases and the check program never reach the browser, like a level's hidden
tests.

## 5. Every change

**Lessons 1–3:** fill-ins rewritten with only what each lesson has taught, plus
hidden cases (lesson versions bumped to 2). **Sorting lesson:** a key idea no
longer mentions `Collections.sort`.

**Prerequisite graph** (`content/skills.json`, mirrored in the frontend and now
tested to match). Each edge records an order the course list already shows:

| Topic | Now also needs | Because its questions use |
|---|---|---|
| Arrays | Methods | varargs is a method taking an array (arrays-05) |
| OOP basics | Strings | objects hold Strings; commands compared with `.equals()` |
| Exceptions | OOP advanced (was OOP basics) | your own exception `extends Exception` |
| Collections | OOP advanced (was OOP basics + Arrays) | a Comparator is an interface you implement |
| Stacks & queues | Collections | Java's stack and queue are `ArrayDeque` |

**Levels (56 → 57):**

- `methods-04` is now **Overloaded Max** (pure Methods). **Varargs** moved to the
  new **`arrays-05`**, because a varargs parameter *is* an array. Keeping the
  `methods-04` id avoids an orphaned row in the database.
- `collections-03` taught `Comparator.comparing(String::length)`, a method
  reference, and the course deliberately excludes lambdas (M8 §5). It is
  redesigned: the student writes the rule in a class that
  `implements Comparator<String>`.
- `collections-01`: the model solution used `Integer::sum`; it now uses
  `getOrDefault`, which is what its own hint already taught.
- `oop-advanced-01/02/03` held objects in an `ArrayList` (Collections is four
  topics later); they now use an array (and `Arrays.sort` for Comparable).
- `arrays-02`, `searching-01`, `sorting-01`, `sorting-02`, `time-complexity-02`:
  the model solutions joined output with `StringBuilder` (a Strings topic); they
  now print directly. Their expected outputs are byte-for-byte unchanged.

**Effect on real roadmaps** (the actual engine run on the real content, old graph
against new): **service and product placement are unchanged**. **Higher studies**
is reordered so nothing comes before what it needs, at the cost of 6 weeks
instead of 5 (topics pack into weeks differently).

**Knowledge Constellation.** The new edges deepen the longest chain from 9
columns to 12. The map's width now comes from the number of columns (84 px each
on the full screen, 64 px on the home card) instead of a fixed width, so it
scrolls a little further rather than squeezing stars together. Measured on a
390 px phone: the full screen has **no overlapping stars** (1008 × 544 px). On
the home card the tightest pair went from 7 px apart (old graph) to 31 px.

**Offline demo.** Its made-up progress hard-coded Arrays as "unlocked" while
Methods was unfinished, which was valid under the old graph and wrong under the
new one. It now records only the student's history and works out what is
unlocked from the graph, with a test that fails if the demo ever opens a skill
before its prerequisites.

## 6. Verified

57/57 levels and 20/20 lessons compiled and run; the course-order check is clean,
and it catches the original problems when they are put back. Frontend 79 tests,
backend 92, AI service 19. The dev database seeds with the new graph and passes
the seed's own read-back check.

## 7. Viva questions

**Q: How do you know no question uses a topic the student hasn't learned?**
It's checked by a program, not by eye, and it runs in CI on every change. For
every lesson step and level it reads the code the student sees or must write,
works out which constructs are used, and compares them with the topics the
student is guaranteed to have finished, meaning that topic and everything it
requires. We tested the checker by putting the original faulty lesson back; it
caught it.

**Q: Why "prerequisite", not just "earlier in the course"?**
Because the roadmap is personalised. It orders topics by the student's goal, so
"earlier in the list" isn't a promise. Only a prerequisite always comes first.
For the higher-studies goal the old graph really did schedule Collections five
topics before OOP-advanced.

**Q: Without a loop, how do you stop a student typing `8` instead of `(a + b)`?**
Hidden cases, the same idea as a level's hidden tests. The student sees
`a = 5, b = 3`; the checker also runs their line with `a = 10, b = 20` and
`a = 7, b = 0`. Typing `8` works for the first and fails the second, and the
screen shows exactly that, which teaches why variables exist.

**Q: Didn't adding prerequisites change students' plans?**
We measured it by running the real engine on the real content. Two of the three
goal types are unchanged. Higher studies is reordered to respect what each topic
needs, and gets one week longer. That trade is correct: a plan that is a week
longer but never teaches out of order.
