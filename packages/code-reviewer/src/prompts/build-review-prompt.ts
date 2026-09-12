export function buildReviewPrompt(diff: string): string {
  return `Review the following uncommitted git diff (\`git diff HEAD\`).

Return ONLY the JSON review object described in your instructions (no markdown fences, no extra commentary).

\`\`\`diff
${diff}
\`\`\``;
}
