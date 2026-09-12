# CI/CD scored code review — Implementation Plan

## Overview

Align the existing `packages/code-reviewer` CLI and `.github/workflows/code-review.yml` with `packages/code-reviewer/requirements.md`: five 1–10 scores, deterministic pass/fail thresholds, zero-waste rubrics in the agent prompt, and a human-readable PR comment (scores + summary first). Keep the GitHub-friendly `verdict` enum so `REVIEW_FAIL_ON=request_changes` continues to gate the check.

## Current State Analysis

- PR CI already runs cloud Cursor review, posts a bot issue comment with raw JSON, and fails on `request_changes` (see `context/changes/ci-cd-code-review/research.md`).
- Live Zod contract is only `{ summary, findings[], verdict: approve|comment|request_changes }` — no scores, no `pass`/`fail`.
- `instructions.ts` is a generic SWE review; it does not encode the five rubrics or §3 thresholds.
- `requirements.md` exists locally but was untracked at research time; must be committed as human SoT.
- Package has `typecheck` but no `test` script; workflow does not typecheck before the agent run.
- `AGENTS.md` still claims there are no `.github/workflows`.

### Key Discoveries:

- Two-layer verdict is the smallest CI-compatible design: scores → deterministic `passFail` → map to `verdict` → existing `REVIEW_FAIL_ON` ([research Architecture Insights](research.md)).
- JSON is printed before exit 2 so the comment step can always run when stdout is valid (`packages/code-reviewer/src/index.ts`).
- Workflow comment upsert keys on Bot + `## Code reviewer report` (`.github/workflows/code-review.yml`).
- Nested package isolation matches `workers/api`; root Jest already ignores `/packages/`.

## Desired End State

- Agent output includes five English-keyed scores (1–10). CLI **overwrites** binding `passFail` and `verdict` using requirements §3 (model cannot invent a passing average).
- PR comment shows scores table, **Werdykt:** pass|fail, 2–3 sentence summary, then collapsible raw JSON.
- `requirements.md` is committed; `instructions.ts` carries a condensed rubric (must stay aligned with §2–§3).
- Package unit tests cover threshold edge cases; workflow runs `npm run typecheck` (and ideally `npm test`) before the agent.
- `AGENTS.md` and package README document the code-review workflow and same-repo-only (fork skip) policy.

### Verification (end-to-end):

- `npm test` + `npm run typecheck` in `packages/code-reviewer` pass.
- Local CLI with a fixture/mock or recorded scores path proves threshold mapping (unit tests are the primary proof; live Cursor smoke optional).
- On a same-repo PR, the bot comment shows scores + pass/fail; check fails iff mapped `verdict` is `request_changes` or the reviewer errors.

## What We're NOT Doing

- Official GitHub PR Reviews API (`gh pr review` Approve/Request changes) — keep issue-comment upsert
- Retry loops for retryable Cursor errors
- Changing fork-PR skip policy (document only)
- App product code, Expo runner, deploy/lint/test app CI workflows
- Loading full `requirements.md` at runtime into the prompt (inline condensed rubric only)
- SARIF, promptfoo, or second app test runner
- Redacting diffs before send to Cursor (accepted debt from tool-loop-agent)

## Implementation Approach

1. Extend Zod with nested `scores` and optional model-supplied fields; add a pure `finalizeReviewOutput` (or equivalent) that applies §3 and sets `passFail` + `verdict`.
2. Wire CLI (and library generate path) to run finalize after parse so every consumer gets gated output.
3. Rewrite instructions + user prompt to request the five scores and findings; tell the model **not** to treat its own pass/fail as authoritative (CLI computes it).
4. Export `formatReviewCommentMarkdown` plus a small `print-review-comment.ts` CLI for the workflow (no `tsx -e`).
5. Harden workflow: typecheck (+ test) before agent; richer comment body; keep `REVIEW_FAIL_ON=request_changes`.
6. Commit `requirements.md`; fix AGENTS/README.

**Locked decisions (planning session):** deterministic post-parse gate; nested English score keys; inline condensed rubric + commit full requirements; issue-comment UX with scores first; package tests + workflow typecheck + docs.

## Critical Implementation Details

