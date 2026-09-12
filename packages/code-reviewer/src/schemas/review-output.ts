import { z } from 'zod';

export const reviewFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  path: z.string().nullable(),
  message: z.string(),
});

export const reviewScoresSchema = z.object({
  correctness: z.number().int().min(1).max(10),
  idiomaticity: z.number().int().min(1).max(10),
  complexity: z.number().int().min(1).max(10),
  testCoverageVsRisk: z.number().int().min(1).max(10),
  security: z.number().int().min(1).max(10),
});

/** What parse accepts from the model; optional verdict/passFail are ignored by finalize. */
export const reviewAgentOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
  scores: reviewScoresSchema,
  verdict: z.enum(['approve', 'comment', 'request_changes']).optional(),
  passFail: z.enum(['pass', 'fail']).optional(),
});

/** Post-finalize stdout/library shape: binding passFail + mapped verdict required. */
export const reviewOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
  scores: reviewScoresSchema,
  passFail: z.enum(['pass', 'fail']),
  verdict: z.enum(['approve', 'comment', 'request_changes']),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewScores = z.infer<typeof reviewScoresSchema>;
export type ReviewAgentOutput = z.infer<typeof reviewAgentOutputSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
