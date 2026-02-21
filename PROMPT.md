# NestJS Architecture Improvement — Ralph Executor

## Objective

Execute every task in `docs/plans/2026-02-20-architecture-improvement.md` to migrate
routes-cli to a clean NestJS-based architecture. One task per iteration. After each task:
verify types, commit, update `PROGRESS.md`. When all tasks are done emit `<promise>LOOP_COMPLETE</promise>`.

---

## Pre-flight (every iteration)

1. Read `PROGRESS.md`. If it does not exist, create it now with all 30 tasks as `PENDING`
   (see initial state below), then re-read it.
2. Read `docs/plans/2026-02-20-architecture-improvement.md` to have all task details available.

---

## Algorithm

### A — Find next task

Scan `PROGRESS.md` in order for the first `PENDING` task:

```
001, 002, 003, 004, 005, 006, 007, 008, 009, 010,
011, 012, 013, 014, 015, 016, 017, 018, 019, 020,
021, 022, 023, 024, 025, 026, 027, 028, 029, 030
```

If none found → go to **E (Completion)**.

### A2 — Check dependencies

| Task     | Requires                                         |
|----------|--------------------------------------------------|
| TASK-005 | TASK-001                                         |
| TASK-006 | TASK-005                                         |
| TASK-007 | TASK-006                                         |
| TASK-008 | TASK-002                                         |
| TASK-009 | TASK-008                                         |
| TASK-010 | TASK-009                                         |
| TASK-011 | TASK-010                                         |
| TASK-012 | TASK-011                                         |
| TASK-013 | TASK-012, TASK-003                               |
| TASK-014 | TASK-013                                         |
| TASK-015 | TASK-013                                         |
| TASK-016 | TASK-015                                         |
| TASK-017 | TASK-010                                         |
| TASK-018 | TASK-016, TASK-017                               |
| TASK-019 | TASK-007                                         |
| TASK-020 | TASK-007, TASK-017                               |
| TASK-021 | TASK-020                                         |
| TASK-022 | TASK-016                                         |
| TASK-025 | TASK-023, TASK-024, TASK-021, TASK-019           |
| TASK-026 | TASK-022, TASK-023, TASK-024                     |
| TASK-027 | TASK-025, TASK-026                               |
| TASK-028 | TASK-027, TASK-007, TASK-018, TASK-021, TASK-019, TASK-022 |
| TASK-029 | TASK-028                                         |
| TASK-030 | TASK-029                                         |

If any required task is `SKIPPED` in `PROGRESS.md`:
- Set this task to `SKIPPED`, reason = `dependency <TASK-XXX> was skipped`
- Write `PROGRESS.md`
- Go back to **A**

### B — Execute task

1. Find the matching `### Task N:` section in `docs/plans/2026-02-20-architecture-improvement.md`
   (TASK-001 = Task 1, TASK-002 = Task 2, … TASK-030 = Task 30)
2. Read its Steps carefully — follow them exactly
3. Implement only the files listed under **Files:** for that task
4. On unrecoverable error: revert partial changes, set task `SKIPPED` with reason,
   write `PROGRESS.md`, go back to **A**

### C — Verify

Run `pnpm typecheck`.
- Pass → go to **D**
- Fail → revert all changes, set task `SKIPPED`,
  reason = `typecheck failed: <one-line error summary>`, write `PROGRESS.md`, go back to **A**

For TASK-028 and later: also run `pnpm build` to verify full compilation.

### D — Commit

1. Stage only the files changed by this task — never `git add -A` or `git add .`
2. Update task to `COMPLETE` in `PROGRESS.md`, then stage `PROGRESS.md`
3. Use the commit message from the plan's **Commit** step for this task
4. No co-author lines
5. Exit this iteration — ralph will restart for the next task

### E — Completion

All tasks are `COMPLETE`, `SKIPPED`, or `MANUAL`.

1. Run final smoke test: `pnpm build && pnpm dev chains && pnpm dev tokens`
2. Record results in `PROGRESS.md § Final Report`
3. Commit: `chore: nestjs architecture migration complete — ralph loop done`
4. Output: `<promise>LOOP_COMPLETE</promise>`

---

## Rules

- One task per iteration — do not attempt multiple tasks in a single run
- Never modify `docs/plans/2026-02-20-architecture-improvement.md`
- Never skip a task without writing the reason to `PROGRESS.md`
- Never use `--no-verify` on commits

---

## Initial PROGRESS.md State

If creating `PROGRESS.md` from scratch, use this content:

```
## Architecture Improvement Progress

> Source: docs/plans/2026-02-20-architecture-improvement.md
> Started: (today's date)

| Task     | Phase | Description                                          | Status  | Notes |
|----------|-------|------------------------------------------------------|---------|-------|
| TASK-001 | 1     | Install NestJS dependencies                          | PENDING |       |
| TASK-002 | 1     | Create shared/types/                                 | PENDING |       |
| TASK-003 | 1     | Create shared/security/key-handle.ts                 | PENDING |       |
| TASK-004 | 1     | Create shared/errors/                                | PENDING |       |
| TASK-005 | 2     | Create config/validation/env.schema.ts               | PENDING |       |
| TASK-006 | 2     | Create config/config.service.ts                      | PENDING |       |
| TASK-007 | 2     | Create config/tokens.config.ts + ConfigModule        | PENDING |       |
| TASK-008 | 3     | Create chain-handler.interface + chain-registry      | PENDING |       |
| TASK-009 | 3     | Migrate EVM, TVM, SVM chain handlers                 | PENDING |       |
| TASK-010 | 3     | Create address-normalizer.service.ts                 | PENDING |       |
| TASK-011 | 3     | Create chains.config.ts + chains.service.ts          | PENDING |       |
| TASK-012 | 3     | Create rpc.service.ts                                | PENDING |       |
| TASK-013 | 3     | Migrate publishers to injectable + useAsync()        | PENDING |       |
| TASK-014 | 3     | Migrate SVM helpers                                  | PENDING |       |
| TASK-015 | 3     | Migrate client factories                             | PENDING |       |
| TASK-016 | 3     | Create publisher-factory.service.ts                  | PENDING |       |
| TASK-017 | 3     | Migrate encoding services                            | PENDING |       |
| TASK-018 | 3     | Create blockchain.module.ts                          | PENDING |       |
| TASK-019 | 4     | Create quote/quote.service.ts + QuoteModule          | PENDING |       |
| TASK-020 | 5     | Create intent/intent-builder.service.ts              | PENDING |       |
| TASK-021 | 5     | Create intent/intent-storage.service.ts + IntentModule | PENDING |     |
| TASK-022 | 6     | Create status/status.service.ts + StatusModule       | PENDING |       |
| TASK-023 | 7     | Create cli/services/prompt.service.ts                | PENDING |       |
| TASK-024 | 7     | Create cli/services/display.service.ts               | PENDING |       |
| TASK-025 | 7     | Create cli/commands/publish.command.ts               | PENDING |       |
| TASK-026 | 7     | Create remaining CLI commands                        | PENDING |       |
| TASK-027 | 7     | Create cli.module.ts                                 | PENDING |       |
| TASK-028 | 8     | Create app.module.ts + main.ts                       | PENDING |       |
| TASK-029 | 8     | Remove old source files                              | PENDING |       |
| TASK-030 | 8     | Update tsconfig.json                                 | PENDING |       |

## Skipped Tasks Report

_(populated at completion)_

## Final Report

_(populated at completion)_
```