**Threshold inclusivity (must match requirements §3 exactly):** any score ≤4 → fail; security ≤5 → fail; arithmetic mean of five scores &lt; 6 → fail; any `findings[].severity === 'error'` → fail (**intentional mechanical reading of §3** — plan-review F2: CI uses the severity enum, not content heuristics; prompts must reserve `error` for §3-class issues only: izolacja/sekrety/UI-only authz/service role/quantity regression). Pass requires all scores ≥5, security ≥6, mean ≥6, and no error findings. Boundary fixtures in unit tests must include: score exactly 4 vs 5; security exactly 5 vs 6; mean exactly 5.999… vs 6.0 (use integers that average to 5.8 and 6.0).

**Verdict mapping after passFail:** `fail` → `request_changes`; `pass` with any `warning` finding **or** any score in 6–7 → `comment`; clean `pass` → `approve`. **Intentional strictness (plan-review F3):** any criterion in 6–7 maps to `comment` even without notes/findings (stricter than requirements “Pass z zastrzeżeniami”, which expects concrete reservations). Overwrite any model-provided `passFail`/`verdict`.

**Ordering in CLI:** parse → finalize → `console.log(JSON)` → `REVIEW_FAIL_ON` check (unchanged). Comment step must keep working when exit code would be 2.

## Phase 1: Schema + deterministic gate

### Overview

Make scores a first-class validated field and enforce requirements §3 in code with unit tests.

### Changes Required:

#### 1. Zod schema extension

**File**: `packages/code-reviewer/src/schemas/review-output.ts`

**Intent**: Require nested scores and expose binding `passFail` on the finalized output type.

**Contract**:
- `scores: { correctness, idiomaticity, complexity, testCoverageVsRisk, security }` each integer 1–10 (Zod int min/max).
- **Locked dual-schema pattern (plan-review F1):**
  - `reviewAgentOutputSchema` — what parse accepts from the model: required `scores` + `summary` + `findings`; `verdict` / `passFail` optional (ignored if present).
  - `reviewOutputSchema` — post-finalize stdout/library type: all of the above plus required `passFail` and `verdict`.
- Export both schemas and clear types from `lib.ts`.

#### 2. Deterministic finalize + verdict map

**File**: `packages/code-reviewer/src/agent/finalize-review-output.ts` (new; name may vary)

**Intent**: Pure function implementing requirements §3 thresholds and the pass→approve/comment mapping so CI does not trust the model’s arithmetic.

**Contract**: `finalizeReviewOutput(agentOutput) → ReviewOutput` with overwritten `passFail` and `verdict`. No I/O. Document threshold rules in a one-line comment pointing at `requirements.md` §3.

#### 3. Wire parse / generate / CLI

**Files**: `packages/code-reviewer/src/agent/parse-review-output.ts`, `create-code-reviewer.ts`, `src/index.ts`, `src/lib.ts`

**Intent**: Every successful review path returns finalized output; library callers get the same gate as CLI/CI.

**Contract**: `parseReviewOutput` validates against `reviewAgentOutputSchema`. `createCodeReviewer.generate` calls `finalizeReviewOutput` after parse and returns `reviewOutputSchema`-shaped output so library + CLI share the gate (do **not** finalize only in `index.ts`). Re-export finalize + both schemas + score types from `lib.ts`.

#### 4. Unit tests + npm test script

**Files**: `packages/code-reviewer/package.json`, new tests under `packages/code-reviewer/` (e.g. `src/agent/finalize-review-output.test.ts` or `tests/`)

**Intent**: Lock threshold boundaries and verdict mapping without calling Cursor.

