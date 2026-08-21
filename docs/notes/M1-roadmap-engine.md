# M1 Notes — Part 1: The Roadmap Engine

> The algorithmic heart of SkillQuest, and the answer to "how does the goal
> actually personalize the plan?" Built as pure, tested logic. This is Part 1 of
> M1; auth + onboarding + the frontend screens follow.

---

## 1. What was built

```
ai-service/app/
├── roadmap.py     # ★ the pure algorithm (no DB, no framework) — fully unit-tested
├── db.py          # reads the skill graph + goal weights from Postgres (psycopg)
└── main.py        # POST /ai/roadmap endpoint = db.py + roadmap.py, behind the key
ai-service/tests/
└── test_roadmap.py  # 7 tests incl. the "goal changes the plan" acceptance test
```

Separating the **pure algorithm** from **database access** is deliberate: the algorithm can be tested exhaustively on tiny hand-made graphs (no database, instant), while `db.py` just feeds it real data.

## 2. How it works — 5 steps

Input: the skill graph (nodes + prerequisite edges), the goal's tag-weight vector, the skills the student tested out of, and hours/week.

1. **Drop tested-out skills.** If the quiz says the student knows a skill, remove it. Its dependents no longer need it as a prerequisite.
2. **Weight each skill from its tags.** For the chosen goal, each skill takes the **highest weight among its tags** (unlisted tags = neutral 1.0). Max — not a product — so a skill can't be inflated just for having many tags.
3. **Drop optional skills.** A skill weighted 0 is dropped *only if no kept skill depends on it*. We compute the "required closure" — every kept skill plus all its ancestors — so a zero-weight skill that a kept skill needs is still scheduled.
4. **Weighted topological sort.** Kahn's algorithm with a priority queue: repeatedly schedule an "unlocked" skill (all prerequisites already placed), and when several are unlocked at once, take the **highest-weighted** first (ties broken by display order, then id, so it's deterministic). Prerequisites are *never* violated — the goal only reorders *choices among already-unlocked* skills.
5. **Pack into weeks.** Walk the ordered skills, filling a week up to `hours_per_week × 60` minutes; when the next skill won't fit, start a new week. Because we never reorder, a skill's prerequisites always land in an earlier (or same, earlier-position) slot.

## 3. Proof it works (live, on the real seeded graph)

Same 19 skills, same 6 hrs/week, only the goal differs:

| | service_placement | product_placement |
|---|---|---|
| Week 2 | arrays, strings, oop-basics, oop-advanced | arrays, **recursion, time-complexity, searching** |
| Week 4–5 | **trees + interview-patterns last** | interview-patterns by week 4 |

The service goal front-loads fundamentals and pushes DSA-heavy topics (trees, patterns) to the end; the product goal pulls recursion/complexity/searching forward. **Different plans from the same graph — with every prerequisite still respected.** This is PRD acceptance criterion F2, demonstrated end to end.

## 4. Decisions worth knowing (viva)

- **Why max (not product) of tag weights?** A product would reward a skill just for carrying several tags and would drift wildly in scale. Max gives a clean "this skill's best reason to be prioritized," bounded by the weights themselves.
- **Why is it deterministic?** No randomness, no ML here. Given the same inputs it always yields the same plan — which is exactly what you want to *explain* in a viva ("the goal changes priorities; prerequisites are inviolable"). It's a weighted topological sort, a classic algorithm.
- **How are prerequisites guaranteed?** A skill is only ever placed after all its prerequisites (that's what topological sort means); the weighting only affects the order among skills that are *already* free to schedule.
- **What if the graph had a cycle?** The sort can't place every node and the engine raises — but the seed script already refuses to load a cyclic graph, so it can't happen at runtime.

## 5. Likely viva questions

**Q: "How is the roadmap personalized — isn't it the same for everyone?"**
No. Three inputs change it: the quiz (skills you test out of are dropped), your hours/week (how many skills fit per week), and your goal. The goal carries a weight per skill-tag; a weighted topological sort schedules higher-weighted skills earlier when there's a choice. We can show two students with identical quiz results and hours but different goals getting different plans.

**Q: "Is there a neural network deciding the order?"**
No — and that's on purpose. It's a deterministic weighted topological sort, so it's fully explainable and reproducible. ML is used elsewhere (disengagement risk), where it's actually warranted.

**Q: "What stops it from putting recursion before loops?"**
The prerequisite edges. Recursion depends (transitively) on loops, and a topological sort never places a skill before something it depends on. The goal weights can reorder *independent* skills, never dependent ones.

## 6. What's next in M1
- [ ] Supabase auth: JWT verification middleware (backend), sign-in (frontend)
- [ ] Onboarding wizard + quiz (persist attempts) → calls the Web API, which calls `/ai/roadmap`
- [ ] Persist the generated roadmap to `roadmaps` / `roadmap_items`
- [ ] Roadmap screen (frontend)
- [ ] `/ai/goal-map` (free-text goal → goalCategory via embeddings)
