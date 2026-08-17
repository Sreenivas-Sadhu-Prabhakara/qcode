# qcode v1.0 — Design Spec

**Status:** approved 2026-08-17. Implements the design-reference site (`index.html` / `README.md`).

## Goal
A local coding harness. Claude plans and writes failing acceptance tests; the local Qwen writes the code in an isolated git worktree; a three-vendor adversarial gate (Qwen + Codex blocking, Gemini advisory) tries to refute the diff before anything merges. Nothing auto-merges.

## Division of labour (finalized)
- **Plan + failing acceptance tests + review of this build** = Claude (the orchestrator writing this).
- **Write the qcode implementation** = local Qwen via aider → LiteLLM `:4000`. qcode is bootstrapped by hand using its own philosophy.

## Grounded environment facts (probed 2026-08-17 — use these EXACT values)
- LiteLLM is up at `http://localhost:4000/v1`. The local model id is **`qwen-coder-32b`** (NOT `openai/qwen`). OpenAI-compatible API.
- `aider` **0.86.2** installed at `~/.local/bin/aider`. Point it at the local model with `OPENAI_API_BASE=http://localhost:4000/v1`, `OPENAI_API_KEY=dummy`, `--model openai/qwen-coder-32b`.
- Planner: `claude -p "<prompt>"` — non-interactive print mode; reuses Claude Code login, no API key.
- Blocking reviewer (external): `codex exec "<prompt>"` — non-interactive, reads stdin; also ships `codex exec review`. Reuses subscription.
- Advisory reviewer: `gemini -p "<prompt>" --approval-mode plan` — headless AND read-only (`plan` mode cannot edit files). Reuses subscription.
- Local Qwen budget: 32K native context, **~28K working budget**, output **≤ 8192 tokens/response**, generation is **single-lane** (one request at a time). Favor whole-file rewrites on small files over SEARCH/REPLACE.

## Architecture (three phases, each independently testable)
- **Phase 1 — Adapters + Gate core.** Typed adapters (`Planner`, `Executor`, `Reviewer` ×3) each wrapping a subprocess behind a clean interface, plus `combineVerdicts` — the PURE gate-combination function. All unit-testable offline via an injected process runner. No pipeline yet.
- **Phase 2 — Pipeline + worktree.** A `WorktreeManager` and a `Pipeline` state machine wiring the adapters: plan → isolate → execute → gate → loop-back (max 3×) → done/blocked. Runnable via a synchronous `qcode run`.
- **Phase 3 — Daemon + file queue + commands.** File-based queue under `~/.qcode/jobs/<id>/`, an auto-spawned serial daemon, and the full command surface: `run / status / watch / ls / logs / diff / merge / cancel`.

## Gate combination rules (the keystone)
- Reviewers carry a role: `blocking` (Qwen, Codex) or `advisory` (Gemini).
- The gate **passes** iff every `blocking` reviewer passed. Advisory reviewers **never** affect pass/fail — their findings ride along on the diff.
- Fail-closed: zero blocking verdicts is an error, not a pass.
- On a blocking veto, the pipeline loops Gate → Execute, max 3×, then `status=blocked` with all findings + advisory notes attached.

## Honesty constraint (carried from the site's review history)
Qwen is BOTH executor and a blocking reviewer, so only Codex + Gemini are true outsiders; Qwen re-reviews its own diff in a fresh, refute-only context. Do not claim "no reviewer wrote the code" anywhere.

## Global constraints (from CLAUDE.md)
- TypeScript strict mode. **No `any` ever.** Explicit return types on all exported functions.
- Error handling on every async operation. Input validation at boundaries.
- Unit tests for every feature. No `console.log` in shipped code (use a logger module).
- Node 20+. ESM modules. Package name `qcode`, global bin `qcode`.
- Commit convention: `[TASK-ID] Short description` (e.g. `[P1.3] Add gate combination logic`).
