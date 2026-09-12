# CI/CD scored code review — Plan Brief

> Full plan: `context/changes/ci-cd-code-review/plan.md`
> Research: `context/changes/ci-cd-code-review/research.md`

## What & Why

Wire the existing PR code-review bot to `packages/code-reviewer/requirements.md`: five scored criteria, binding pass/fail, and an actionable Markdown report. Today CI only trusts a free-form `verdict` string; authors see raw JSON. We need merge gates that actually enforce the published thresholds.

## Starting Point

`packages/code-reviewer` + `.github/workflows/code-review.yml` already run Cursor cloud on same-repo PRs, comment JSON, and fail on `request_changes`. Schema has no scores; prompts are generic; `requirements.md` is untracked; AGENTS.md denies workflows.

## Desired End State

On each same-repo PR, the bot posts scores + pass/fail + a short summary; the CLI deterministically applies §3 thresholds and maps to `approve`/`comment`/`request_changes`; package tests and workflow typecheck guard the gate; docs match reality.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| -------- | ------ | ---------------- | ------ |
| Who computes pass/fail | Deterministic CLI post-parse | Model can lie about averages; CI must enforce §3 | Plan |
| Score schema | Nested English keys + dual Zod (agent vs finalized) | Clean TS/CI; parse without requiring model verdict | Plan (F1 Fix A) |
| Error findings | Any `severity===error` → fail + prompt discipline | Deterministic CI; no content heuristics | Plan (F2 Fix A) |
| Rubric delivery | Condensed `instructions.ts` + commit `requirements.md` | Stable prompt without runtime file I/O; human SoT in git | Plan |
| PR UX | Issue-comment upsert; scores first | Already works; minimal workflow risk | Plan |
| Verification | Package unit tests + workflow typecheck/test + AGENTS/README | Guard merge-blocking path; fix docs drift | Plan |
| Keep `REVIEW_FAIL_ON=request_changes` | Yes, via mapped `verdict` | Avoid rewriting fail plumbing | Research |

## Scope

**In scope:** Zod scores, finalize thresholds, prompts, commit requirements, comment formatter, workflow typecheck/test + comment body, AGENTS/README.

**Out of scope:** Official PR Reviews API, Cursor retries, fork-PR reviews, app/deploy CI, runtime full-file prompt inject, SARIF/evals, diff redaction.

## Architecture / Approach

```
diff → Agent (scores + findings + summary)
     → Zod parse
     → finalizeReviewOutput (§3 → passFail → verdict)
     → JSON stdout
     → GHA comment (formatReviewCommentMarkdown) + fail on request_changes
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Schema + deterministic gate | Scores schema, finalize, unit tests | Threshold off-by-one vs requirements §3 |
| 2. Prompts + requirements commit | Rubric in instructions; SoT in git | Prompt/schema key mismatch |
| 3. CI comment + hardening + docs | Readable PR comment; typecheck before agent; docs | Workflow comment script break / upsert marker |

**Prerequisites:** `CURSOR_API_KEY` secret already used by current workflow; work on branch with existing `code-review.yml`.
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- Cloud agent nondeterminism remains for *scores*; only pass/fail *math* is deterministic.
- Condensed instructions can drift from `requirements.md` — mitigate with explicit “align §2–§3” note + Phase 1 manual spot-check.
- Fork PRs stay skipped (documented, not changed).

## Success Criteria (Summary)

- Finalize tests prove §3 boundaries and verdict mapping.
- PR comment shows scores + Werdykt + summary above JSON.
- Check fails on mapped `request_changes`; AGENTS/README describe the real workflow.
