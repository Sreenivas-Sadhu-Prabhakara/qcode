import { ReviewVerdict, GateResult, ReviewerId, Finding } from './types.js';

export function combineVerdicts(verdicts: ReviewVerdict[]): GateResult {
  const blocking: ReviewVerdict[] = [];
  const advisory: ReviewVerdict[] = [];

  for (const verdict of verdicts) {
    if (verdict.role === 'blocking') {
      blocking.push(verdict);
    } else if (verdict.role === 'advisory') {
      advisory.push(verdict);
    }
  }

  if (blocking.length === 0) {
  throw new Error('gate requires at least one blocking reviewer');
}

  const vetoedBy: ReviewerId[] = [];
  const blockingFindings: Finding[] = [];

  for (const verdict of blocking) {
    if (!verdict.passed) {
      vetoedBy.push(verdict.reviewer);
      blockingFindings.push(...verdict.findings);
    }
  }

  const advisoryFindings: Finding[] = [];
  for (const verdict of advisory) {
    advisoryFindings.push(...verdict.findings);
  }

  return {
    passed: vetoedBy.length === 0,
    vetoedBy,
    blockingFindings,
    advisoryFindings
  };
}
