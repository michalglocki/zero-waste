import {
  reviewOutputSchema,
  type ReviewOutput,
} from '../schemas/review-output.js';

/**
 * Extract and validate review JSON from agent text (raw JSON or fenced block).
 */
export function parseReviewOutput(text: string): ReviewOutput {
  const candidates = collectJsonCandidates(text);
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      return reviewOutputSchema.parse(parsed);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Could not parse review JSON from agent result. ${errors[0] ?? 'No JSON found.'}`,
  );
}

function collectJsonCandidates(text: string): string[] {
  const trimmed = text.trim();
  const candidates: string[] = [];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  if (trimmed.startsWith('{')) {
    candidates.push(trimmed);
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return [...new Set(candidates)];
}
