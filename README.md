# qcode

**Claude plans. Your local Qwen executes. A cross-vendor jury gates it.**

qcode is a local coding harness. A strong model (Claude) designs the end-to-end flow and writes a failing acceptance-test suite; a fast local Qwen MoE writes the code in a background git worktree; then a three-vendor adversarial gate — **Qwen and Codex blocking, Gemini advising** — runs the tests and tries to refute the diff before anything merges. Codex and Gemini never saw the code written; Qwen re-attacks its own diff in a fresh, refute-only context.

> **Status: design reference (v0).** The harness itself is in development. This repo currently hosts the design + usage site → **https://sreenivas-sadhu-prabhakara.github.io/qcode/**

## The pipeline

```
run "task" ─▶ ① PLAN (claude)  ─▶ ② ISOLATE (git worktree)  ─▶ ③ EXECUTE (qwen · aider)
                                                                      │
      reviewed diff ◀─ ⑤ DONE ◀─ ④ GATE (qwen ✔ + codex ✔  ·  gemini ⚠ advisory)
                                       └─ blocking veto → back to ③, max 3×, else blocked
```

Claude plans and writes the oracle tests, then steps out — it never reviews, so the loop never re-spends the priciest model. The gate runs on your local Qwen plus two subscription CLIs.

## Architecture (the decision: wrap, don't rebuild)

| Part | What | How |
|------|------|-----|
| **Planner** | Claude designs the flow + oracle tests | shells out to `claude -p` (reuses your Claude Code login, no API key) |
| **Executor** | Local Qwen writes the code | **Aider** architect/editor mode, `editor-model = openai/qwen` → LiteLLM `:4000`, in a per-job git worktree, `--no-auto-commits --test-cmd` |
| **Blocking reviewers** | Qwen (local) + Codex, either can veto | independent, execution-grounded, refute-first; a defect loops the job back (max 3×) |
| **Advisory reviewer** | Gemini annotates the diff | a third frontier lens; its notes ride along on the diff but never fail the gate |
| **Queue** | Background daemon | file-based under `~/.qcode/jobs/<id>/`; serial (the local model is single-lane), crash-durable |

All four models reuse subscription logins — no API keys: `claude -p`, local Qwen via LiteLLM→MLX, `codex exec`, `gemini -p`.

## Design principles
- **"Done" is objective** — Claude writes failing tests first; the executor grinds against ground truth, not vibes.
- **Review is execution, not opinion** — reviewers run tests/types and try to break the change.
- **Three vendors, three blind spots** — the gate spans Qwen, Codex and Gemini; Codex and Gemini never saw the code written, and Qwen re-attacks its own diff in a fresh, refute-only context. Diverse training catches diverse failure modes.
- **The expensive model plans, it doesn't review** — Claude is spent once per job (planning); the gate runs on the local model + two other subscriptions, so retry loops never re-bill Claude.
- **Honest status** — no auto-merge; a job is `done` only when tests and both blocking reviewers pass, else `blocked` with evidence (Gemini's advisory notes attached either way).

## Roadmap
- **v1.0** — the pipeline: plan → worktree → execute → cross-vendor adversarial gate → reviewed diff.
- **v1.1** — fleet router: trivial steps to the 245 tok/s Qwen-1.5B tier, hard steps to the MoE.
- **v1.2** — parallel jobs across independent plan branches.
- **v1.3** — compounding per-repo memory (conventions + rejected-diff corpus).

## Runs on
Node 20+ · the `claude` CLI · `aider` · the `codex` CLI (subscription) · the `gemini` CLI (subscription) · a local Qwen (Qwen3-Coder-30B-A3B MoE via LiteLLM→MLX on `:4000`, ~82 tok/s warm on a 64 GB M2 Max).
