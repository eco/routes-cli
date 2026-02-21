# Requirements — Complete IMPROVEMENT_PLAN.md

> Q&A record — appended in real time during requirements clarification

---

## Q1

**What does "complete" mean for IMPROVEMENT_PLAN.md? Which of these best describes your goal (or is it something else)?**

a) Find and add tasks that are missing (gaps in coverage)
b) Add progress tracking / status markers so the plan can be used as a living document
c) Fill in tasks that are only partially specified
d) Add entirely new phases or areas not yet covered
e) Something else

**A1:** It's the initial plan I had — we just need to convert it to a proper ralph plan so it can be run with `ralph run`.

---

## Q2

**Should the PROMPT.md cover all 32 tasks across all 5 phases at once, or do you want separate PROMPT.md files per phase (or per task)?**

Ralph is configured with `max_iterations: 100` and reads a single `PROMPT.md`. The plan has 32 tasks spanning 5 sequential phases. Options:

a) One PROMPT.md for the **entire plan** — ralph works through all phases sequentially
b) One PROMPT.md **per phase** — you run ralph separately for each phase
c) One PROMPT.md **per task** — maximum control, most granular

**A2:** One PROMPT.md for the entire plan (option a).

---

## Q3

**Should ralph commit after each task, after each phase, or not at all (leaving commits to you)?**

**A3:** Commit after each task.

---

## Q4

**When ralph hits a blocker on a task (e.g. a build error it can't resolve, or a missing secret like `FORK_RPC_URL`), what should it do?**

a) Stop immediately and report the blocker (you fix it, then re-run)
b) Skip the blocked task, continue with the next one, and report all skipped tasks at the end
c) Retry up to N times, then stop

**A4:** Skip the blocked task, continue, report all skipped tasks at the end (option b).

---

## Q5

**Some tasks have explicit dependencies (e.g. TASK-021 depends on TASK-020, TASK-026 depends on TASK-022). If a dependency task was skipped or failed, should ralph also skip the dependent tasks automatically?**

**A5:** Yes — skip dependent tasks automatically if their dependency was skipped/failed.

---

## Q6

**How should ralph track its progress across loop iterations so it knows which task to pick up next if it's interrupted and re-run?**

a) Maintain a checklist inside `IMPROVEMENT_PLAN.md` itself (update `[ ]` → `[x]` as tasks complete)
b) Maintain a separate `PROGRESS.md` or `.ralph/progress.json` file
c) Rely solely on git commits — ralph inspects recent commits to determine where it left off

**A6:** Separate progress file (option b).

---

## Q7

**TASK-001 involves potentially destructive git history rewriting (BFG / git filter-repo) and the plan explicitly says "do NOT push — hand off to repository owner." Should ralph attempt TASK-001 at all, or skip it and flag it as a required manual step?**

**A7:** Skip it entirely, flag as required manual step.

---

## Q8

**Should PROMPT.md contain all task details inline, or reference `IMPROVEMENT_PLAN.md` by path and instruct ralph to read it?**

The plan is 1641 lines — inlining everything makes PROMPT.md very long, but referencing keeps it concise and the source of truth in one place.

a) Reference `IMPROVEMENT_PLAN.md` — ralph reads it at the start of each loop iteration
b) Inline key details — PROMPT.md is self-contained

**A8:** Reference `IMPROVEMENT_PLAN.md` (option a).

---

## Q9

**After completing each task, should ralph run a verification step before committing (e.g. `pnpm build` to confirm nothing is broken)?**

**A9:** Yes — verify with `pnpm build` before each commit.

---

## Q10

**What commit message format should ralph use? Conventional Commits are already mentioned in TASK-041 (CONTRIBUTING.md). Should ralph use them now too?**

e.g. `feat(security): add Node.js version constraints (TASK-003)`

**A10:** Yes — Conventional Commits with task ID suffix.








