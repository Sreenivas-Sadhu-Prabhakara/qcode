import { expect, test } from 'vitest';
import { runPipeline } from '../src/pipeline.js';
import type { PipelineDeps } from '../src/pipeline.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const runOk: ProcessRunner = async () => ({ stdout: '', stderr: '', code: 0 });

const baseDeps = (reviewerPass: boolean): PipelineDeps => ({
  planner: { plan: async (task: string) => ({ task, steps: [{ id: 's1', description: 'd', files: [] }], tests: [] }) },
  executor: { execute: async () => ({ applied: true, output: '' }) },
  reviewers: [
    {
      id: 'codex',
      role: 'blocking',
      review: async () => ({ reviewer: 'codex' as const, role: 'blocking' as const, passed: reviewerPass, findings: [], raw: '' }),
    },
  ],
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
