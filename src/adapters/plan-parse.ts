import type { Plan, AcceptanceTest, PlanStep } from '../types.js';

export function buildPlanPrompt(task: string): string {
  return `Please create a plan for: ${task}

The plan should include steps to implement the task, and a failing acceptance test suite that demonstrates the expected behavior but currently fails.

Return your response in a JSON format enclosed in a code fence block like this:

\`\`\`json
{
  "steps": [
    {
      "id": "step1",
      "description": "Create the initial project structure",
      "files": ["src/index.ts", "package.json"]
    }
  ],
  "tests": [
    {
      "path": "src/acceptance.test.ts",
      "content": "import { describe, it } from 'vitest'; describe('my task', () => { it('should work', async () => { // failing test } });"
    }
  ]
}
\`\`\`
`;
}

export function parsePlan(task: string, raw: string): Plan {
  const re = /```json\s*([\s\S]*?)```/g;
  let lastBody: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) { lastBody = m[1]; }
  
  if (lastBody === undefined) {
    throw new Error('planner returned no plan (no valid json block)');
  }
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastBody);
  } catch (e) {
    throw new Error('planner returned no plan (invalid json)');
  }
  
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('planner returned no plan (not an object)');
  }
  
  const parsedObj = parsed as Record<string, unknown>;
  
  const steps: PlanStep[] = [];
  if (Array.isArray(parsedObj.steps)) {
    for (const step of parsedObj.steps) {
      if (typeof step === 'object' && step !== null) {
        const stepObj = step as Record<string, unknown>;
        const id = typeof stepObj.id === 'string' ? stepObj.id : 'step';
        const description = typeof stepObj.description === 'string' ? stepObj.description : '';
        const files = Array.isArray(stepObj.files) ? stepObj.files.filter(f => typeof f === 'string') : [];
        steps.push({ id, description, files });
      }
    }
  }
  
  const tests: AcceptanceTest[] = [];
  if (Array.isArray(parsedObj.tests)) {
    for (const test of parsedObj.tests) {
      if (typeof test === 'object' && test !== null) {
        const testObj = test as Record<string, unknown>;
        const path = typeof testObj.path === 'string' ? testObj.path : 'acceptance.test.ts';
        const content = typeof testObj.content === 'string' ? testObj.content : '';
        tests.push({ path, content });
      }
    }
  }
  
  return { task, steps, tests };
}
