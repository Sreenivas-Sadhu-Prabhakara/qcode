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
