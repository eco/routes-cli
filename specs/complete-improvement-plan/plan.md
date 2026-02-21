# Implementation Plan — routes-cli Ralph Plan

## Checklist

- [ ] Step 1: Create PROGRESS.md with initial state
- [ ] Step 2: Create PROMPT.md — initialization + pre-flight
- [ ] Step 3: Add main execution algorithm to PROMPT.md
- [ ] Step 4: Add skip, dependency, and completion logic to PROMPT.md
- [ ] Step 5: Smoke-test and validate

---

## Step 1: Create PROGRESS.md with initial state

**Objective:** Create the state file that ralph reads and updates on every iteration.
This is the foundation — without it ralph cannot determine where it is in the plan.

**Implementation guidance:**
- Create `PROGRESS.md` at the repo root
- Add a markdown table with one row per task (32 tasks total)
- Task execution order (from research/task-dependency-graph.md):
  `002, 003, 010, 011, 012, 013, 014, 015, 016, 020, 021, 022, 023, 024, 025, 026,
  030, 031, 032, 033, 034, 035, 036, 037, 040, 041, 042, 043, 044, 045, 046, 050, 051, 052, 053`
- TASK-001: status = `MANUAL`, reason = `Requires human: git history rewrite and key rotation — see IMPROVEMENT_PLAN.md TASK-001`
- All other tasks: status = `PENDING`
- Include a `## Skipped Tasks Report` section (empty, populated by ralph at completion)
- Include a `## Notes` section (empty scratch space)

**Test requirements:**
- Verify all 32 tasks are present (count rows)
- Verify TASK-001 is MANUAL
- Verify all other 31 tasks are PENDING
- Verify table columns are: Task | Status | Skip Reason

**Integration notes:**
- PROGRESS.md is read by PROMPT.md in Step 2 — column names must match exactly
  what the PROMPT.md algorithm references

**Demo:** Open PROGRESS.md — readable table showing the full plan state at a glance.

---

## Step 2: Create PROMPT.md — initialization + pre-flight

**Objective:** Create the static PROMPT.md that ralph feeds to Claude every iteration.
This step covers the header, objective, and pre-flight initialization logic.
After this step, ralph can start a loop and initialize correctly on the first run.

**Implementation guidance:**

Create `PROMPT.md` at the repo root with these sections:

```markdown
# routes-cli Improvement Plan — Ralph Executor

## Objective
Execute all improvement tasks defined in `IMPROVEMENT_PLAN.md` sequentially,
committing after each task, tracking progress in `PROGRESS.md`.

## Pre-flight (run at the start of EVERY iteration)
1. Read `PROGRESS.md`
2. If `PROGRESS.md` does not exist → create it now using the initial state
   defined in `specs/complete-improvement-plan/plan.md` Step 1, then re-read it
3. Read `IMPROVEMENT_PLAN.md` to have task details available

## References
- Task details: `IMPROVEMENT_PLAN.md`
- Current state: `PROGRESS.md`
- Design: `specs/complete-improvement-plan/design.md`
```

**Test requirements:**
- PROMPT.md exists at repo root
- Running `ralph run` once creates PROGRESS.md if it doesn't exist
- Second run reads existing PROGRESS.md without overwriting it (idempotency)

**Integration notes:**
- The file paths in PROMPT.md must be relative to the repo root (where ralph runs)
- PROGRESS.md created by ralph must match the exact schema from Step 1

**Demo:** Delete PROGRESS.md, run `ralph run` once — PROGRESS.md is recreated correctly.

---

## Step 3: Add main execution algorithm to PROMPT.md

**Objective:** Add the core task-execution loop to PROMPT.md so ralph can find the
next PENDING task, execute it, verify the build, and commit. After this step,
ralph can complete individual tasks end-to-end.

**Implementation guidance:**

Append to PROMPT.md after the Pre-flight section:

```markdown
## Main Algorithm (run after pre-flight, every iteration)

### Step A — Find next task
Scan `PROGRESS.md` in execution order for the first task with status `PENDING`.
If none found → go to Step E (completion).

### Step B — Execute task
1. Find the task section in `IMPROVEMENT_PLAN.md` (search for `### TASK-XXX:`)
2. Read its Steps and Acceptance Criteria carefully
3. Implement the task exactly as specified
4. If an unrecoverable error occurs during implementation:
   - Revert any partial changes for this task
   - Update `PROGRESS.md`: set task status to `SKIPPED`, record the reason
   - Go back to Step A

### Step C — Verify
Run: `pnpm build`
- If build passes → proceed to Step D
- If build fails:
  - Revert all changes made for this task
  - Update `PROGRESS.md`: set task status to `SKIPPED`, reason = "build failed: <error summary>"
  - Go back to Step A

### Step D — Commit
1. Stage only the files changed by this task (never `git add -A` or `git add .`)
2. Commit with message format: `type(scope): short description (TASK-XXX)`
   - Use Conventional Commits type: feat / fix / chore / docs / refactor / test
   - No co-author lines