**Contract**: Add `npm test` using a lightweight runner that stays inside the package (Node built-in test runner via `tsx`, or Vitest like `workers/api` — prefer minimal new deps). Cases must include the boundary fixtures listed under Critical Implementation Details. Do not rely on root Jest (ignores `/packages/`).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` in `packages/code-reviewer` passes
- `npm test` in `packages/code-reviewer` passes, including ≤4 / security ≤5 / mean &lt;6 / error finding → fail, and clean high scores → approve
- Finalized stdout shape includes `scores`, `passFail`, and mapped `verdict` (asserted in tests)

#### Manual Verification:

- Spot-check that `requirements.md` §3 wording still matches the finalize implementation (no silent threshold drift)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Prompts + requirements commit

### Overview

Teach the agent to score the five criteria with zero-waste rubrics, and commit the human SoT document.

### Changes Required:

#### 1. Condensed rubric in instructions

**File**: `packages/code-reviewer/src/prompts/instructions.ts`

**Intent**: Replace generic SWE instructions with a condensed form of requirements §§1–4: five criteria (PL labels in prose, EN JSON keys), diff-only, signal&gt;noise, security/test-risk notes, and explicit “CLI computes pass/fail — emit scores + findings + summary only (optional verdict ignored).”

**Contract**: Instruct JSON shape matching `reviewAgentOutputSchema` (scores + summary + findings). Summary = 2–3 actionable Markdown sentences. Keep prompt size moderate (condensed, not full file paste). Add a one-line “must stay aligned with packages/code-reviewer/requirements.md §2–§3”. Explicitly: use `severity: "error"` **only** for §3-class issues (not style nits); CLI treats any `error` as fail.

#### 2. User prompt builder

**File**: `packages/code-reviewer/src/prompts/build-review-prompt.ts`

**Intent**: Align the user message with the canonical prompt in requirements §4 (five criteria + pass/fail language clarified as scores-first since CLI gates).

**Contract**: Still embed only the provided diff; mention English score keys expected in JSON.

#### 3. Commit requirements.md

**File**: `packages/code-reviewer/requirements.md`

**Intent**: Make the SoT part of the repo so authors and future planners share one rubric document.

**Contract**: Commit the existing file (no rewrite required unless a small cross-link to “CLI enforces §3” helps). Do not move it under `context/changes/` (planning decision A).

### Success Criteria:

#### Automated Verification:

- `npm run typecheck` still passes after prompt string changes
- Existing finalize tests still pass (prompts must not break schema contracts)

#### Manual Verification:

- Read `instructions.ts` once: confirms EN keys, five criteria, and “CLI owns pass/fail”
- Confirm `requirements.md` is tracked by git (`git status` no longer shows it as untracked)

---

## Phase 3: CI comment + workflow hardening + docs

### Overview

Show authors an actionable report, fail the check on mapped `request_changes`, and stop lying in AGENTS about missing workflows.

### Changes Required:

#### 1. Markdown formatter for PR comments

**File**: `packages/code-reviewer/src/format-review-comment.ts` (new; export from `lib.ts`)

**Intent**: Single function that turns finalized `ReviewOutput` into the PR comment body (scores table with PL labels, **Werdykt:** pass|fail, summary, then `<details>` JSON).

**Contract**: Heading remains compatible with upsert marker `## Code reviewer report` (keep that H2 so existing dedup works). Unit-test the formatter with a fixture output (stable snapshot or substring asserts).

#### 1b. CLI entry to print comment markdown (plan-review F4)

**File**: `packages/code-reviewer/src/print-review-comment.ts` (new) and optional `package.json` script e.g. `format-comment`

**Intent**: Avoid fragile `tsx -e` ESM imports in GitHub Actions; give the workflow a stable argv entrypoint.

**Contract**: Read a JSON file path (e.g. `review-output.json`), parse as finalized `ReviewOutput`, write markdown to stdout via `formatReviewCommentMarkdown`. Workflow comment step invokes e.g. `./node_modules/.bin/tsx src/print-review-comment.ts "$GITHUB_WORKSPACE/review-output.json"`.

#### 2. Workflow: typecheck/test before agent; richer comment

**File**: `.github/workflows/code-review.yml`

**Intent**: Catch schema/compile breaks before spending Cursor quota; render human Markdown via the package formatter instead of raw JSON-only body.

**Contract**:
- After `npm ci`, run `npm run typecheck` and `npm test` in `packages/code-reviewer`.
- Keep cloud env, `REVIEW_BASE`, `REVIEW_FAIL_ON=request_changes`, soft-capture + final fail step pattern.
- Comment step: produce body via `tsx src/print-review-comment.ts` (not inline `tsx -e`); preserve stderr `<details>` if useful.
- Loose JSON shape check must require `scores` and `passFail` (or rely on CLI Zod — prefer tightening the node one-liner to match new required fields).

#### 3. Docs

**Files**: `AGENTS.md`, `packages/code-reviewer/README.md`

