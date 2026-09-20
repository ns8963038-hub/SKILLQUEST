# M8 — Aligning SkillQuest with the Java course material

**Status:** BUILT (2026-09-20). §7 records what shipped.

The team supplied four resources (`docs/`): `Java_Complete_Guide.pdf` (48 pages,
25 chapters), `Java_Concepts_in_Detail.pdf` (7 pages), and the same 73-question
OOP question bank as `java_oops_dataset.json` / `.csv`. This note records what
they cover, where SkillQuest already matches, what is genuinely missing, what we
are adding, and what we are deliberately leaving out.

> **Provenance to confirm before the report.** These files came from the team;
> their original source isn't recorded. If any of it is copied from a book,
> website or course, we must cite it. Our own lesson and level text is written
> from scratch either way — the guide is used as a *syllabus and fact-check*,
> not as content to copy.

## 1. How the check was done

1. Extracted both PDFs to text and read every chapter heading (25 chapters, 40+
   sections) and every chapter that overlaps our track in full.
2. Listed our content: 19 skills, 46 levels, 19 lessons, 12 quiz questions.
3. Compared topic by topic, and fact-checked our existing statements against the
   guide (integer division, `==` vs `equals`, pass-by-value, array bounds,
   in-order traversal, stack/queue behaviour, HashMap keys).

## 2. Coverage: the guide's chapters against our track

