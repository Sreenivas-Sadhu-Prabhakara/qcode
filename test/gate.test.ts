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
