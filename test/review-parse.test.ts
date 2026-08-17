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
