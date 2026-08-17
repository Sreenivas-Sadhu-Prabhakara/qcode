import { ReviewVerdict, ReviewerId, ReviewRole } from '../types.js';
import { Finding } from '../types.js';

export interface ReviewRequest {
  task: string;
  diff: string;
  testOutput: string;
}

export function buildReviewPrompt(req: ReviewRequest): string {
  return `Please review the following diff and test output:

\`\`\`
${req.diff}
\`\`\`

Test output:
\`\`\`
${req.testOutput}
\`\`\`

Refute any claims in the test output that are incorrect or incomplete.

Please provide your review in the following JSON format:
\`\`\`json
{
  "passed": true,
  "findings": [
    {
      "summary": "string",
      "failingScenario": "string",
      "severity": "high" | "medium" | "low"
    }
  ]
}
\`\`\`
`;
}

export function parseVerdict(id: ReviewerId, role: ReviewRole, raw: string): ReviewVerdict {
  const re = /```json\s*([\s\S]*?)```/g;
  let lastBody: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    lastBody = m[1];
  }

  if (lastBody === undefined) {
    if (role === 'advisory') {
      return {
        reviewer: id,
        role,
        passed: true,
        raw,
        findings: []
      };
    } else {
      return {
        reviewer: id,
        role,
        passed: false,
        raw,
        findings: [{
          summary: 'reviewer produced no parseable verdict',
          failingScenario: 'output missing json block',
          severity: 'high'
        }]
      };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(lastBody);
  } catch (e) {
    if (role === 'advisory') {
      return {
        reviewer: id,
        role,
        passed: true,
        raw,
        findings: []
      };
    } else {
      return {
        reviewer: id,
        role,
        passed: false,
        raw,
        findings: [{
          summary: 'reviewer produced no parseable verdict',
          failingScenario: 'output missing json block',
          severity: 'high'
        }]
      };
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    if (role === 'advisory') {
      return {
        reviewer: id,
        role,
        passed: true,
        raw,
        findings: []
      };
    } else {
      return {
        reviewer: id,
        role,
        passed: false,
        raw,
        findings: [{
          summary: 'reviewer produced no parseable verdict',
          failingScenario: 'output missing json block',
          severity: 'high'
        }]
      };
    }
  }

  const parsedObj = parsed as Record<string, unknown>;

  if (!('passed' in parsedObj) || typeof parsedObj.passed !== 'boolean') {
    if (role === 'advisory') {
      return {
        reviewer: id,
        role,
        passed: true,
        raw,
        findings: []
      };
    } else {
      return {
        reviewer: id,
        role,
        passed: false,
        raw,
        findings: [{
          summary: 'reviewer produced no parseable verdict',
          failingScenario: 'output missing json block',
          severity: 'high'
        }]
      };
    }
  }

  const findings: Finding[] = [];
  if (Array.isArray(parsedObj.findings)) {
    for (const finding of parsedObj.findings) {
      if (typeof finding === 'object' && finding !== null) {
        const findingObj = finding as Record<string, unknown>;
        const summary = typeof findingObj.summary === 'string' ? findingObj.summary : 'unspecified';
        const failingScenario = typeof findingObj.failingScenario === 'string' ? findingObj.failingScenario : 'unspecified';
        const severity = (findingObj.severity === 'high' || findingObj.severity === 'medium' || findingObj.severity === 'low') 
          ? findingObj.severity 
          : 'medium';
        
        findings.push({
          summary,
          failingScenario,
          severity
        });
      }
    }
  }

  return {
    reviewer: id,
    role,
    passed: parsedObj.passed as boolean,
    raw,
    findings
  };
}
