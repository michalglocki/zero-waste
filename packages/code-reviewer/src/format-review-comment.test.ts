import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatReviewCommentMarkdown } from './format-review-comment.js';
import type { ReviewOutput } from './schemas/review-output.js';

const fixture: ReviewOutput = {
  summary: 'Diff looks solid. One follow-up on test coverage for the RPC path.',
  findings: [
    {
      severity: 'warning',
      path: 'src/services/stock.ts',
      message: 'No integration assert for deny path.',
    },
  ],
  scores: {
    correctness: 8,
    idiomaticity: 7,
    complexity: 8,
    testCoverageVsRisk: 6,
    security: 8,
  },
  passFail: 'pass',
  verdict: 'comment',
};

describe('formatReviewCommentMarkdown', () => {
  it('keeps upsert heading and scores table with PL labels', () => {
    const md = formatReviewCommentMarkdown(fixture, {
      baseRefLabel: 'origin/main...HEAD',
    });

    assert.match(md, /^## Code reviewer report/m);
    assert.match(md, /\| Poprawność implementacji \| 8 \|/);
    assert.match(md, /\| Idiomatyczność \| 7 \|/);
    assert.match(md, /\| Złożoność \| 8 \|/);
    assert.match(md, /\| Pokrycie testami względem ryzyka \| 6 \|/);
    assert.match(md, /\| Bezpieczeństwo \| 8 \|/);
    assert.match(md, /\*\*Werdykt:\*\* pass/);
    assert.ok(md.includes(fixture.summary));
    assert.ok(md.indexOf('## Scores') < md.indexOf('**Werdykt:**'));
    assert.ok(md.indexOf('**Werdykt:**') < md.indexOf('## Podsumowanie'));
    assert.ok(md.indexOf('## Podsumowanie') < md.indexOf('<details>'));
    assert.match(md, /Structured review JSON/);
    assert.ok(md.includes('"passFail": "pass"'));
  });

  it('renders fail verdict from passFail', () => {
    const md = formatReviewCommentMarkdown({
      ...fixture,
      passFail: 'fail',
      verdict: 'request_changes',
      scores: { ...fixture.scores, security: 4 },
    });
    assert.match(md, /\*\*Werdykt:\*\* fail/);
  });
});
