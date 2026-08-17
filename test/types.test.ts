import { expect, test } from 'vitest';
import type { Finding } from '../src/types.js';

test('Finding shape compiles and holds values', () => {
  const f: Finding = { summary: 's', failingScenario: 'x->y', severity: 'high' };
  expect(f.severity).toBe('high');
});