| Guide chapter | SkillQuest | Verdict |
|---|---|---|
| 1–2 Java platform, JVM/JRE/JDK, bytecode | — | **Gap (concept-only)** — the single most-asked interview question. Add as a lesson concept check, not a coding level |
| 3 Variables, types, operators | java-basics, operators-expressions | ✅ matches; casting/wrappers not covered |
| 4 Control flow | conditionals, loops | ✅ matches; **`switch` missing** |
| 5 Arrays | arrays | ✅ matches; **2-D arrays missing** |
| 6 Strings | strings | ✅ matches; **StringBuilder missing** |
| 7 Methods | methods | ✅ matches (pass-by-value is already our lesson's trap); varargs/overloading thin |
| 8 Classes and objects | oop-basics | ✅ matches; **static vs instance thin** |
| 9 Four pillars | oop-basics, oop-advanced | ✅ matches; **interfaces not explicit** |
| 10 Modifiers, packages | oop-basics (private fields) | ⚠️ partial — acceptable |
| 11 Nested types, enums, records, Object class | — | ⚠️ `equals`/`hashCode` matters for hashing; rest is out of scope |
| 12 Design principles and patterns | — | ❌ out of scope (design, not coding rounds) |
| **13 Exception handling** | — | **❌ BIGGEST GAP — becomes a new skill** |
| 14 Generics | used implicitly in collections | ⚠️ partial; full generics is out of scope |
| 15 Collections | collections, hashing | ✅ matches; **Comparator sorting missing** |
| 16 Lambdas, streams, Optional | — | ❌ out of scope this semester |
| 17–22 Utility APIs, I/O, concurrency, JVM internals, JDBC, ecosystem | — | ❌ out of scope: none can run in our sandbox (no files, no threads worth testing, no DB), and PRD §3 locks the scope |
| 23 Best practices and pitfalls | embedded as lesson traps | ✅ this is exactly what our "Check" steps do |
| 24 Interview Q&A (30 questions) | — | Phase B (see §6) |
| 25 Learning roadmap | — | Confirms our ordering: foundations → OOP → core APIs |

**The other direction:** our DSA half (searching, sorting, linked lists, stacks
and queues, trees, hashing, recursion, complexity, interview patterns) is barely
in the guide — §25.2 only says "implement the classic data structures yourself".
So the two sources complement each other; nothing there needs changing.

## 3. Fact-check result

No contradictions found. Every claim I spot-checked in our lessons and levels
agrees with the guide, including the subtle ones: integer division truncating,
`==` vs `.equals()` on strings, pass-by-value with objects, `a[a.length]`
throwing, in-order traversal of a BST being sorted, `ArrayDeque` for both stack
and queue. The guide's own "common pitfalls" table (ch. 23) lists the traps our
lessons already use.

## 4. What we add now

**A new skill — `exceptions`** (guide ch. 13; also in the question bank):
placed after `oop-basics`, tagged so service-placement goals weight it highly.
One lesson + three levels: try/catch and the exception types, finally and
try-with-resources, and a custom checked exception.

**Seven levels filling named gaps in existing skills:**

| Level | Skill | Guide |
|---|---|---|
| `switch` statement | conditionals | 4.1 |
| 2-D arrays (matrix) | arrays | 5 |
| StringBuilder in a loop | strings | 6.3, Q5 |
| Varargs and overloading | methods | 7.2 |
| Static vs instance members | oop-basics | 8.4 |
| Interfaces | oop-advanced | 9.5, Q6 |
| Sorting with a Comparator | collections | 15.3, Q15 |

That takes us from 46 to **56 levels** and 19 to **20 lessons**.

**The 73-question bank** becomes `content/questions/java-oop.json` (versioned
like the levels) and is used two ways:

1. **Concept checks in lessons.** A new lesson step type asks one or two concept
   questions (MCQ or true/false) *after* the teaching, with the bank's
   explanation shown afterwards. This is what the bank is good for: the theory
   that service-company MCQ rounds test and that code-only levels can't.
2. **Output-prediction items become verified predict steps.** The bank's
   12 output questions are complete runnable programs, so our build script can
   *run* them: we add distractors, and the builder confirms the real output
   matches the bank's answer key. Any mismatch is a bug in the bank, and we'd
   see it immediately.

## 5. What we are deliberately NOT adding

Streams and lambdas, concurrency, JVM internals, file I/O, JDBC, Spring, design
patterns, generics in depth, modules. Reasons, in order: PRD §3 locks the scope;
none of them can be exercised in the code sandbox we have; and placement *coding*
rounds don't test them. They stay in the guide as reading material, and the
report can say exactly that.

## 6. Phase B (only if time remains after the UAT)

A "concept drill": a short MCQ round per skill drawn from the remaining bank
questions, for the theory rounds of service-company tests. It reuses the same
step components, so it is a screen, not an engine. **Not** started before the UAT.

## 7. As built (2026-09-20)

**Content: 46 → 56 levels, 19 → 20 lessons, 19 → 20 skills.**

- New skill `exceptions` (`content/skills.json`, after `oop-basics`, tagged
  `exceptions`+`oop`; goal weights 1.3 service / 0.9 product). Display order was
  renumbered so the map still reads in teaching order.
- New levels: `exceptions-01/02/03` (catch an ArithmeticException; skip bad
  input with NumberFormatException; throw your own checked exception, the
  guide's own `InsufficientFundsException` example), plus `conditionals-04`
  (switch), `arrays-04` (2-D matrix), `strings-04` (StringBuilder),
  `methods-04` (varargs), `oop-basics-03` (static vs instance counter),
  `oop-advanced-03` (interfaces with a default method), `collections-03`
  (Comparator, length then alphabetical).
- New lesson `exceptions` (try/catch/finally traced line by line; the trap is a
  catch that doesn't match the thrown type; the Try-it is a multi-catch).
- **Concept steps**: a new lesson step type. `{"type":"concept","ref":"OOP008"}`
  pulls a theory question from the bank; the builder inlines question, options,
  answer and explanation, and refuses unknown ids or non-MCQ items. Four are in
  use (oop-basics OOP008, oop-advanced OOP027, methods OOP025, exceptions
  OOP066), always placed after the teaching so they count as evidence. The
  browser never receives the answer, exactly like Predict steps.
- **Bank cross-check**: a predict step may carry `"ref"` to an Output Prediction
  item; the builder then runs the bank's own program and fails if the bank's
  answer key disagrees with reality. (Not needed yet — see the finding below.)
- `content/questions/java-oop.json`: the 73 questions imported as versioned
  content (options normalised, answers as indexes, the 12 runnable programs
  split out of their prose). 47 are usable as concept questions; 14 short-answer
  items are reference material for the report and Phase B.

**Findings while aligning**

- **No contradictions.** Every fact I spot-checked in our lessons matched the
  guide. One pleasant surprise: the bank's `OOP065` (`new String("hi")`, `==`
  vs `.equals()`) is the *same* trap our Strings lesson already teaches, with
  the same answer — independent confirmation of our content.
- **Company profiles were left alone.** Exception handling is certainly tested
  by service companies, but our placement coverage claims to be based on
  *published* role requirements, and we have not re-read those JDs. Adding the
  skill to `companies.json` without that evidence would be fabrication; it can
  be added when someone re-checks the postings.
- **Onboarding quiz unchanged** at 12 questions / 4 topics. Longer onboarding
  is the main abandonment risk (PRD §5 F1), and the bank is OOP-only, so it
  would skew the quiz. The bank earns its place inside the lessons instead.

**Verified.** 56/56 levels and 20/20 lessons pass their checkers (every program
compiled for Java 11 and run); backend 72 tests, frontend 26, AI service 19;
production build clean. Seeded to the live database and deployed.
