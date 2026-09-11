import { Output, ToolLoopAgent } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { DEFAULT_OPENROUTER_MODEL } from './default-model.js';
import { codeReviewInstructions } from '../prompts/instructions.js';
import { reviewOutputSchema } from '../schemas/review-output.js';

export type CreateCodeReviewerOptions = {
  apiKey: string;
  model?: string;
};

/**
 * Build a reusable code-review ToolLoopAgent (OpenRouter + structured Zod output, no tools).
 * Does not read process.env — callers resolve apiKey/model (e.g. CLI or future eval harness).
 */
export function createCodeReviewer(options: CreateCodeReviewerOptions) {
  const openrouter = createOpenRouter({ apiKey: options.apiKey });
  const modelId = options.model ?? DEFAULT_OPENROUTER_MODEL;

  return new ToolLoopAgent({
    model: openrouter(modelId),
    instructions: codeReviewInstructions,
    output: Output.object({
      schema: reviewOutputSchema,
    }),
  });
}

export type CodeReviewerAgent = ReturnType<typeof createCodeReviewer>;
