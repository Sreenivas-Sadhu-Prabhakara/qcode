export type ReviewerId = 'qwen' | 'codex' | 'gemini';
export type ReviewRole = 'blocking' | 'advisory';
export type Severity = 'high' | 'medium' | 'low';

export interface Finding {
  summary: string;
  failingScenario: string;
  severity: Severity;
}

export interface ReviewVerdict {
  reviewer: ReviewerId;
  role: ReviewRole;
  passed: boolean;
  findings: Finding[];
  raw: string;
}

export interface GateResult {
  passed: boolean;
  vetoedBy: ReviewerId[];
  blockingFindings: Finding[];
  advisoryFindings: Finding[];
}

export interface PlanStep {
  id: string;
  description: string;
  files: string[];
}

export interface AcceptanceTest {
  path: string;
  content: string;
}

export interface Plan {
  task: string;
  steps: PlanStep[];
  tests: AcceptanceTest[];
}

export interface ExecOutcome {
  applied: boolean;
  output: string;
}
