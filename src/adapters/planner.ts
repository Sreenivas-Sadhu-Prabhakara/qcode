import type { ProcessRunner } from './subprocess.js';
import type { Plan } from '../types.js';
import { parsePlan } from './plan-parse.js';

export interface Planner { plan(task: string, cwd: string): Promise<Plan>; }

export function makeClaudePlanner(run: ProcessRunner): Planner {
  return {
    async plan(task: string, cwd: string): Promise<Plan> {
      const res = await run('claude', ['-p', task], { cwd, timeoutMs: 600000 });
      if (res.code !== 0) {
        throw new Error(`claude planner exited ${res.code}: ${res.stderr}`);
      }
      return parsePlan(task, res.stdout);
    }
  };
}
