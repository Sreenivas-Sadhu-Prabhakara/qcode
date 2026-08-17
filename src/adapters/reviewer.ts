import type { ProcessRunner } from './subprocess.js';
import type { ReviewVerdict, ReviewRole, ReviewerId } from '../types.js';
import { type ReviewRequest, buildReviewPrompt, parseVerdict } from './review-parse.js';

export interface Reviewer {
  readonly id: ReviewerId;
  readonly role: ReviewRole;
  review(req: ReviewRequest, cwd: string): Promise<ReviewVerdict>;
}

export function makeCodexReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'codex',
    role: 'blocking',
    async review(req, cwd) {
      const prompt = buildReviewPrompt(req);
      const res = await run('codex', ['exec', prompt], { cwd, timeoutMs: 300000 });
      return parseVerdict('codex', 'blocking', res.stdout);
    }
  };
}

export function makeGeminiReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'gemini',
    role: 'advisory',
    async review(req, cwd) {
      const prompt = buildReviewPrompt(req);
      const res = await run('gemini', ['-p', prompt, '--approval-mode', 'plan'], { cwd, timeoutMs: 300000 });
      return parseVerdict('gemini', 'advisory', res.stdout);
    }
  };
}

export function makeQwenReviewer(run: ProcessRunner): Reviewer {
  return {
    id: 'qwen',
    role: 'blocking',
    async review(req, cwd) {
      const prompt = buildReviewPrompt(req);
      const body = JSON.stringify({
        model: 'qwen-coder-32b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096
      });
      const res = await run('curl', ['-s', 'http://localhost:4000/v1/chat/completions', '-H', 'Content-Type: application', '-H', 'Authorization: Bearer dummy', '-d', body], { cwd, timeoutMs: 300000 });
      
      let content = '';
      try {
        const parsed = JSON.parse(res.stdout) as { choices?: Array<{ message?: { content?: string } }> };
        content = parsed.choices?.[0]?.message?.content ?? '';
      } catch {
        // If parsing fails, content remains empty
      }
      
      return parseVerdict('qwen', 'blocking', content);
    }
  };
}
