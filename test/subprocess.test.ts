import { expect, test } from 'vitest';
import { runProcess } from '../src/adapters/subprocess.js';

test('captures stdout and exit code', async () => {
  const r = await runProcess('node', ['-e', 'process.stdout.write("hi")']);
  expect(r.stdout).toBe('hi');
  expect(r.code).toBe(0);
});

test('passes stdin to the process', async () => {
  const r = await runProcess('node', ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'echo-me' });
  expect(r.stdout).toBe('echo-me');
});

test('rejects on timeout', async () => {
  await expect(
    runProcess('node', ['-e', 'setTimeout(()=>{}, 5000)'], { timeoutMs: 100 }),
  ).rejects.toThrow(/timed out/);
});

test('rejects (does not hang or throw) when the command cannot be spawned', async () => {
  await expect(
    runProcess('this-command-does-not-exist-xyz', []),
  ).rejects.toThrow();
});

test('does not leave a dangling timer when the process finishes before the timeout', async () => {
  // If the timer is not cleared, the event loop stays alive; vitest would hang.
  const r = await runProcess('node', ['-e', 'process.stdout.write("ok")'], { timeoutMs: 10_000 });
  expect(r.stdout).toBe('ok');
});
