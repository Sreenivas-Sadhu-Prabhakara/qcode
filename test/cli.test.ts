import { expect, test } from 'vitest';
import { buildRunDeps } from '../src/cli.js';

test('buildRunDeps wires 3 reviewers: 2 blocking + 1 advisory', () => {
  const deps = buildRunDeps(async () => ({ stdout: '', stderr: '', code: 0 }), 'npm test');
  expect(deps.reviewers.map((r) => r.role).sort()).toEqual(['advisory', 'blocking', 'blocking']);
  expect(deps.reviewers.map((r) => r.id).sort()).toEqual(['codex', 'gemini', 'qwen']);
  expect(deps.testCmd).toBe('npm test');
});
