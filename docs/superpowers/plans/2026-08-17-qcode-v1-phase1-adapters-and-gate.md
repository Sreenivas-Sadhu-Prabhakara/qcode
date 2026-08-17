# qcode v1.0 — Phase 1: Adapters + Gate Core — Implementation Plan

> **For agentic workers:** This plan is executed by the **local Qwen via aider** (`~/.local/bin/aider --model openai/qwen-coder-32b`, `OPENAI_API_BASE=http://localhost:4000/v1`), one task at a time, with Claude writing the failing tests first and reviewing each task's diff before the next. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Build the typed, offline-testable foundation of qcode — model adapters (planner, executor, three reviewers) behind clean interfaces, plus the pure gate-combination keystone — with no pipeline yet.

**Architecture:** Every adapter depends on an injected `ProcessRunner` so tests never spawn real models. Pure functions (`combineVerdicts`, `parseVerdict`, `parsePlan`, prompt builders) hold the logic and are exhaustively unit-tested; the subprocess-spawning classes are thin wrappers tested with a fake runner.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Node 20+, vitest.

**Spec:** `docs/superpowers/specs/2026-08-17-qcode-v1-design.md`

## Global Constraints
- TypeScript strict, **no `any` ever**, explicit return types on all exported functions.
- ESM (`"type": "module"`), NodeNext resolution; local imports end in `.js`.
- No `console.log` in `src/` (tests may log). Error handling on every async op.
- Exact external values: local model id **`qwen-coder-32b`**; base `http://localhost:4000/v1`; aider at `~/.local/bin/aider`; `codex exec`; `gemini -p ... --approval-mode plan`; `claude -p`.
- Commit convention: `[P1.N] Short description`.

---

### Task 1: Project scaffold + shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (append), `.nojekyll`
- Create: `src/types.ts`
- Test: `test/types.test.ts`

**Interfaces:**
- Produces: all domain types — `ReviewerId`, `ReviewRole`, `Severity`, `Finding`, `ReviewVerdict`, `GateResult`, `PlanStep`, `AcceptanceTest`, `Plan`, `ExecOutcome`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "qcode",
  "version": "0.1.0",
  "type": "module",
  "bin": { "qcode": "dist/cli.js" },
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.14.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 4: Append to `.gitignore`, add `.nojekyll`**

Append to `.gitignore`: `node_modules/` and `dist/` and `coverage/` (one per line). Create empty file `.nojekyll` (stops GitHub Pages Jekyll from touching the repo).

- [ ] **Step 5: Write `src/types.ts`**

```ts
export type ReviewerId = 'qwen' | 'codex' | 'gemini';
export type ReviewRole = 'blocking' | 'advisory';
export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  summary: string;
  failingScenario: string;
  severity: Severity;
}

export interface ReviewVerdict {
  reviewer: ReviewerId;
  role: ReviewRole;
  passed: boolean;
  findings: Finding[];
  raw: string;
}

export interface GateResult {
  passed: boolean;
  vetoedBy: ReviewerId[];
  blockingFindings: Finding[];
  advisoryFindings: Finding[];
}

export interface PlanStep {
  id: string;
  description: string;
  files: string[];
}

export interface AcceptanceTest {
  path: string;
  content: string;
}

export interface Plan {
  task: string;
  steps: PlanStep[];
  tests: AcceptanceTest[];
}

export interface ExecOutcome {
  applied: boolean;
  output: string;
}
```

- [ ] **Step 6: Write `test/types.test.ts`** (compile-smoke: the type module has no runtime, so assert a value satisfies a type)

```ts
import { expect, test } from 'vitest';
import type { Finding } from '../src/types.js';

test('Finding shape compiles and holds values', () => {
  const f: Finding = { summary: 's', failingScenario: 'x->y', severity: 'high' };
  expect(f.severity).toBe('high');
});
```

- [ ] **Step 7: Install + run**

Run: `npm install && npm run build && npm test`
Expected: build succeeds, 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .nojekyll src/types.ts test/types.test.ts
git commit -m "[P1.1] Scaffold TS project + shared domain types"
```

---

### Task 2: Subprocess runner

**Files:**
- Create: `src/adapters/subprocess.ts`
- Test: `test/subprocess.test.ts`

**Interfaces:**
- Produces: `ProcessResult`, `ProcessInput`, `ProcessRunner` (type), `runProcess` (the real impl). Every adapter consumes `ProcessRunner`.

- [ ] **Step 1: Write the failing test** (`test/subprocess.test.ts`)

```ts
import { expect, test } from 'vitest';
import { runProcess } from '../src/adapters/subprocess.js';

