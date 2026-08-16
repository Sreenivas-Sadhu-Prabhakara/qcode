# qcode

**Claude plans. Your local Qwen executes. Two skeptics gate it.**

qcode is a local coding harness. A strong model (Claude) designs the end-to-end flow and writes a failing acceptance-test suite; a fast local Qwen MoE writes the code in a background git worktree; a mixed **1 Claude + 1 Qwen** adversarial review runs the tests and tries to refute the diff before anything merges.

> **Status: design reference (v0).** The harness itself is in development. This repo currently hosts the design + usage site → **https://sreenivas-sadhu-prabhakara.github.io/qcode/**

## The pipeline

```
run "task" ─▶ ① PLAN (claude)  ─▶ ② ISOLATE (git worktree)  ─▶ ③ EXECUTE (qwen · aider)
                                                                      │
                    reviewed diff ◀─ ⑤ DONE ◀─ ④ GATE (claude ✔ + qwen ✔)
                                                   └─ defect → back to ③, max 3×, else blocked
```

## Architecture (the decision: wrap, don't rebuild)

| Part | What | How |
|------|------|-----|
| **Planner** | Claude designs the flow + oracle tests | shells out to `claude -p` (reuses your Claude Code login, no API key) |
| **Executor** | Local Qwen writes the code | **Aider** architect/editor mode, `editor-model = openai/qwen` → LiteLLM `:4000`, in a per-job git worktree, `--no-auto-commits --test-cmd` |
| **Reviewers** | 1 Claude + 1 Qwen skeptic, blocking | independent, execution-grounded, refute-first; a defect loops the job back (max 3×) |
| **Queue** | Background daemon | file-based under `~/.qcode/jobs/<id>/`; serial (the local model is single-lane), crash-durable |

## Design principles
- **"Done" is objective** — Claude writes failing tests first; the executor grinds against ground truth, not vibes.
- **Review is execution, not opinion** — reviewers run tests/types and try to break the change.
- **Two independent lenses** — a strong + a cheap skeptic catch different failure modes.
- **Honest status** — no auto-merge; a job is `done` only when tests and both reviewers pass, else `blocked` with evidence.

## Roadmap
- **v1.0 (next)** — the pipeline: plan → worktree → execute → mixed adversarial gate → reviewed diff.
- **v1.1** — fleet router: trivial steps to the 245 tok/s Qwen-1.5B tier, hard steps to the MoE.
- **v1.2** — parallel jobs across independent plan branches.
- **v1.3** — compounding per-repo memory (conventions + rejected-diff corpus).

## Runs on
Node 20+ · the `claude` CLI · `aider` · a local Qwen (Qwen3-Coder-30B-A3B MoE via LiteLLM→MLX on `:4000`, ~82 tok/s warm on a 64 GB M2 Max).
