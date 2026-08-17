import { expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTests, gitDiff, runAcceptance } from '../src/adapters/repo.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

test('writeTests writes files with nested dirs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qc-'));
  await writeTests(dir, [{ path: 'test/a.test.ts', content: 'X' }]);
  expect(await readFile(join(dir, 'test/a.test.ts'), 'utf8')).toBe('X');
  await rm(dir, { recursive: true, force: true });
});

test('gitDiff stages then diffs cached', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'DIFF', stderr: '', code: 0 }));
  const out = await gitDiff(run, '/repo');
  expect(out).toBe('DIFF');
  expect(run).toHaveBeenCalledWith('git', ['add', '-A'], expect.objectContaining({ cwd: '/repo' }));
});

test('runAcceptance reports pass on exit 0', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: 'ok', stderr: '', code: 0 }));
  const r = await runAcceptance(run, '/repo', 'npm test');
  expect(r.passed).toBe(true);
  expect(r.output).toContain('ok');
});