test('captures stdout and exit code', async () => {
  const r = await runProcess('node', ['-e', 'process.stdout.write("hi")']);
  expect(r.stdout).toBe('hi');
  expect(r.code).toBe(0);
});

test('passes stdin to the process', async () => {
  const r = await runProcess('node', ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'echo-me' });
  expect(r.stdout).toBe('echo-me');
});

test('rejects on timeout', async () => {
  await expect(
    runProcess('node', ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 100 }),
  ).rejects.toThrow(/timed out/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/subprocess.test.ts`
Expected: FAIL — cannot find module `subprocess.js`.

- [ ] **Step 3: Write `src/adapters/subprocess.ts`**

```ts
import { spawn } from 'node:child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface ProcessInput {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
}

export type ProcessRunner = (
  cmd: string,
  args: string[],
  opts?: ProcessInput,
) => Promise<ProcessResult>;

export const runProcess: ProcessRunner = (cmd, args, opts = {}) =>
  new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env });
    let stdout = '';
    let stderr = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`process timed out after ${opts.timeoutMs}ms: ${cmd}`));
      }, opts.timeoutMs);
    }
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ stdout, stderr, code: code ?? -1 }); });
    if (opts.input !== undefined) { child.stdin.write(opts.input); child.stdin.end(); }
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/subprocess.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/subprocess.ts test/subprocess.test.ts
git commit -m "[P1.2] Add injectable subprocess runner"
```

---

### Task 3: Gate combination (the keystone — pure function)

**Files:**
- Create: `src/gate.ts`
- Test: `test/gate.test.ts`

**Interfaces:**
- Consumes: `ReviewVerdict`, `GateResult`, `ReviewerId`, `Finding` from `types.ts`.
- Produces: `combineVerdicts(verdicts: ReviewVerdict[]): GateResult`.

- [ ] **Step 1: Write the failing test** (`test/gate.test.ts`)

```ts
import { expect, test } from 'vitest';
import { combineVerdicts } from '../src/gate.js';
import type { ReviewVerdict, Finding } from '../src/types.js';

const finding: Finding = { summary: 'bug', failingScenario: 'n=0 -> crash', severity: 'high' };
const pass = (reviewer: ReviewVerdict['reviewer'], role: ReviewVerdict['role']): ReviewVerdict =>
  ({ reviewer, role, passed: true, findings: [], raw: '' });
const fail = (reviewer: ReviewVerdict['reviewer'], role: ReviewVerdict['role']): ReviewVerdict =>
  ({ reviewer, role, passed: false, findings: [finding], raw: '' });

test('all blocking pass -> gate passes', () => {
  const r = combineVerdicts([pass('qwen', 'blocking'), pass('codex', 'blocking'), pass('gemini', 'advisory')]);
  expect(r.passed).toBe(true);
  expect(r.vetoedBy).toEqual([]);
});

test('a blocking veto fails the gate and records who', () => {
  const r = combineVerdicts([fail('codex', 'blocking'), pass('qwen', 'blocking'), pass('gemini', 'advisory')]);
  expect(r.passed).toBe(false);
  expect(r.vetoedBy).toEqual(['codex']);
  expect(r.blockingFindings).toHaveLength(1);
});

test('advisory failure NEVER blocks the gate', () => {
  const r = combineVerdicts([pass('qwen', 'blocking'), pass('codex', 'blocking'), fail('gemini', 'advisory')]);
  expect(r.passed).toBe(true);
  expect(r.advisoryFindings).toHaveLength(1);
  expect(r.vetoedBy).toEqual([]);
});

test('fail-closed: zero blocking reviewers throws', () => {
  expect(() => combineVerdicts([pass('gemini', 'advisory')])).toThrow(/at least one blocking/);
});

