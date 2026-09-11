export function buildReviewPrompt(diff: string): string {
  return `Review the following uncommitted git diff (\`git diff HEAD\`).

Return structured findings for the change.

\`\`\`diff
${diff}
\`\`\``;
}
