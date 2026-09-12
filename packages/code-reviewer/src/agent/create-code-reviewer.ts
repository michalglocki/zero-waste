import { Agent, CursorAgentError } from '@cursor/sdk';

import { DEFAULT_CURSOR_MODEL } from './default-model.js';
import { parseReviewOutput } from './parse-review-output.js';
import { codeReviewInstructions } from '../prompts/instructions.js';
import type { ReviewOutput } from '../schemas/review-output.js';

export type CreateCodeReviewerOptions = {
  apiKey: string;
  model?: string;
  /** Working directory for the local Cursor agent (default: process.cwd()). */
  cwd?: string;
};

export type CodeReviewerGenerateResult = {
  output: ReviewOutput;
};

/**
 * Build a reusable code-reviewer backed by the Cursor SDK (local Agent.prompt).
 * Does not read process.env — callers resolve apiKey/model (e.g. CLI or CI).
 */
export function createCodeReviewer(options: CreateCodeReviewerOptions) {
  const modelId = options.model ?? DEFAULT_CURSOR_MODEL;
  const cwd = options.cwd ?? process.cwd();

  return {
    async generate(input: {
      prompt: string;
    }): Promise<CodeReviewerGenerateResult> {
      const message = `${codeReviewInstructions}

${input.prompt}`;

      let runResult;
      try {
        runResult = await Agent.prompt(message, {
          apiKey: options.apiKey,
          model: { id: modelId },
          local: { cwd },
        });
      } catch (error) {
        if (error instanceof CursorAgentError) {
          throw new Error(
            `Cursor agent failed to start: ${error.message} (retryable=${error.isRetryable})`,
          );
        }
        throw error;
      }

      if (runResult.status !== 'finished') {
        const detail =
          runResult.error?.message ?? `status=${runResult.status}`;
        throw new Error(`Cursor agent run failed: ${detail}`);
      }

      const text = runResult.result?.trim();
      if (!text) {
        throw new Error('Cursor agent returned an empty result');
      }

      return { output: parseReviewOutput(text) };
    },
  };
}

export type CodeReviewerAgent = ReturnType<typeof createCodeReviewer>;
