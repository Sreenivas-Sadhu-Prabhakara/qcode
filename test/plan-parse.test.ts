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
