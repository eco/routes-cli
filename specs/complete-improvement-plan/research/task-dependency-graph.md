# Research: Task Dependency Graph

## Explicit Dependencies (from IMPROVEMENT_PLAN.md)

| Task | Depends On |
|------|-----------|
| TASK-021 | TASK-020 |
| TASK-022 | TASK-011 |
| TASK-026 | TASK-022 |
| TASK-035 | TASK-023 |
| TASK-037 | TASK-022, TASK-023 |

## Implicit Dependencies (inferred from task descriptions)

| Task | Implicitly Depends On | Reason |
|------|-----------------------|--------|
| TASK-023 | TASK-021 | Step 5 says "Update PublisherFactory (extracted in TASK-021)" |
| TASK-016 | TASK-013 | ESLint `no-explicit-any` rule only useful after `any` types removed |

## Full Dependency Graph (transitive)

```
TASK-001 [MANUAL - skip]
TASK-002
TASK-003
TASK-010
TASK-011
  └── TASK-022
        ├── TASK-026
        └── TASK-037 (also needs TASK-023)
TASK-012
TASK-013
  └── TASK-016 (implicit)
TASK-014
TASK-015
TASK-016
TASK-020
  └── TASK-021
        └── TASK-023
              ├── TASK-035
              └── TASK-037
TASK-024
TASK-025
TASK-030
TASK-031
TASK-032
TASK-033
TASK-034
TASK-036
TASK-037
TASK-040
TASK-041
TASK-042
TASK-043
TASK-044
TASK-045
TASK-046
TASK-050
TASK-051
TASK-052
TASK-053
```

## Skip Propagation Rules

If a task is skipped/failed, all tasks that depend on it (directly or transitively)
must also be skipped:

| If skipped | Also skip |
|-----------|-----------|
| TASK-011 | TASK-022, TASK-026, TASK-037 |
| TASK-020 | TASK-021, TASK-023, TASK-035, TASK-037 |
| TASK-021 | TASK-023, TASK-035, TASK-037 |
| TASK-022 | TASK-026, TASK-037 |
| TASK-023 | TASK-035, TASK-037 |
| TASK-013 | TASK-016 (implicit) |

## Execution Order

Tasks within a phase that have no dependencies between them can be done in any order.
The plan explicitly states which phases are parallel-safe:

- **Phase 0**: All 3 tasks independent (TASK-001 manual, TASK-002 and TASK-003 automatable)
- **Phase 1**: All 7 tasks independent (parallel-safe)
- **Phase 2**: TASK-020 must come first; then TASK-021→TASK-023 chain; others parallel
- **Phase 3**: All test tasks can run in parallel (or after Phase 2)
- **Phase 4**: All documentation tasks fully parallel
- **Phase 5**: After Phase 2 completes

For ralph's sequential loop, the recommended task order is:

```
Phase 0:  002, 003                          [001 = manual]
Phase 1:  010, 011, 012, 013, 014, 015, 016
Phase 2:  020, 021, 022, 023, 024, 025, 026
Phase 3:  030, 031, 032, 033, 034, 035, 036, 037
Phase 4:  040, 041, 042, 043, 044, 045, 046
Phase 5:  050, 051, 052, 053
```
