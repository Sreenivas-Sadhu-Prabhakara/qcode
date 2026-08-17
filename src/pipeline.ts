import type { JobResult, GateResult } from './types.js';
import type { Planner } from './adapters/planner.js';
import type { Executor } from './adapters/executor.js';
import type { Reviewer } from './adapters/reviewer.js';
import type { WorktreeManager } from './worktree.js';
import type { ProcessRunner } from './adapters/subprocess.js';
import { combineVerdicts } from './gate.js';
import { writeTests, gitDiff, runAcceptance } from './adapters/repo.js';

export interface PipelineDeps {
  planner: Planner;
  executor: Executor;
  reviewers: Reviewer[];
  worktree: WorktreeManager;
  run: ProcessRunner;
  testCmd: string;
  maxLoops?: number;
}

export async function runPipeline(deps: PipelineDeps, task: string, repoRoot: string, jobId: string): Promise<JobResult> {
  const maxLoops = deps.maxLoops ?? 3;
  const plan = await deps.planner.plan(task, repoRoot);
  const dir = await deps.worktree.create(repoRoot, jobId);
  await writeTests(dir, plan.tests);
  let lastGate: GateResult = { passed: false, vetoedBy: [], blockingFindings: [], advisoryFindings: [] };
  let lastDiff = '';
  let lastOutput = '';
  let loopCount = 0;
  for (let i = 1; i <= maxLoops; i++) {
    loopCount = i;
    for (const step of plan.steps) {
      await deps.executor.execute(step, dir);
    }
    const acceptance = await runAcceptance(deps.run, dir, deps.testCmd);
    const diff = await gitDiff(deps.run, dir);
    const verdicts = await Promise.all(deps.reviewers.map((r) => r.review({ task, diff, testOutput: acceptance.output }, dir)));
    const gate = combineVerdicts(verdicts);
    lastGate = gate;
    lastDiff = diff;
    lastOutput = acceptance.output;
    if (acceptance.passed && gate.passed) {
      return { status: 'done', diff, testOutput: acceptance.output, gate, loops: loopCount };
    }
  }
  return { status: 'blocked', diff: lastDiff, testOutput: lastOutput, gate: lastGate, loops: loopCount };
}
