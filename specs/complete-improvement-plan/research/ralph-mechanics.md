# Research: Ralph Loop Mechanics

## How Ralph Works

Ralph implements the "Ralph Wiggum technique" — an iterative AI loop:

```bash
while :; do
  cat PROMPT.md | claude-code --continue
done
```

The same `PROMPT.md` is fed to Claude on every iteration. Claude sees its own
previous work via the file system and git history, building incrementally toward
the goal.

### Each iteration:
1. Claude receives the **same** PROMPT.md
2. Works on the next piece of the task, modifying files
3. Tries to exit
4. Stop hook intercepts → same prompt fed again
5. Claude sees previous work in files + git log
6. Continues until completion signal emitted

## Completion Signal

Ralph stops when it sees the configured `completion_promise`. Our `ralph.yml` has:

```yaml
completion_promise: "LOOP_COMPLETE"
```

Claude must output a `<promise>` tag to signal completion:

```
<promise>LOOP_COMPLETE</promise>
```

Without this tag (or hitting `max_iterations: 100`), ralph runs indefinitely.

## PROMPT.md Design Principles

Since Claude sees the same prompt every iteration and relies on file/git state
for context, the PROMPT.md must:

1. **State a clear, stable objective** — doesn't change between iterations
2. **Give a deterministic algorithm** — Claude knows exactly what to do each iteration
3. **Point to state files** — tell Claude where to find current progress
4. **Define completion** — clear criteria for emitting `<promise>LOOP_COMPLETE</promise>`

## Key Insight: State Lives in Files

The PROMPT.md is static. All dynamic state (what's done, what's next, what was
skipped) must live in files that ralph/Claude reads at the start of each
iteration. This is why a `PROGRESS.md` file is essential for our use case.

## Good vs Bad for Ralph

| Good | Bad |
|------|-----|
| Clear acceptance criteria per task | Vague "improve the codebase" |
| State tracked in files | State only in conversation |
| Deterministic next-step algorithm | Ambiguous "do whatever's next" |
| Build verification before commit | No verification |
