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
