import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { finalizeReviewOutput } from './finalize-review-output.js';
import type {
  ReviewAgentOutput,
  ReviewScores,
} from '../schemas/review-output.js';

function scores(overrides: Partial<ReviewScores> = {}): ReviewScores {
  return {
    correctness: 8,
    idiomaticity: 8,
    complexity: 8,
    testCoverageVsRisk: 8,
    security: 8,
    ...overrides,
  };
}

function agent(
  overrides: Partial<ReviewAgentOutput> & {
    scores?: ReviewScores;
  } = {},
): ReviewAgentOutput {
  return {
    summary: 'Looks good.',
    findings: [],
    scores: scores(),
    ...overrides,
  };
}

describe('finalizeReviewOutput', () => {
  it('fails when any score is exactly 4', () => {
    const out = finalizeReviewOutput(
      agent({ scores: scores({ correctness: 4 }) }),
    );
    assert.equal(out.passFail, 'fail');
    assert.equal(out.verdict, 'request_changes');
  });

  it('passes score exactly 5 when other thresholds hold', () => {
    // mean = (5+8+8+8+8)/5 = 7.4; security 8 ≥ 6
    const out = finalizeReviewOutput(
      agent({ scores: scores({ correctness: 5 }) }),
    );
    assert.equal(out.passFail, 'pass');
    assert.equal(out.verdict, 'approve');
  });

  it('fails when security is exactly 5', () => {
    const out = finalizeReviewOutput(
      agent({ scores: scores({ security: 5 }) }),
    );
    assert.equal(out.passFail, 'fail');
    assert.equal(out.verdict, 'request_changes');
  });

  it('passes when security is exactly 6 and mean is ≥ 6', () => {
    const out = finalizeReviewOutput(
      agent({ scores: scores({ security: 6 }) }),
    );
    assert.equal(out.passFail, 'pass');
    // security 6 is in 6–7 → comment (intentional strictness)
    assert.equal(out.verdict, 'comment');
  });

  it('fails when mean is 5.8', () => {
    // 5+5+5+7+7 = 29 → mean 5.8
    const out = finalizeReviewOutput(
      agent({
        scores: scores({
          correctness: 5,
          idiomaticity: 5,
          complexity: 5,
          testCoverageVsRisk: 7,
          security: 7,
        }),
      }),
    );
    assert.equal(out.passFail, 'fail');
    assert.equal(out.verdict, 'request_changes');
  });

  it('passes when mean is exactly 6.0', () => {
    const out = finalizeReviewOutput(
      agent({
        scores: scores({
          correctness: 6,
          idiomaticity: 6,
          complexity: 6,
          testCoverageVsRisk: 6,
          security: 6,
        }),
      }),
    );
    assert.equal(out.passFail, 'pass');
    assert.equal(out.verdict, 'comment');
  });

  it('fails on any error finding even with high scores', () => {
    const out = finalizeReviewOutput(
      agent({
        findings: [
          {
            severity: 'error',
            path: 'src/x.ts',
            message: 'RLS bypass',
          },
        ],
      }),
    );
    assert.equal(out.passFail, 'fail');
    assert.equal(out.verdict, 'request_changes');
  });

  it('maps clean high scores to approve', () => {
    const out = finalizeReviewOutput(agent());
    assert.equal(out.passFail, 'pass');
    assert.equal(out.verdict, 'approve');
    assert.deepEqual(out.scores, scores());
  });

  it('maps pass with warning finding to comment', () => {
    const out = finalizeReviewOutput(
      agent({
        findings: [
          {
            severity: 'warning',
            path: null,
            message: 'Minor convention drift',
          },
        ],
      }),
    );
    assert.equal(out.passFail, 'pass');
    assert.equal(out.verdict, 'comment');
  });

  it('maps pass with any score in 6–7 to comment', () => {
    const out = finalizeReviewOutput(
      agent({ scores: scores({ complexity: 7 }) }),
    );
    assert.equal(out.passFail, 'pass');
    assert.equal(out.verdict, 'comment');
  });

  it('overwrites model-supplied wrong verdict and passFail', () => {
    const out = finalizeReviewOutput(
      agent({
        scores: scores({ correctness: 3 }),
        passFail: 'pass',
        verdict: 'approve',
      }),
    );
    assert.equal(out.passFail, 'fail');
    assert.equal(out.verdict, 'request_changes');
  });

  it('finalized shape includes scores, passFail, and verdict', () => {
    const out = finalizeReviewOutput(agent());
    assert.ok('scores' in out);
    assert.ok('passFail' in out);
    assert.ok('verdict' in out);
    assert.equal(typeof out.scores.correctness, 'number');
  });
});
