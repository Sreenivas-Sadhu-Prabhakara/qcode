import { join } from 'node:path';
import type { ProcessRunner } from './adapters/subprocess.js';

export interface WorktreeManager {
  create(repoRoot: string, jobId: string): Promise<string>;
  remove(repoRoot: string, dir: string): Promise<void>;
}

export function makeGitWorktreeManager(run: ProcessRunner): WorktreeManager {
  return {
    async create(repoRoot: string, jobId: string): Promise<string> {
      const dir = join(repoRoot, '.qcode-worktrees', jobId);
      const branch = 'qcode/' + jobId;
      const res = await run('git', ['worktree', 'add', '-b', branch, dir], { 
        cwd: repoRoot,
        timeoutMs: 60000
      });
      if (res.code !== 0) {
        throw new Error('git worktree add failed: ' + res.stderr);
      }
      return dir;
    },
    
    async remove(repoRoot: string, dir: string): Promise<void> {
      const res = await run('git', ['worktree', 'remove', '--force', dir], { 
        cwd: repoRoot,
        timeoutMs: 60000
      });
      if (res.code !== 0) {
        throw new Error('git worktree remove failed: ' + res.stderr);
      }
    }
  };
}
