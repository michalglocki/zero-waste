export function buildReviewPrompt(
  diff: string,
  options?: { base?: string },
): string {
  const scope = options?.base
    ? `git range \`${options.base}...HEAD\` (pull request / branch diff)`
    : 'uncommitted git diff (`git diff HEAD`)';

  return `Oceń podany diff (${scope}) w pięciu kryteriach w skali 1–10 (1 = poważne braki, 10 = wzorowo):
poprawność implementacji, idiomatyczność, złożoność, pokrycie testami względem ryzyka, bezpieczeństwo.

Emit JSON scores with English keys: correctness, idiomaticity, complexity, testCoverageVsRisk, security.
The CLI (not you) applies requirements.md §3 pass/fail thresholds — focus on accurate scores, findings, and a 2–3 sentence Markdown summary.

Stosuj rubryki z packages/code-reviewer/requirements.md (stack: Expo SDK 56, TypeScript, expo-router, Supabase RLS, jest-expo). Review ONLY dostarczonego diffu; zero szumu; findingi konkretne (ścieżka + dlaczego szkodzi w zero-waste).

Return ONLY the JSON review object described in your instructions (no markdown fences, no extra commentary).

\`\`\`diff
${diff}
\`\`\``;
}
