# Summary — routes-cli Ralph Plan

## Artifacts

| File | Purpose |
|------|---------|
| `PROMPT.md` | Static 96-line algorithm fed to Claude every ralph iteration |
| `PROGRESS.md` | Mutable state: 36 tasks with status MANUAL / PENDING / COMPLETE / SKIPPED |
| `IMPROVEMENT_PLAN.md` | Source of truth for task details (read-only, never modified by ralph) |
| `specs/complete-improvement-plan/design.md` | Full design document |
| `specs/complete-improvement-plan/plan.md` | Implementation plan (this session) |
| `specs/complete-improvement-plan/research/ralph-mechanics.md` | Ralph loop mechanics research |
| `specs/complete-improvement-plan/research/task-dependency-graph.md` | Full dependency graph |

## Overview

`IMPROVEMENT_PLAN.md` has been converted into a ralph-executable plan. Ralph will
work through 35 tasks (TASK-001 is pre-flagged MANUAL) across 5 phases, committing
after each with Conventional Commits messages, skipping on build failures, and
auto-skipping dependent tasks when a dependency fails.

## How to Run

```bash
ralph run
```

Ralph reads `PROMPT.md` every iteration, checks `PROGRESS.md` for the next PENDING
task, implements it using `IMPROVEMENT_PLAN.md` for details, runs `pnpm build`, commits,
and loops. It stops when it outputs `<promise>LOOP_COMPLETE</promise>`.

## Manual Step Required After Ralph Completes

**TASK-001 — Audit and rotate exposed private keys** is flagged MANUAL.
See `IMPROVEMENT_PLAN.md §TASK-001` for exact steps. Perform this after `ralph run`
completes or in parallel with it (it is independent of all other tasks).

## Suggested Next Steps

1. Run `ralph run` — the plan is ready to execute
2. Monitor `PROGRESS.md` to track progress
3. After ralph completes, perform TASK-001 manually
4. Review the Skipped Tasks Report in `PROGRESS.md` and address any blockers
