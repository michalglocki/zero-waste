export function buildReviewPrompt(
  diff: string,
  options?: { base?: string },
): string {
  const scope = options?.base
    ? `git range \`${options.base}...HEAD\` (pull request / branch diff)`
    : 'uncommitted git diff (`git diff HEAD`)';

  return `Review the following ${scope}.

Return ONLY the JSON review object described in your instructions (no markdown fences, no extra commentary).

\`\`\`diff
${diff}
\`\`\``;
}
