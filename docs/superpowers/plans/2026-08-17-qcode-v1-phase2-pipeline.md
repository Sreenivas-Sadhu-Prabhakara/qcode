# qcode v1.0 — Phase 2: Pipeline + Worktree — Implementation Plan

> **Executed by local Qwen via aider; Claude writes failing tests first + runs the gate (tests+types) per task.** Same recipe as Phase 1.

**Goal:** Wire the Phase 1 adapters into a runnable pipeline: plan → isolate (git worktree) → execute → run tests → gate → loop-back (max 3) → done/blocked, exposed as a synchronous `qcode run`.

**Architecture:** A pure-ish `runPipeline(deps, task, repoRoot)` orchestrator with every collaborator injected (planner, executor, reviewers, worktree manager, fs/git helpers) so it is fully unit-testable with fakes. Real wiring lives only in the CLI.

**Spec:** `docs/superpowers/specs/2026-08-17-qcode-v1-design.md`. Builds on Phase 1 (`[P1.1]`–`[P1.7]`).

## Global Constraints
Same as Phase 1: TS strict, no `any`, explicit return types, ESM `.js` imports, no `console.log` in `src/` except `cli.ts` (user-facing output), commit `[P2.N] ...`, exact external values (`qwen-coder-32b`, `:4000`).

---

### Task P2.1: Pipeline types + WorktreeManager

**Files:** Modify `src/types.ts`; Create `src/worktree.ts`; Test `test/worktree.test.ts`.

**Interfaces — add to `types.ts`:**
```ts
export type JobStatus = 'done' | 'blocked';
export interface JobResult {
  status: JobStatus;
  diff: string;
  testOutput: string;
  gate: GateResult;
  loops: number;
}
```
**Produces:** `WorktreeManager` interface `{ create(repoRoot: string, jobId: string): Promise<string>; remove(repoRoot: string, dir: string): Promise<void> }`; `makeGitWorktreeManager(run: ProcessRunner): WorktreeManager`.
- `create`: worktree dir = `join(repoRoot, '.qcode-worktrees', jobId)`, branch = `qcode/<jobId>`; runs `git ['worktree','add','-b',branch,dir]` in `repoRoot`; returns dir.
- `remove`: runs `git ['worktree','remove','--force',dir]` in `repoRoot`.

- [ ] **Step 1: failing test** (`test/worktree.test.ts`)
```ts
import { expect, test, vi } from 'vitest';
import { makeGitWorktreeManager } from '../src/worktree.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

test('create runs git worktree add with a job branch and returns the dir', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: '', stderr: '', code: 0 }));
  const wt = makeGitWorktreeManager(run);
  const dir = await wt.create('/repo', 'job1');
  expect(dir).toContain('job1');
  const args = run.mock.calls[0]?.[1] ?? [];
  expect(args).toEqual(expect.arrayContaining(['worktree', 'add', '-b', 'qcode/job1']));
});

test('remove runs git worktree remove --force', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: '', stderr: '', code: 0 }));
  const wt = makeGitWorktreeManager(run);
  await wt.remove('/repo', '/repo/.qcode-worktrees/job1');
  const args = run.mock.calls[0]?.[1] ?? [];
  expect(args).toEqual(expect.arrayContaining(['worktree', 'remove', '--force']));
});
```
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3:** implement `types.ts` additions + `src/worktree.ts` per interface above (import `ProcessRunner` from `./adapters/subprocess.js`, `join` from `node:path`; throw on non-zero exit code with stderr).
- [ ] **Step 4:** `npm run build && npx vitest run test/worktree.test.ts` → PASS.
- [ ] **Step 5:** commit `[P2.1] Add pipeline types + git worktree manager`.

---

### Task P2.2: fs/git helpers (write tests, diff, run acceptance)

**Files:** Create `src/adapters/repo.ts`; Test `test/repo.test.ts`.

**Produces:**
- `writeTests(cwd: string, tests: AcceptanceTest[]): Promise<void>` — writes each test's `content` to `join(cwd, test.path)`, creating parent dirs (`mkdir recursive`).
- `gitDiff(run: ProcessRunner, cwd: string): Promise<string>` — returns stdout of `git ['add','-A']` then `git ['diff','--cached']` in cwd.
- `runAcceptance(run: ProcessRunner, cwd: string, testCmd: string): Promise<{ passed: boolean; output: string }>` — splits `testCmd` on spaces, runs it, `passed = code === 0`, `output = stdout+stderr`.

