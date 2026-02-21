# Design — routes-cli Ralph Plan

> Standalone design document. Readable without reference to other files in this spec.
>
> **Objective:** Produce a `PROMPT.md` (and supporting `PROGRESS.md`) that enables
> `ralph run` to execute all 32 improvement tasks from `IMPROVEMENT_PLAN.md`
> autonomously, with per-task commits, build verification, skip-on-blocker handling,
> and a well-defined completion signal.

---

## Overview

`IMPROVEMENT_PLAN.md` contains a 32-task, 5-phase improvement roadmap for routes-cli.
The goal is to turn this into a **ralph-executable plan**: a `PROMPT.md` that ralph
feeds to Claude on every loop iteration, combined with a `PROGRESS.md` state file
that tracks what has been done, what was skipped, and what's next.

Ralph's loop model:
```
while not LOOP_COMPLETE:
    cat PROMPT.md | claude --continue
```

Claude sees the same prompt every iteration and relies on file state (PROGRESS.md)
and git history to know where it left off. The PROMPT.md must therefore encode a
**deterministic algorithm** — not a description of work, but a precise procedure
Claude follows every single iteration.

---

## Detailed Requirements

| # | Requirement |
|---|-------------|
| R1 | Single `PROMPT.md` at repo root covers all 32 tasks across all 5 phases |
| R2 | `PROMPT.md` references `IMPROVEMENT_PLAN.md` by path; ralph reads it for task details |
| R3 | Progress tracked in `PROGRESS.md` (separate file, updated each iteration) |
| R4 | After completing each task: run `pnpm build`; if it passes, commit; else mark task skipped |
| R5 | Commit messages use Conventional Commits format with task ID: `type(scope): description (TASK-XXX)` |
| R6 | When a task is blocked, skip it, continue with next, report all skipped at the end |
| R7 | If a task's dependency was skipped, auto-skip that task too |
| R8 | TASK-001 is pre-flagged as MANUAL in `PROGRESS.md` — ralph never attempts it |
| R9 | Ralph emits `<promise>LOOP_COMPLETE</promise>` only when all non-manual tasks are done or skipped |
| R10 | Commit only changed files (not `git add -A`) |
| R11 | No co-author lines in commits |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  ralph run                                               │
│                                                          │
│  ┌──────────┐  reads  ┌─────────────────────────────┐  │
│  │ PROMPT.md│ ──────► │  Algorithm (per iteration)  │  │
│  └──────────┘         │  1. Read PROGRESS.md         │  │
│                       │  2. Find next PENDING task   │  │
│  ┌──────────┐  reads  │  3. Read task from           │  │
│  │PROGRESS  │ ──────► │     IMPROVEMENT_PLAN.md      │  │
│  │  .md     │         │  4. Execute task             │  │
│  └────┬─────┘         │  5. pnpm build               │  │
│       │ writes        │  6. Commit (if build passes) │  │
│       │               │  7. Update PROGRESS.md       │  │
│  ┌────▼─────┐  reads  │  8. Check if done            │  │
│  │IMPROVE-  │ ──────► │     → emit LOOP_COMPLETE     │  │
│  │MENT_PLAN │         └─────────────────────────────┘  │
│  │  .md     │                                           │
│  └──────────┘                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### 1. PROMPT.md

The static instruction file read by ralph on every iteration. Contains:

- **Objective statement** — what the overall goal is
- **Pre-flight check** — read PROGRESS.md; if it doesn't exist, initialize it
- **Main algorithm** — numbered steps Claude follows each iteration
- **Skip rules** — when and how to skip tasks
- **Dependency table** — which tasks to auto-skip if a dependency was skipped
- **Commit rules** — format, what to stage, no co-author
- **Completion condition** — when to emit `<promise>LOOP_COMPLETE</promise>`

