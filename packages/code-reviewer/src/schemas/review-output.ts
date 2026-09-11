import { z } from 'zod';

export const reviewFindingSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  path: z.string().nullable(),
  message: z.string(),
});

export const reviewOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
  verdict: z.enum(['approve', 'comment', 'request_changes']),
});

export type ReviewFinding = z.infer<typeof reviewFindingSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
