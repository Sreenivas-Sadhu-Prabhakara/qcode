#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { runProcess } from './adapters/subprocess.js';
import { makeClaudePlanner } from './adapters/planner.js';
import { makeAiderExecutor } from './adapters/executor.js';
import { makeQwenReviewer, makeCodexReviewer, makeGeminiReviewer } from './adapters/reviewer.js';
import { runPipeline, type PipelineDeps } from './pipeline.js';
import { makeGitWorktreeManager } from './worktree.js';

export function buildRunDeps(run: typeof runProcess, testCmd: string): PipelineDeps {
  return {
    planner: makeClaudePlanner(run),
    executor: makeAiderExecutor(run, { testCmd }),
    reviewers: [makeQwenReviewer(run), makeCodexReviewer(run), makeGeminiReviewer(run)],
    worktree: makeGitWorktreeManager(run),
    run,
    testCmd,
  };
}

export async function main(argv: string[]): Promise<number> {
  if (argv[0] !== 'run') {
    console.log('usage: qcode run "<task>" --repo <path> [--test-cmd <cmd>]');
    return 1;
  }
  const task = argv[1];
  if (task === undefined) {
    console.log('error: missing task');
    return 1;
  }
  const repoIdx = argv.indexOf('--repo');
  const repo = repoIdx >= 0 ? argv[repoIdx + 1] : undefined;
  if (repo === undefined) {
    console.log('error: --repo <path> required');
    return 1;
  }
  const testIdx = argv.indexOf('--test-cmd');
  const testCmd = testIdx >= 0 && argv[testIdx + 1] !== undefined ? argv[testIdx + 1] as string : 'npm test';
  const jobId = 'job-' + Date.now().toString(36);
  const deps = buildRunDeps(runProcess, testCmd);
  const result = await runPipeline(deps, task, repo, jobId);
  console.log('status: ' + result.status + ' (loops: ' + result.loops + ')');
  console.log(result.diff);
  return result.status === 'done' ? 0 : 1;
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exit(code); }).catch((err: unknown) => { console.error(err); process.exit(1); });
}
