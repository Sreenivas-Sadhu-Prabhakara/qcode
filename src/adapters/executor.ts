import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProcessRunner } from './subprocess.js';
import type { PlanStep, ExecOutcome } from '../types.js';

export interface Executor { execute(step: PlanStep, cwd: string): Promise<ExecOutcome> }
export interface AiderOptions { aiderPath?: string; testCmd?: string; }

export function makeAiderExecutor(run: ProcessRunner, opts: AiderOptions = {}): Executor {
  const aider = opts.aiderPath ?? join(homedir(), '.local', 'bin', 'aider');
  return {
    async execute(step: PlanStep, cwd: string): Promise<ExecOutcome> {
      const args: string[] = ['--model', 'openai/qwen-coder-32b', '--yes', '--no-auto-commits', '--message', step.description];
      if (opts.testCmd !== undefined) args.push('--test-cmd', opts.testCmd);
      for (const f of step.files) args.push(f);
      const env: NodeJS.ProcessEnv = { ...process.env, OPENAI_API_BASE: 'http://localhost:4000/v1', OPENAI_API_KEY: 'dummy' };
      const res = await run(aider, args, { cwd, env, timeoutMs: 900000 });
      return { applied: res.code === 0, output: res.stdout + res.stderr };
    }
  };
}
