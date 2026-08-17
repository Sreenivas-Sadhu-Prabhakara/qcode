import { expect, test, vi } from 'vitest';
import { makeAiderExecutor } from '../src/adapters/executor.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const step = { id: 's1', description: 'write the code', files: ['src/x.ts'] };

test('executes aider with model, no-auto-commits, message, files, and local base env', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'done', stderr: '', code: 0 }));
  const exec = makeAiderExecutor(run, { testCmd: 'npm test' });
  const outcome = await exec.execute(step, '/repo');
  expect(outcome.applied).toBe(true);
  const call = run.mock.calls[0];
  const cmd = call?.[0] ?? '';
  const args = call?.[1] ?? [];
  const opts = call?.[2];
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
