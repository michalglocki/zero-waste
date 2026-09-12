import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatReviewCommentMarkdown } from './format-review-comment.js';
import { reviewOutputSchema } from './schemas/review-output.js';

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

/**
 * CLI: read finalized ReviewOutput JSON from a file path, print PR comment markdown.
 * Usage: tsx src/print-review-comment.ts <path-to-review-output.json> [baseRefLabel]
 */
export function main(argv = process.argv.slice(2)): void {
  const jsonPath = argv[0]?.trim();
  if (!jsonPath) {
    fail(
      'Usage: tsx src/print-review-comment.ts <review-output.json> [baseRefLabel]',
    );
  }

  const baseRefLabel = argv[1]?.trim() || undefined;

  let raw: string;
  try {
    raw = readFileSync(jsonPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Failed to read ${jsonPath}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`Invalid JSON in ${jsonPath}: ${detail}`);
  }

  const result = reviewOutputSchema.safeParse(parsed);
  if (!result.success) {
    fail(
      `Review JSON does not match finalized schema: ${result.error.message}`,
    );
  }

  process.stdout.write(
    formatReviewCommentMarkdown(result.data, { baseRefLabel }) + '\n',
  );
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