Length target: under 120 lines (concise enough for ralph's context budget).

### 2. PROGRESS.md

The mutable state file. Updated by Claude at the end of each iteration.

#### Schema

```markdown
# Ralph Progress

## Status

| Task    | Status  | Skip Reason                  |
|---------|---------|------------------------------|
| TASK-001 | MANUAL | Requires human: git history rewrite |
| TASK-002 | PENDING |                              |
| TASK-003 | PENDING |                              |
| ...     | ...     | ...                          |

## Skipped Tasks Report
(populated at completion)

## Notes
(free-form scratch space for ralph)
```

#### Status Values

| Value | Meaning |
|-------|---------|
| `PENDING` | Not yet started |
| `COMPLETE` | Done and committed |
| `SKIPPED` | Blocked — could not complete |
| `MANUAL` | Requires human action — ralph never attempts |

### 3. IMPROVEMENT_PLAN.md (read-only reference)

Ralph reads this file to get the detailed steps, acceptance criteria, and code
snippets for each task. Never modified by ralph.

---

## Data Models

### Task Execution Record (in PROGRESS.md)

```
| TASK-XXX | STATUS | [skip reason if SKIPPED] |
```

### Dependency Map (hardcoded in PROMPT.md)

```
TASK-021 → requires TASK-020
TASK-022 → requires TASK-011
TASK-023 → requires TASK-021
TASK-026 → requires TASK-022
TASK-035 → requires TASK-023
TASK-037 → requires TASK-022, TASK-023
TASK-016 → requires TASK-013 (implicit)
```

### Task Execution Order

Ralph works through tasks in this fixed sequence:
```
002, 003, 010, 011, 012, 013, 014, 015, 016,
020, 021, 022, 023, 024, 025, 026,
030, 031, 032, 033, 034, 035, 036, 037,
040, 041, 042, 043, 044, 045, 046,
050, 051, 052, 053
```
(TASK-001 pre-set to MANUAL; never in the queue.)

---

## PROMPT.md Algorithm (detailed)

Each ralph iteration follows this exact procedure:

```
1. INITIALIZE
   - If PROGRESS.md does not exist → create it with all tasks PENDING
     (TASK-001 pre-set to MANUAL)
   - Read PROGRESS.md

2. FIND NEXT TASK
   - Scan tasks in execution order for first PENDING task
   - If none found → go to step 7 (COMPLETE)

3. CHECK DEPENDENCIES
   - Look up dependency map for this task
   - If any dependency has status SKIPPED → mark this task SKIPPED
     with reason "dependency <TASK-XXX> was skipped"
   - Write updated PROGRESS.md
   - Go back to step 2

4. EXECUTE TASK
   - Read the task section from IMPROVEMENT_PLAN.md
   - Implement the task following its steps and acceptance criteria
   - On any unrecoverable error → mark task SKIPPED with reason
   - Write updated PROGRESS.md (status = SKIPPED)
   - Go back to step 2

5. VERIFY
   - Run `pnpm build`
   - If build fails → revert changes, mark task SKIPPED with reason
     "build failed after implementation"
   - Write updated PROGRESS.md
   - Go back to step 2

6. COMMIT
   - Stage only files changed by this task
   - Commit with message: `type(scope): description (TASK-XXX)`
   - Mark task COMPLETE in PROGRESS.md
   - Write updated PROGRESS.md
   - Exit iteration (ralph will start next iteration)

7. ALL DONE
   - All tasks are COMPLETE, SKIPPED, or MANUAL
   - Write final Skipped Tasks Report section in PROGRESS.md
   - Output: <promise>LOOP_COMPLETE</promise>
```

---

## Error Handling

| Scenario | Ralph Action |
|----------|-------------|
| `pnpm build` fails after task | Revert all changes for that task; mark SKIPPED; continue |
| Task has unresolvable missing dependency (e.g. missing env var) | Mark SKIPPED with reason; continue |
| Dependency task was SKIPPED | Auto-mark current task SKIPPED; continue |
| TASK-001 encountered | Already MANUAL in PROGRESS.md; skip silently |
| All tasks done | Emit `<promise>LOOP_COMPLETE</promise>` |
| `max_iterations` (100) reached | Ralph stops; incomplete tasks remain PENDING |

---

## Acceptance Criteria (Given-When-Then)

**AC1 — Initialization**
- Given: `PROGRESS.md` does not exist
- When: ralph runs for the first time
- Then: `PROGRESS.md` is created with all 32 tasks listed; TASK-001 is MANUAL; all others PENDING

**AC2 — Task completion**
- Given: a PENDING task with no unmet dependencies
- When: ralph completes it and `pnpm build` passes
- Then: task is COMPLETE in PROGRESS.md; a commit exists with the correct Conventional Commits message

**AC3 — Skip on build failure**
- Given: ralph implements a task but `pnpm build` fails
- When: the build error cannot be resolved
- Then: changes are reverted; task is SKIPPED; ralph moves to the next task

**AC4 — Dependency auto-skip**
- Given: TASK-020 is SKIPPED
- When: ralph reaches TASK-021
- Then: TASK-021 is marked SKIPPED with reason "dependency TASK-020 was skipped"; TASK-023, TASK-035, TASK-037 are also auto-skipped downstream

**AC5 — Manual task**
- Given: TASK-001 is MANUAL in PROGRESS.md
- When: ralph encounters it in the task queue
- Then: ralph never attempts it; moves immediately to next task

**AC6 — Completion**
- Given: all tasks are COMPLETE, SKIPPED, or MANUAL
- When: ralph checks for next PENDING task
- Then: ralph outputs `<promise>LOOP_COMPLETE</promise>` and the loop terminates

**AC7 — Idempotency**
- Given: ralph is interrupted mid-run and re-run
- When: it reads existing PROGRESS.md
- Then: it resumes from the first PENDING task without re-doing completed tasks

**AC8 — Commit format**
- Given: TASK-003 is completed
- When: ralph commits
- Then: commit message matches pattern `chore(tooling): add Node.js version constraints (TASK-003)`

---

## Testing Strategy

Since this is a planning artifact (PROMPT.md + PROGRESS.md), testing is manual:

1. **Dry run**: Review PROMPT.md manually against each scenario in AC1–AC8
2. **First iteration smoke test**: Run `ralph run` once; verify PROGRESS.md is created correctly
3. **Completion test**: After all tasks run, verify `<promise>LOOP_COMPLETE</promise>` is emitted
4. **Dependency propagation**: Manually set a task to SKIPPED in PROGRESS.md; verify downstream tasks auto-skip

---

## Appendices

### A. Technology Choices

| Choice | Rationale |
|--------|-----------|
| Single PROMPT.md | Simplest; ralph.yml already configured for one file |
| PROGRESS.md (markdown table) | Human-readable; easy for Claude to parse and update |
| Reference IMPROVEMENT_PLAN.md | Single source of truth; PROMPT.md stays under 120 lines |
| `pnpm build` for verification | Already the project's standard build command |
| Conventional Commits | Already planned in TASK-041; establishes discipline early |

### B. Alternative Approaches Considered

**Per-phase PROMPT.md files**: More granular control but requires manual re-runs per phase.
Rejected because user wants a single autonomous run.

**Inline all task details in PROMPT.md**: Self-contained but PROMPT.md would be ~2000 lines —
too large for consistent context in every iteration. Rejected in favor of file reference.

**Progress via git log only**: Ralph checks `git log` to determine what's done. Fragile —
depends on exact commit message format matching. Rejected in favor of explicit PROGRESS.md.

### C. Research References

- `specs/complete-improvement-plan/research/ralph-mechanics.md`
- `specs/complete-improvement-plan/research/task-dependency-graph.md`
- `ralph.yml` — completion_promise: "LOOP_COMPLETE", max_iterations: 100
