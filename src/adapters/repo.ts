import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { ProcessRunner } from './subprocess.js';
import type { AcceptanceTest } from '../types.js';

export async function writeTests(cwd: string, tests: AcceptanceTest[]): Promise<void> {
  for (const t of tests) {
    const full = join(cwd, t.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, t.content, 'utf8');
  }
}

export async function gitDiff(run: ProcessRunner, cwd: string): Promise<string> {
  await run('git', ['add', '-A'], { cwd, timeoutMs: 60000 });
  const res = await run('git', ['diff', '--cached'], { cwd, timeoutMs: 60000 });
  return res.stdout;
}

export async function runAcceptance(run: ProcessRunner, cwd: string, testCmd: string): Promise<{ passed: boolean; output: string }> {
  const parts = testCmd.split(' ');
  const cmd = parts[0];
  if (cmd === undefined) throw new Error('empty testCmd');
  const args = parts.slice(1);
  const res = await run(cmd, args, { cwd, timeoutMs: 900000 });
  return { passed: res.code === 0, output: res.stdout + res.stderr };
}
