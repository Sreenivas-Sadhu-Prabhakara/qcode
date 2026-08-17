import { expect, test, vi } from 'vitest';
import { makeCodexReviewer, makeGeminiReviewer, makeQwenReviewer } from '../src/adapters/reviewer.js';
import type { ProcessRunner } from '../src/adapters/subprocess.js';

const okJson = '```json\n{"passed": true, "findings": []}\n```';
const req = { task: 't', diff: 'd', testOutput: 'green' };

test('codex reviewer spawns `codex exec` and is blocking', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: okJson, stderr: '', code: 0 }));
  const r = makeCodexReviewer(run);
  expect(r.id).toBe('codex');
  expect(r.role).toBe('blocking');
  const v = await r.review(req, '/repo');
  expect(run).toHaveBeenCalledWith('codex', expect.arrayContaining(['exec']), expect.objectContaining({ cwd: '/repo' }));
  expect(v.passed).toBe(true);
});

test('gemini reviewer spawns headless read-only mode and is advisory', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({ stdout: okJson, stderr: '', code: 0 }));
  const r = makeGeminiReviewer(run);
  expect(r.role).toBe('advisory');
  await r.review(req, '/repo');
  const args = run.mock.calls[0]?.[1] ?? [];
  expect(args).toContain('-p');
  expect(args).toContain('--approval-mode');
  expect(args).toContain('plan');
});

test('qwen reviewer is blocking and parses the chat-completions content', async () => {
  const run = vi.fn<ProcessRunner>(async () => ({
    stdout: JSON.stringify({ choices: [{ message: { content: okJson } }] }), stderr: '', code: 0,
  }));
  const r = makeQwenReviewer(run);
  expect(r.role).toBe('blocking');
  const v = await r.review(req, '/repo');
  expect(v.reviewer).toBe('qwen');
  expect(v.passed).toBe(true);
});