3. Update `PROGRESS.md`: set task status to `COMPLETE`
4. Commit the updated `PROGRESS.md` in the same commit
5. Exit this iteration (ralph will start the next one)
```

**Test requirements:**
- After running ralph, first PENDING task becomes COMPLETE in PROGRESS.md
- A git commit exists with a valid Conventional Commits message including the task ID
- `pnpm build` still passes after the commit
- PROGRESS.md is committed in the same commit as the task changes

**Integration notes:**
- Step D commits PROGRESS.md alongside task changes — keeps git history coherent
- "Exit this iteration" means Claude does no more work; ralph's stop hook fires and
  restarts with the same PROMPT.md for the next task

**Demo:** Run `ralph run` once — one task moves from PENDING → COMPLETE with a clean commit.

---

## Step 4: Add skip, dependency, and completion logic to PROMPT.md

**Objective:** Add the dependency auto-skip rules and the completion condition.
After this step, ralph handles blocked tasks and knows when it's finished.

**Implementation guidance:**

Insert between Step A and Step B in the algorithm:

```markdown
### Step A2 — Check dependencies
Before executing the task, check if it has any dependencies in this map:

| Task     | Requires         |
|----------|-----------------|
| TASK-016 | TASK-013        |
| TASK-021 | TASK-020        |
| TASK-022 | TASK-011        |
| TASK-023 | TASK-021        |
| TASK-026 | TASK-022        |
| TASK-035 | TASK-023        |
| TASK-037 | TASK-022, TASK-023 |

If any required task has status `SKIPPED` in `PROGRESS.md`:
- Update `PROGRESS.md`: set this task to `SKIPPED`,
  reason = "dependency <TASK-XXX> was skipped"
- Go back to Step A (do NOT attempt the task)
```

Add Step E at the end:

```markdown
### Step E — Completion
All tasks are `COMPLETE`, `SKIPPED`, or `MANUAL`.

1. Write the final skipped tasks report in `PROGRESS.md`:
   - List all SKIPPED tasks with their reasons
   - List TASK-001 as the required manual step with instructions from IMPROVEMENT_PLAN.md
2. Commit PROGRESS.md: `chore(progress): final report — ralph loop complete`
3. Output exactly: <promise>LOOP_COMPLETE</promise>
```

**Test requirements:**
- Given: TASK-020 manually set to SKIPPED in PROGRESS.md
- When: ralph runs
- Then: TASK-021, TASK-023, TASK-035, TASK-037 are all auto-skipped with correct reasons
- Given: all tasks COMPLETE/SKIPPED/MANUAL
- When: ralph runs
- Then: `<promise>LOOP_COMPLETE</promise>` is emitted and PROGRESS.md has a final report

**Integration notes:**
- The dependency table in PROMPT.md must be kept in sync with any future changes to
  IMPROVEMENT_PLAN.md task dependencies
- TASK-001 always appears in the final report as a required manual step

**Demo:** Set TASK-020 to SKIPPED; run ralph; verify TASK-021 is auto-skipped without any
implementation attempt.

---

## Step 5: Smoke-test and validate

**Objective:** Verify the complete PROMPT.md + PROGRESS.md system works end-to-end
before handing off to ralph for autonomous execution.

**Implementation guidance:**

Run through these manual verification checks in order:

1. **Schema check**: Count rows in PROGRESS.md → must be 33 (1 header + 32 tasks);
   TASK-001 = MANUAL; all others = PENDING

2. **Content check**: Open PROMPT.md and trace through the algorithm mentally for
   TASK-002 (patch dependency vulnerabilities) — verify each step makes sense and
   the acceptance criteria from IMPROVEMENT_PLAN.md are reachable

3. **Dependency check**: For each entry in the dependency table in PROMPT.md,
   verify the task ID and its dependency match IMPROVEMENT_PLAN.md exactly
   (cross-reference `specs/complete-improvement-plan/research/task-dependency-graph.md`)

4. **Completion check**: Mentally simulate a run where all tasks are COMPLETE —
   verify Step E would emit the correct promise tag

5. **First iteration live test** (optional but recommended):
   - Ensure no uncommitted changes in the repo
   - Run `ralph run` once
   - Verify: TASK-002 moves to COMPLETE or SKIPPED; a commit exists; PROGRESS.md updated
   - Run `ralph run` again; verify it picks up TASK-003

**Test requirements:**
- PROGRESS.md has 32 task rows
- PROMPT.md is under 150 lines
- Dependency table in PROMPT.md matches `task-dependency-graph.md` exactly
- No `git add -A` or co-author patterns appear in PROMPT.md

**Integration notes:**
- After this step the artifacts are ready for `ralph run` on the full plan
- TASK-001 manual instructions are visible in the final PROGRESS.md report so the
  repository owner knows what to do after ralph finishes

**Demo:** Run `ralph run --config ralph.yml`; observe the first task execute, commit,
and ralph loop back for the next.