- [ ] **Step 1: failing test** (`test/repo.test.ts`)
```ts
import { expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTests, gitDiff, runAcceptance } from '../src/adapters/repo.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

test('writeTests writes files with nested dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qc-'));
  await writeTests(dir, [{ path: 'test/a.test.ts', content: 'X' }]);
  expect(await readFile(join(dir, 'test/a.test.ts'), 'utf8')).toBe('X');
  await rm(dir, { recursive: true, force: true });
});

test('gitDiff stages then diffs cached', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'DIFF', stderr: '', code: 0 }));
  const out = await gitDiff(run, '/repo');
  expect(out).toBe('DIFF');
  expect(run).toHaveBeenCalledWith('git', ['add', '-A'], expect.objectContaining({ cwd: '/repo' }));
});

test('runAcceptance reports pass on exit 0', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'ok', stderr: '', code: 0 }));
  const r = await runAcceptance(run, '/repo', 'npm test');
  expect(r.passed).toBe(true);
  expect(r.output).toContain('ok');
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `src/adapters/repo.ts` (use `node:fs/promises` `mkdir`/`writeFile`, `node:path` `join`/`dirname`).
- [ ] **Step 4:** build + test → PASS.
- [ ] **Step 5:** commit `[P2.2] Add repo fs/git helpers (writeTests, gitDiff, runAcceptance)`.

---

### Task P2.3: The pipeline orchestrator

**Files:** Create `src/pipeline.ts`; Test `test/pipeline.test.ts`.

**Consumes:** `Planner`, `Executor`, `Reviewer`, `WorktreeManager`, `combineVerdicts`, `writeTests`, `gitDiff`, `runAcceptance`, `ProcessRunner`.
**Produces:**
```ts
export interface PipelineDeps {
  planner: Planner;
  executor: Executor;
  reviewers: Reviewer[];
  worktree: WorktreeManager;
  run: ProcessRunner;
  testCmd: string;
  maxLoops?: number; // default 3
}
export function runPipeline(deps: PipelineDeps, task: string, repoRoot: string, jobId: string): Promise<JobResult>;
```
**Algorithm:** plan = planner.plan(task, repoRoot); dir = worktree.create(repoRoot, jobId); writeTests(dir, plan.tests); loop up to maxLoops: run each plan.step through executor.execute(step, dir); {passed, output}=runAcceptance(run, dir, testCmd); diff=gitDiff(run, dir); verdicts = await Promise.all(reviewers.map(r => r.review({task, diff, testOutput: output}, dir))); gate=combineVerdicts(verdicts); if (passed && gate.passed) return {status:'done', diff, testOutput: output, gate, loops}; on final failure return {status:'blocked', diff, testOutput, gate, loops}.

- [ ] **Step 1: failing test** (`test/pipeline.test.ts`) — fakes for every dep:
```ts
import { expect, test, vi } from 'vitest';
import { runPipeline } from '../src/pipeline.js';
import type { PipelineDeps } from '../src/pipeline.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const runOk: ProcessRunner = async () => ({ stdout: '', stderr: '', code: 0 });
const baseDeps = (reviewerPass: boolean): PipelineDeps => ({
  planner: { plan: async (task) => ({ task, steps: [{ id: 's1', description: 'd', files: [] }], tests: [] }) },
  executor: { execute: async () => ({ applied: true, output: '' }) },
  reviewers: [{ id: 'codex', role: 'blocking', review: async () => ({ reviewer: 'codex', role: 'blocking', passed: reviewerPass, findings: [], raw: '' }) }],
  worktree: { create: async () => '/wt', remove: async () => {} },
  run: runOk,
  testCmd: 'npm test',
});

test('done when tests pass and gate passes', async () => {
  const r = await runPipeline(baseDeps(true), 'task', '/repo', 'job1');
  expect(r.status).toBe('done');
  expect(r.loops).toBe(1);
});

test('blocked after maxLoops when a blocking reviewer keeps vetoing', async () => {
  const r = await runPipeline({ ...baseDeps(false), maxLoops: 2 }, 'task', '/repo', 'job1');
  expect(r.status).toBe('blocked');
  expect(r.loops).toBe(2);
  expect(r.gate.passed).toBe(false);
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `src/pipeline.ts`.
- [ ] **Step 4:** build + test → PASS.
- [ ] **Step 5:** commit `[P2.3] Add pipeline orchestrator (plan→execute→gate→loop)`.

---

### Task P2.4: `qcode run` CLI

**Files:** Create `src/cli.ts`; Test `test/cli.test.ts`.

**Produces:** `buildRunDeps(run: ProcessRunner, testCmd: string): PipelineDeps` (wires real adapters: `makeClaudePlanner`, `makeAiderExecutor`, `[makeQwenReviewer, makeCodexReviewer, makeGeminiReviewer]`, `makeGitWorktreeManager`); and a `main(argv: string[]): Promise<number>` that parses `run <task> --repo <path> [--test-cmd <cmd>]`, generates a jobId (`job-` + a counter/simple hash of task; NOT `Date.now`), calls `runPipeline`, prints status + diff summary, returns exit code (0 done, 1 blocked). `cli.ts` MAY use `console.log`. Shebang `#!/usr/bin/env node`.

- [ ] **Step 1: failing test** (`test/cli.test.ts`) — test `buildRunDeps` returns 3 reviewers with correct roles:
```ts
import { expect, test } from 'vitest';
import { buildRunDeps } from '../src/cli.js';

test('buildRunDeps wires 3 reviewers: 2 blocking + 1 advisory', () => {
  const deps = buildRunDeps(async () => ({ stdout: '', stderr: '', code: 0 }), 'npm test');
  expect(deps.reviewers.map((r) => r.role).sort()).toEqual(['advisory', 'blocking', 'blocking']);
  expect(deps.reviewers.map((r) => r.id).sort()).toEqual(['codex', 'gemini', 'qwen']);
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement `src/cli.ts` (import all factories; parse argv manually or minimal; export `buildRunDeps` + `main`; call `main(process.argv.slice(2))` at bottom guarded by an import-meta-main check).
- [ ] **Step 4:** build + test → PASS.
- [ ] **Step 5:** commit `[P2.4] Add qcode run CLI wiring real adapters`.

---

## Phase 2 exit criteria
- `npm run build` strict-clean; full suite green.
- `runPipeline` fully covered by fakes: done-path, blocked-after-maxLoops, gate integration.
- `qcode run` exists and wires the real cross-vendor gate (2 blocking + 1 advisory).
- A real end-to-end run on a throwaway repo is a manual smoke test (documented, not a unit test — it needs live models).
