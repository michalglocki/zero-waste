import type {
  ReviewAgentOutput,
  ReviewOutput,
  ReviewScores,
} from '../schemas/review-output.js';

function scoreValues(scores: ReviewScores): number[] {
  return [
    scores.correctness,
    scores.idiomaticity,
    scores.complexity,
    scores.testCoverageVsRisk,
    scores.security,
  ];
}

/**
 * Apply requirements.md §3 thresholds and map passFail → verdict (model fields overwritten).
 */
export function finalizeReviewOutput(
  agentOutput: ReviewAgentOutput,
): ReviewOutput {
  const values = scoreValues(agentOutput.scores);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const hasErrorFinding = agentOutput.findings.some(
    (finding) => finding.severity === 'error',
  );

  const fail =
    values.some((value) => value <= 4) ||
    agentOutput.scores.security <= 5 ||
    mean < 6 ||
    hasErrorFinding;

  const passFail: ReviewOutput['passFail'] = fail ? 'fail' : 'pass';

  let verdict: ReviewOutput['verdict'];
  if (passFail === 'fail') {
    verdict = 'request_changes';
  } else {
    const hasWarning = agentOutput.findings.some(
      (finding) => finding.severity === 'warning',
    );
    const anyScoreInSixToSeven = values.some(
      (value) => value >= 6 && value <= 7,
    );
    verdict = hasWarning || anyScoreInSixToSeven ? 'comment' : 'approve';
  }

  return {
    summary: agentOutput.summary,
    findings: agentOutput.findings,
    scores: agentOutput.scores,
    passFail,
    verdict,
  };
}