**Intent**: Document that code-review CI exists; same-repo only; scores + deterministic gate.

**Contract**: Replace the “No `.github/workflows` yet” sentence with an accurate pointer to `.github/workflows/code-review.yml` and note that app lint/test deploy CI is still future. README: document new JSON fields, finalize behavior, fork skip, and that comments show scores first.

### Success Criteria:

#### Automated Verification:

- `npm test` and `npm run typecheck` pass locally for the package
- Workflow YAML is valid enough to parse (manual `actionlint` optional; at least review steps order: install → typecheck → test → review → comment → fail)
- Formatter unit test passes

#### Manual Verification:

- Open or push a same-repo PR (or dry-run comment markdown locally from a fixture JSON) and confirm scores table + Werdykt + summary appear above JSON details
- Confirm check still fails on `request_changes` and passes on `approve`/`comment`
- Skim AGENTS.md + README for accuracy on workflows / fork policy

---

## Testing Strategy

### Unit Tests:

- Finalize: boundary scores (4 vs 5; security 5 vs 6; mean &lt;6 vs ≥6); error finding forces fail; warning + pass → `comment`; clean pass → `approve`; fail → `request_changes`; model-supplied wrong `verdict` overwritten
- Formatter: contains score rows, pass/fail line, summary, and `## Code reviewer report`

### Integration Tests:

- None required against live Cursor or GitHub for this change (cost × signal). Optional manual smoke on the feature branch PR.

### Manual Testing Steps:

1. Run package `npm test` / `typecheck`
2. Generate comment markdown from a fixture JSON via the formatter; eyeball PL labels
3. After merge to the PR branch, confirm Actions comment + check behavior once

## Performance Considerations

Prompt will grow (condensed rubric) but must stay well under full `requirements.md` paste. No retry storms. Typecheck/test add seconds before the agent — acceptable vs failed paid runs.

## Migration Notes

- Existing consumers of `reviewOutputSchema` must accept new required `scores` / `passFail`. Update any docs/examples in README.
- Older bot comments without scores remain until the next synchronize upsert replaces them.
- No DB or app migration.

## References

- Related research: `context/changes/ci-cd-code-review/research.md`
- Rubrics SoT: `packages/code-reviewer/requirements.md`
- Prior package origin: `context/changes/tool-loop-agent/`
- Workflow: `.github/workflows/code-review.yml`
- Schema/CLI: `packages/code-reviewer/src/schemas/review-output.ts`, `src/index.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Schema + deterministic gate

#### Automated

- [x] 1.1 `npm run typecheck` in `packages/code-reviewer` passes — a5d477a
- [x] 1.2 `npm test` in `packages/code-reviewer` passes, including ≤4 / security ≤5 / mean &lt;6 / error finding → fail, and clean high scores → approve — a5d477a
- [x] 1.3 Finalized stdout shape includes `scores`, `passFail`, and mapped `verdict` (asserted in tests) — a5d477a

#### Manual

- [x] 1.4 Spot-check that `requirements.md` §3 wording still matches the finalize implementation (no silent threshold drift) — a5d477a

### Phase 2: Prompts + requirements commit

#### Automated

- [x] 2.1 `npm run typecheck` still passes after prompt string changes — 7b25af9
- [x] 2.2 Existing finalize tests still pass (prompts must not break schema contracts) — 7b25af9

#### Manual

- [x] 2.3 Read `instructions.ts` once: confirms EN keys, five criteria, and “CLI owns pass/fail” — 7b25af9
- [x] 2.4 Confirm `requirements.md` is tracked by git (`git status` no longer shows it as untracked) — 7b25af9

### Phase 3: CI comment + workflow hardening + docs

#### Automated

- [x] 3.1 `npm test` and `npm run typecheck` pass locally for the package
- [x] 3.2 Workflow YAML step order: install → typecheck → test → review → comment → fail
- [x] 3.3 Formatter unit test passes

#### Manual

- [ ] 3.4 Open or push a same-repo PR (or dry-run comment markdown locally from a fixture JSON) and confirm scores table + Werdykt + summary appear above JSON details
- [ ] 3.5 Confirm check still fails on `request_changes` and passes on `approve`/`comment`
- [ ] 3.6 Skim AGENTS.md + README for accuracy on workflows / fork policy