test('empty verdicts throws', () => {
  expect(() => combineVerdicts([])).toThrow(/at least one blocking/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/gate.test.ts`
Expected: FAIL — cannot find `gate.js`.

- [ ] **Step 3: Write `src/gate.ts`**

```ts
import type { ReviewVerdict, GateResult, ReviewerId, Finding } from './types.js';

export function combineVerdicts(verdicts: ReviewVerdict[]): GateResult {
  const blocking = verdicts.filter((v) => v.role === 'blocking');
  const advisory = verdicts.filter((v) => v.role === 'advisory');
  if (blocking.length === 0) {
    throw new Error('gate requires at least one blocking reviewer');
  }
  const vetoed = blocking.filter((v) => !v.passed);
  const vetoedBy: ReviewerId[] = vetoed.map((v) => v.reviewer);
  const blockingFindings: Finding[] = vetoed.flatMap((v) => v.findings);
  const advisoryFindings: Finding[] = advisory.flatMap((v) => v.findings);
  return { passed: vetoedBy.length === 0, vetoedBy, blockingFindings, advisoryFindings };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/gate.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/gate.ts test/gate.test.ts
git commit -m "[P1.3] Add gate combination keystone (blocking veto, advisory never blocks)"
```

---

### Task 4: Verdict parsing + review prompt (pure)

**Files:**
- Create: `src/adapters/review-parse.ts`
- Test: `test/review-parse.test.ts`

**Interfaces:**
- Consumes: `ReviewVerdict`, `ReviewerId`, `ReviewRole`, `Finding`, `Severity`.
- Produces: `ReviewRequest` (interface: `{ task: string; diff: string; testOutput: string }`), `buildReviewPrompt(req: ReviewRequest): string`, `parseVerdict(id: ReviewerId, role: ReviewRole, raw: string): ReviewVerdict`.
- Contract: `parseVerdict` extracts the LAST ```json fenced block and validates `{ passed: boolean, findings: Finding[] }`. On missing/invalid JSON it is **fail-closed for blocking** (`passed: false` + one synthetic `high` finding) and **lenient for advisory** (`passed: true`, `findings: []`), always keeping `raw`.

- [ ] **Step 1: Write the failing test** (`test/review-parse.test.ts`)

```ts
import { expect, test } from 'vitest';
import { buildReviewPrompt, parseVerdict } from '../src/adapters/review-parse.js';

test('prompt includes the diff, test output, and a refute instruction', () => {
  const p = buildReviewPrompt({ task: 'add flag', diff: 'DIFFTEXT', testOutput: '6/6 green' });
  expect(p).toContain('DIFFTEXT');
  expect(p).toContain('6/6 green');
  expect(p.toLowerCase()).toContain('refute');
  expect(p).toContain('```json');
});

test('parses a passing verdict from a json block', () => {
  const raw = 'looks fine\n```json\n{"passed": true, "findings": []}\n```';
  const v = parseVerdict('codex', 'blocking', raw);
  expect(v.passed).toBe(true);
  expect(v.reviewer).toBe('codex');
  expect(v.role).toBe('blocking');
});

test('parses findings and coerces missing severity to medium', () => {
  const raw = '```json\n{"passed": false, "findings": [{"summary":"x","failingScenario":"a->b"}]}\n```';
  const v = parseVerdict('qwen', 'blocking', raw);
  expect(v.passed).toBe(false);
  expect(v.findings[0]?.severity).toBe('medium');
});

test('blocking reviewer with no json block fails closed', () => {
  const v = parseVerdict('codex', 'blocking', 'I could not produce structured output');
  expect(v.passed).toBe(false);
  expect(v.findings).toHaveLength(1);
  expect(v.findings[0]?.severity).toBe('high');
});

test('advisory reviewer with no json block is lenient', () => {
  const v = parseVerdict('gemini', 'advisory', 'no structured output');
  expect(v.passed).toBe(true);
  expect(v.findings).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/review-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/adapters/review-parse.ts`**

```ts
import type { ReviewVerdict, ReviewerId, ReviewRole, Finding, Severity } from '../types.js';

export interface ReviewRequest {
  task: string;
  diff: string;
  testOutput: string;
}

export function buildReviewPrompt(req: ReviewRequest): string {
  return [
    `You are a skeptical code reviewer. Task under review: ${req.task}`,
    `Try to REFUTE this diff: run the tests and types in your head, then construct a concrete failing scenario.`,
    `A defect only counts if you can name a concrete input that produces a wrong result.`,
    ``,
    `--- DIFF ---`,
    req.diff,
    `--- TEST OUTPUT ---`,
    req.testOutput,
    ``,
    `Reply with prose, then a final fenced block exactly like:`,
    '```json',
    `{"passed": true, "findings": []}`,
    '```',
    `where findings is a list of {"summary","failingScenario","severity":"high|medium|low"}.`,
    `passed=false means you found at least one real defect.`,
  ].join('\n');
}

function extractLastJsonBlock(raw: string): unknown {
  const re = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let last: string | undefined;
  while ((match = re.exec(raw)) !== null) { last = match[1]; }
  if (last === undefined) return undefined;
  try { return JSON.parse(last) as unknown; } catch { return undefined; }
}

function coerceSeverity(value: unknown): Severity {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function coerceFindings(value: unknown): Finding[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw): Finding => {
    const f = (raw ?? {}) as Record<string, unknown>;
    return {
      summary: typeof f.summary === 'string' ? f.summary : 'unspecified',
      failingScenario: typeof f.failingScenario === 'string' ? f.failingScenario : 'unspecified',
      severity: coerceSeverity(f.severity),
    };
  });
}

export function parseVerdict(id: ReviewerId, role: ReviewRole, raw: string): ReviewVerdict {
  const parsed = extractLastJsonBlock(raw);
  if (parsed === undefined || typeof parsed !== 'object' || parsed === null || typeof (parsed as Record<string, unknown>).passed !== 'boolean') {
    if (role === 'advisory') return { reviewer: id, role, passed: true, findings: [], raw };
    return {
      reviewer: id, role, passed: false, raw,
      findings: [{ summary: 'reviewer produced no parseable verdict', failingScenario: 'output missing json block', severity: 'high' }],
    };
  }
  const obj = parsed as Record<string, unknown>;
  return { reviewer: id, role, passed: obj.passed as boolean, findings: coerceFindings(obj.findings), raw };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/review-parse.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/review-parse.ts test/review-parse.test.ts
git commit -m "[P1.4] Add review prompt builder + fail-closed verdict parser"
```

---

### Task 5: The three reviewer adapters

**Files:**
- Create: `src/adapters/reviewer.ts`
- Test: `test/reviewer.test.ts`

**Interfaces:**
- Consumes: `ProcessRunner` from `subprocess.ts`; `ReviewRequest`, `buildReviewPrompt`, `parseVerdict` from `review-parse.ts`; `ReviewVerdict` from `types.ts`.
- Produces: `Reviewer` interface `{ id, role, review(req: ReviewRequest, cwd: string): Promise<ReviewVerdict> }`; factories `makeQwenReviewer(run)`, `makeCodexReviewer(run)`, `makeGeminiReviewer(run)`.
- Contract — the command each factory spawns (assert exactly in tests): Qwen → `curl` is NOT used; instead the qwen reviewer shells `codex`? No. Qwen reviewer calls the local model via the `openai`-style CLI is not available, so Qwen uses `aider`-free path: spawn `node` is wrong. Use the documented calls: Qwen via LiteLLM is HTTP, but to keep one spawn path, the qwen reviewer uses `curl` to `http://localhost:4000/v1/chat/completions`. Codex → `codex` with `['exec', prompt]`. Gemini → `gemini` with `['-p', prompt, '--approval-mode', 'plan']`.

- [ ] **Step 1: Write the failing test** (`test/reviewer.test.ts`)

```ts
import { expect, test, vi } from 'vitest';
import { makeCodexReviewer, makeGeminiReviewer, makeQwenReviewer } from '../src/adapters/reviewer.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const okJson = '```json\n{"passed": true, "findings": []}\n```';
const req = { task: 't', diff: 'd', testOutput: 'green' };

test('codex reviewer spawns `codex exec` and is blocking', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: okJson, stderr: '', code: 0 }));
  const r = makeCodexReviewer(run);
  expect(r.id).toBe('codex');
  expect(r.role).toBe('blocking');
  const v = await r.review(req, '/repo');
  expect(run).toHaveBeenCalledWith('codex', expect.arrayContaining(['exec']), expect.objectContaining({ cwd: '/repo' }));
  expect(v.passed).toBe(true);
});

test('gemini reviewer spawns headless read-only mode and is advisory', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: okJson, stderr: '', code: 0 }));
  const r = makeGeminiReviewer(run);
  expect(r.role).toBe('advisory');
  await r.review(req, '/repo');
  const args = run.mock.calls[0]?.[1] ?? [];
  expect(args).toContain('-p');
  expect(args).toContain('--approval-mode');
  expect(args).toContain('plan');
});

test('qwen reviewer is blocking and passes prompt as request body', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({
    stdout: JSON.stringify({ choices: [{ message: { content: okJson } }] }), stderr: '', code: 0,
  }));
  const r = makeQwenReviewer(run);
  expect(r.role).toBe('blocking');
  const v = await r.review(req, '/repo');
  expect(v.reviewer).toBe('qwen');
  expect(v.passed).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/reviewer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/adapters/reviewer.ts`**

```ts
import type { ProcessRunner } from './subprocess.js';
import type { ReviewVerdict, ReviewerId, ReviewRole } from '../types.js';
import { buildReviewPrompt, parseVerdict, type ReviewRequest } from './review-parse.js';

export interface Reviewer {
  readonly id: ReviewerId;
  readonly role: ReviewRole;
  review(req: ReviewRequest, cwd: string): Promise<ReviewVerdict>;
}

export function makeCodexReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'codex', role: 'blocking',
    async review(req, cwd) {
      const prompt = buildReviewPrompt(req);
      const res = await run('codex', ['exec', prompt], { cwd, timeoutMs: 300_000 });
      return parseVerdict('codex', 'blocking', res.stdout);
    },
  };
}

export function makeGeminiReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'gemini', role: 'advisory',
    async review(req, cwd) {
      const prompt = buildReviewPrompt(req);
      const res = await run('gemini', ['-p', prompt, '--approval-mode', 'plan'], { cwd, timeoutMs: 300_000 });
      return parseVerdict('gemini', 'advisory', res.stdout);
    },
  };
}

export function makeQwenReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'qwen', role: 'blocking',
    async review(req, cwd) {
      const body = JSON.stringify({
        model: 'qwen-coder-32b',
        messages: [{ role: 'user', content: buildReviewPrompt(req) }],
        max_tokens: 4096,
      });
      const res = await run('curl', [
        '-s', 'http://localhost:4000/v1/chat/completions',
        '-H', 'Content-Type: application/json',
        '-H', 'Authorization: Bearer dummy',
        '-d', body,
      ], { cwd, timeoutMs: 300_000 });
      let content = '';
      try {
        const parsed = JSON.parse(res.stdout) as { choices?: Array<{ message?: { content?: string } }> };
        content = parsed.choices?.[0]?.message?.content ?? '';
      } catch { content = ''; }
      return parseVerdict('qwen', 'blocking', content);
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/reviewer.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/reviewer.ts test/reviewer.test.ts
git commit -m "[P1.5] Add Qwen/Codex/Gemini reviewer adapters over injected runner"
```

---

### Task 6: Planner parsing + prompt (pure), then the Claude planner adapter

**Files:**
- Create: `src/adapters/plan-parse.ts`, `src/adapters/planner.ts`
- Test: `test/plan-parse.test.ts`, `test/planner.test.ts`

**Interfaces:**
- Consumes: `Plan`, `PlanStep`, `AcceptanceTest`; `ProcessRunner`.
- Produces: `buildPlanPrompt(task: string): string`, `parsePlan(task: string, raw: string): Plan` (extracts last ```json block `{steps, tests}`; throws on missing/invalid — planning is fail-loud, unlike review); `Planner` interface `{ plan(task: string, cwd: string): Promise<Plan> }`; `makeClaudePlanner(run): Planner` shelling `claude` with `['-p', prompt]`.

- [ ] **Step 1: Write the failing tests**

`test/plan-parse.test.ts`:

```ts
import { expect, test } from 'vitest';
import { buildPlanPrompt, parsePlan } from '../src/adapters/plan-parse.js';

test('prompt asks for failing tests first and a json plan', () => {
  const p = buildPlanPrompt('add --json flag');
  expect(p).toContain('add --json flag');
  expect(p.toLowerCase()).toContain('failing');
  expect(p).toContain('```json');
});

test('parses steps and tests', () => {
  const raw = '```json\n{"steps":[{"id":"s1","description":"d","files":["a.ts"]}],"tests":[{"path":"t.test.ts","content":"x"}]}\n```';
  const plan = parsePlan('task', raw);
  expect(plan.steps).toHaveLength(1);
  expect(plan.tests[0]?.path).toBe('t.test.ts');
  expect(plan.task).toBe('task');
});

test('throws (fail-loud) when no json plan present', () => {
  expect(() => parsePlan('task', 'sorry no plan')).toThrow(/no plan/i);
});
```

`test/planner.test.ts`:

```ts
import { expect, test, vi } from 'vitest';
import { makeClaudePlanner } from '../src/adapters/planner.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

test('claude planner shells `claude -p` and returns a Plan', async () => {
  const raw = '```json\n{"steps":[{"id":"s1","description":"d","files":[]}],"tests":[]}\n```';
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: raw, stderr: '', code: 0 }));
  const planner = makeClaudePlanner(run);
  const plan = await planner.plan('do it', '/repo');
  expect(run).toHaveBeenCalledWith('claude', expect.arrayContaining(['-p']), expect.objectContaining({ cwd: '/repo' }));
  expect(plan.steps[0]?.id).toBe('s1');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/plan-parse.test.ts test/planner.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/adapters/plan-parse.ts`**

```ts
import type { Plan, PlanStep, AcceptanceTest } from '../types.js';

export function buildPlanPrompt(task: string): string {
  return [
    `You are the planner for a coding harness. Task: ${task}`,
    `Produce a concrete plan AND a FAILING acceptance-test suite that defines "done".`,
    `Return prose, then a final fenced block exactly like:`,
    '```json',
    `{"steps":[{"id":"s1","description":"...","files":["path.ts"]}],"tests":[{"path":"x.test.ts","content":"...source..."}]}`,
    '```',
  ].join('\n');
}

function extractLastJsonBlock(raw: string): unknown {
  const re = /```json\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let last: string | undefined;
  while ((m = re.exec(raw)) !== null) { last = m[1]; }
  if (last === undefined) return undefined;
  try { return JSON.parse(last) as unknown; } catch { return undefined; }
}

export function parsePlan(task: string, raw: string): Plan {
  const parsed = extractLastJsonBlock(raw);
  if (parsed === undefined || typeof parsed !== 'object' || parsed === null) {
    throw new Error('planner returned no plan (no valid json block)');
  }
  const obj = parsed as Record<string, unknown>;
  const steps: PlanStep[] = Array.isArray(obj.steps)
    ? obj.steps.map((raw): PlanStep => {
        const s = (raw ?? {}) as Record<string, unknown>;
        return {
          id: typeof s.id === 'string' ? s.id : 'step',
          description: typeof s.description === 'string' ? s.description : '',
          files: Array.isArray(s.files) ? s.files.filter((f): f is string => typeof f === 'string') : [],
        };
      })
    : [];
  const tests: AcceptanceTest[] = Array.isArray(obj.tests)
    ? obj.tests.map((raw): AcceptanceTest => {
        const t = (raw ?? {}) as Record<string, unknown>;
        return {
          path: typeof t.path === 'string' ? t.path : 'acceptance.test.ts',
          content: typeof t.content === 'string' ? t.content : '',
        };
      })
    : [];
  return { task, steps, tests };
}
```

- [ ] **Step 4: Write `src/adapters/planner.ts`**

```ts
import type { ProcessRunner } from './subprocess.js';
import type { Plan } from '../types.js';
import { buildPlanPrompt, parsePlan } from './plan-parse.js';

export interface Planner {
  plan(task: string, cwd: string): Promise<Plan>;
}

export function makeClaudePlanner(run: ProcessRunner): Planner {
  return {
    async plan(task, cwd) {
      const res = await run('claude', ['-p', buildPlanPrompt(task)], { cwd, timeoutMs: 600_000 });
      if (res.code !== 0) throw new Error(`claude planner exited ${res.code}: ${res.stderr}`);
      return parsePlan(task, res.stdout);
    },
  };
}
```

- [ ] **Step 5: Run to verify all pass**

Run: `npx vitest run test/plan-parse.test.ts test/planner.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/plan-parse.ts src/adapters/planner.ts test/plan-parse.test.ts test/planner.test.ts
git commit -m "[P1.6] Add Claude planner adapter + fail-loud plan parser"
```

---

### Task 7: The aider executor adapter

**Files:**
- Create: `src/adapters/executor.ts`
- Test: `test/executor.test.ts`

**Interfaces:**
- Consumes: `ProcessRunner`; `PlanStep`, `ExecOutcome`.
- Produces: `Executor` interface `{ execute(step: PlanStep, cwd: string): Promise<ExecOutcome> }`; `makeAiderExecutor(run, opts?: { aiderPath?: string; testCmd?: string }): Executor`.
- Contract: spawns aider at `opts.aiderPath ?? '~/.local/bin/aider'` (expanded to `$HOME`) with `--model openai/qwen-coder-32b --yes --no-auto-commits`, `--message <step.description>`, `--test-cmd <testCmd>` when given, then the step's files; env includes `OPENAI_API_BASE=http://localhost:4000/v1` and `OPENAI_API_KEY=dummy`. `applied = code === 0`.

- [ ] **Step 1: Write the failing test** (`test/executor.test.ts`)

```ts
import { expect, test, vi } from 'vitest';
import { makeAiderExecutor } from '../src/adapters/executor.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const step = { id: 's1', description: 'write the code', files: ['src/x.ts'] };

test('executes aider with model, no-auto-commits, message, files, and local base env', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'done', stderr: '', code: 0 }));
  const exec = makeAiderExecutor(run, { testCmd: 'npm test' });
  const outcome = await exec.execute(step, '/repo');
  expect(outcome.applied).toBe(true);
  const [cmd, args, opts] = run.mock.calls[0] ?? [];
  expect(String(cmd)).toContain('aider');
  expect(args).toEqual(expect.arrayContaining(['--model', 'openai/qwen-coder-32b', '--no-auto-commits', '--message', 'write the code', 'src/x.ts']));
  expect(args).toEqual(expect.arrayContaining(['--test-cmd', 'npm test']));
  expect(opts?.env?.OPENAI_API_BASE).toBe('http://localhost:4000/v1');
});

test('non-zero exit -> applied false', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: '', stderr: 'boom', code: 1 }));
  const exec = makeAiderExecutor(run);
  const outcome = await exec.execute(step, '/repo');
  expect(outcome.applied).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/executor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/adapters/executor.ts`**

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProcessRunner } from './subprocess.js';
import type { PlanStep, ExecOutcome } from '../types.js';

export interface Executor {
  execute(step: PlanStep, cwd: string): Promise<ExecOutcome>;
}

export interface AiderOptions {
  aiderPath?: string;
  testCmd?: string;
}

export function makeAiderExecutor(run: ProcessRunner, opts: AiderOptions = {}): Executor {
  const aider = opts.aiderPath ?? join(homedir(), '.local', 'bin', 'aider');
  return {
    async execute(step, cwd) {
      const args = ['--model', 'openai/qwen-coder-32b', '--yes', '--no-auto-commits', '--message', step.description];
      if (opts.testCmd !== undefined) args.push('--test-cmd', opts.testCmd);
      for (const f of step.files) args.push(f);
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        OPENAI_API_BASE: 'http://localhost:4000/v1',
        OPENAI_API_KEY: 'dummy',
      };
      const res = await run(aider, args, { cwd, env, timeoutMs: 900_000 });
      return { applied: res.code === 0, output: res.stdout + res.stderr };
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/executor.test.ts`
Expected: 2 pass.

- [ ] **Step 5: Full suite + build gate**

Run: `npm run build && npm test`
Expected: build clean (strict, no `any`), all tests green.

- [ ] **Step 6: Commit**

```bash
git add src/adapters/executor.ts test/executor.test.ts
git commit -m "[P1.7] Add aider executor adapter (local Qwen, no-auto-commits)"
```

---

## Phase 1 exit criteria
- `npm run build` compiles under strict mode with zero `any`.
- `npm test` green across types, subprocess, gate, review-parse, reviewer, plan-parse, planner, executor.
- Every model boundary is behind an injected `ProcessRunner`, so the whole phase runs offline in CI.
- Nothing spawns a real model in tests; `combineVerdicts` is pure and exhaustively covered.

## Self-review notes
- **Spec coverage:** planner ✓ (T6), executor/aider ✓ (T7), three reviewers with correct roles ✓ (T5), gate rules incl. fail-closed + advisory-never-blocks ✓ (T3), exact model id/CLI values ✓ (T5/T7). Pipeline/worktree and daemon/queue are intentionally Phase 2/3.
- **Type consistency:** `ProcessRunner`, `ReviewRequest`, `Reviewer`, `Planner`, `Executor`, `Plan` names are used identically across tasks. `ExecOutcome` is `{applied, output}` in Phase 1; Phase 2 extends it (test running lives in the pipeline).
- **Honesty:** Qwen is a blocking reviewer AND the executor — represented faithfully (same model id in both adapters); no code or comment claims reviewers didn't write the code.
