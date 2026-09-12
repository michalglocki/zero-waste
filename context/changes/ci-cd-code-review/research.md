---
date: 2026-09-12T15:40:00+02:00
researcher: Auto
git_commit: d479964d4a15042fa8848143978a9744a86ede7b
branch: feat/code-reviewer-pr-ci
repository: michalglocki/zero-waste
topic: "code-reviewer CI/CD vs packages/code-reviewer/requirements.md"
tags: [research, codebase, code-reviewer, github-actions, cursor-sdk, ci-cd]
status: complete
last_updated: 2026-09-12
last_updated_by: Auto
---

# Research: code-reviewer CI/CD vs requirements.md

**Date**: 2026-09-12T15:40:00+02:00  
**Researcher**: Auto  
**Git Commit**: [d479964d4a15042fa8848143978a9744a86ede7b](https://github.com/michalglocki/zero-waste/commit/d479964d4a15042fa8848143978a9744a86ede7b)  
**Branch**: feat/code-reviewer-pr-ci  
**Repository**: [michalglocki/zero-waste](https://github.com/michalglocki/zero-waste)

## Research Question

Detailed research of `packages/code-reviewer` with **CI/CD focus**, against acceptance rubrics in `packages/code-reviewer/requirements.md` (option A: that file is the source of truth; research lives under `context/changes/ci-cd-code-review/`).

## Summary

The CI path already works end-to-end on same-repo PRs: Actions checks out full history, runs the nested package with Cursor **cloud** runtime, posts/updates a bot PR comment with JSON, and fails the check on CLI errors or `verdict === request_changes`. What is **missing for requirements.md** is the product contract itself: five 1–10 scores, binding `pass`/`fail` with numeric thresholds, zero-waste rubrics in the agent instructions, and a human-facing Markdown summary (scores table + 2–3 sentences) instead of raw JSON-only comments. Fail gating today is **string-match on GitHub-style verdict**, not score math — so CI cannot enforce “security ≤ 5 → fail” until schema + prompts + workflow gate change together.

## Detailed Findings

### 1. End-to-end CI data flow (as implemented)

```
pull_request (opened|synchronize|reopened)
  → job if: same-repo only
  → checkout fetch-depth: 0
  → npm ci in packages/code-reviewer
  → tsx src/index.ts
       REVIEW_BASE=origin/<base_ref>
       CURSOR_RUNTIME=cloud (+ repo URL, head.sha, PR URL)
       REVIEW_FAIL_ON=request_changes
       → git diff origin/<base>...HEAD on runner
       → Agent.prompt(instructions + diff) [cloud]
       → Zod parse → stdout JSON
  → soft-capture exit_code; loose JSON shape check
  → upsert PR issue comment (## Code reviewer report)
  → fail job if exit_code != 0
```

Sole workflow: [`.github/workflows/code-review.yml`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/.github/workflows/code-review.yml). No lint/typecheck/test/deploy workflows exist yet (`tech-stack.md` still plans auto-deploy-on-merge).

### 2. Package architecture (CLI + agent)

| Piece | Role |
|-------|------|
| [`src/index.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/index.ts) | CLI: env, `--base`/`REVIEW_BASE`, git diff, agent, JSON stdout, exit 0/1/2 |
| [`src/agent/create-code-reviewer.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/agent/create-code-reviewer.ts) | `Agent.prompt` local vs cloud; does **not** read env |
| [`src/prompts/instructions.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/prompts/instructions.ts) | Generic SWE review; JSON schema embedded as prose |
| [`src/prompts/build-review-prompt.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/prompts/build-review-prompt.ts) | Wraps diff; labels PR vs uncommitted scope |
| [`src/schemas/review-output.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/schemas/review-output.ts) | Zod: `summary`, `findings[]`, `verdict` |
| [`src/agent/parse-review-output.ts`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/agent/parse-review-output.ts) | Extract JSON from agent text → Zod |

**Diff source:** with base → `git diff <base>...HEAD`; without → `git diff HEAD` ([`index.ts:47-54`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/index.ts#L47-L54)). Empty diff → exit `1`.

**Exit codes:** `1` = errors (missing key, git, empty diff, agent/parse); `2` = verdict listed in `REVIEW_FAIL_ON` ([`index.ts:63-67`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/index.ts#L63-L67), [`125-129`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/index.ts#L125-L129)). JSON is printed **before** exit 2 so CI can still comment.

**Cloud vs local:** default local; CI forces cloud because local agents SIGSEGV on GHA ([`create-code-reviewer.ts:16-18`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/agent/create-code-reviewer.ts#L16-L18)). Default model `composer-2.5`. No retry loop despite `CursorAgentError.isRetryable`.

**Important split:** the **review text is the runner’s three-dot diff** embedded in the prompt; cloud also attaches the repo at `pull_request.head.sha`. Checkout on `pull_request` is typically the merge ref — HEAD used for `git diff` may not equal cloud `startingRef`.

### 3. Current output contract vs requirements.md

**Live schema** ([`review-output.ts:9-13`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/packages/code-reviewer/src/schemas/review-output.ts#L9-L13)):

```ts
{
  summary: string;
  findings: { severity: 'info'|'warning'|'error'; path: string|null; message: string }[];
  verdict: 'approve' | 'comment' | 'request_changes';
}
```

**Required by** `packages/code-reviewer/requirements.md` (untracked at research time):

| Requirement | Today | Gap |
|-------------|-------|-----|
| Scores 1–10 × 5 criteria (poprawność, idiomatyczność, złożoność, testy vs ryzyko, bezpieczeństwo) | Absent | Need schema fields + prompt rubrics |
| Binding `pass` / `fail` + thresholds (any ≤4 fail; security ≤5; avg &lt;6; error-class findings) | Absent | Need compute or model-produced pass/fail + CI gate |
| Map fail→`request_changes`, pass→`approve`, pass+notes→`comment` | Documented only in requirements | Keep existing verdict enum for GHA `REVIEW_FAIL_ON` **or** change fail-on to `fail` |
| Summary 2–3 actionable Markdown sentences | Free-form `summary` string | Soft constraint in instructions; optionally render Markdown in PR comment |
| Scores table in PR-facing Markdown | Comment dumps raw JSON in `<details>` | Workflow comment template must change |
| Zero-waste rubrics (Expo 56, RLS, jest-expo, stock quantity, no service role in `EXPO_PUBLIC_*`) | Generic instructions only | Embed or load requirements into `instructions.ts` |

Requirements §4 already anticipates dual shape: keep GitHub-style `verdict` for pipeline compatibility while scoring drives the binding decision.

### 4. GitHub Actions behavior (CI/CD deep dive)

**Triggers / isolation** ([`code-review.yml:3-21`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/.github/workflows/code-review.yml#L3-L21)):

- `pull_request`: opened / synchronize / reopened only.
- Fork PRs skipped (`head.repo.full_name == github.repository`) — no secret, no comment, check **skipped**.
- Concurrency per PR number with `cancel-in-progress: true`.
- Permissions: `contents: read`, `pull-requests: write`. Timeout 45m.

**Run step** ([`39-79`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/.github/workflows/code-review.yml#L39-L79)):

- Invokes `./node_modules/.bin/tsx src/index.ts` (not `npm start` — avoids npm banners polluting JSON).
- Captures stdout → `review-output.json`, stderr → `review-stderr.txt`.
- Records `exit_code` from tsx; then loose Node shape check (`summary`, `findings` array, `verdict`).
- Re-checks `REVIEW_FAIL_ON` against JSON and may overwrite `exit_code=2`, then **always `exit 0` from the run step** so the comment step can run.
- Final “Fail on reviewer error or request_changes” step ([`129-144`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/.github/workflows/code-review.yml#L129-L144)) fails the job from **recorded** `exit_code` only.

**PR comment** ([`81-128`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/.github/workflows/code-review.yml#L81-L128)):

- Issue comment (not `gh pr review` / official PR Review API).
- Upserts last Bot comment containing `## Code reviewer report`.
- Body = heading + collapsible raw JSON (+ stderr). **No scores table, no pass/fail line.**

**Secret:** `CURSOR_API_KEY` repository secret only. Comment token = `github.token`.

### 5. Isolation from app CI / tests

Root Jest ignores `/packages/` ([`package.json` testPathIgnorePatterns](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/package.json)); `tsconfig` / ESLint also exclude `packages/**`. The code-reviewer package has **no `test` script** — CI never typechecks or unit-tests the parser/schema/CLI. Intentional isolation (same pattern as `workers/api`), but schema evolution for scores will have no automated guard unless added inside the package or a tiny workflow step (`npm run typecheck`).

### 6. Docs drift

| Doc | Claim | Reality on this commit |
|-----|--------|-------------------------|
| [`AGENTS.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/AGENTS.md) L38 | “No `.github/workflows` yet” | **Stale** — `code-review.yml` exists |
| [`tech-stack.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/context/foundation/tech-stack.md) | GHA + auto-deploy-on-merge | Deploy CI still absent; review workflow present |
| Package README | Documents cloud GHA flow accurately | Matches workflow |

### 7. CI risks relevant to implementing requirements

1. **Fail gate is verdict-string only** — score thresholds in requirements cannot block merge until Zod + instructions + `REVIEW_FAIL_ON` (or a new `pass` field check) change together.
2. **Nondeterministic cloud agent** — same diff can flip `approve` ↔ `request_changes`; score-based thresholds need clear rubric text to reduce drift, not eliminate it.
3. **Fork PRs skipped** — external contributors get no automated review.
4. **Malformed JSON edge** — final fail trusts early `exit_code`; run step can `exit 1` on malformed-but-tsx-0 without updating `exit_code` (rare if CLI Zod-gates stdout).
5. **Merge HEAD vs `head.sha`** — runner diff vs cloud checkout can diverge.
6. **Comment dumps full agent JSON/stderr** — risk of accidental secret echo in model text; prefer rendering scores + summary, keep raw JSON collapsed or truncated.
7. **Empty three-dot diff** — CLI exit 1 fails the check (can surprise no-op syncs).
8. **No retries** despite retryable Cursor errors; 45m timeout + cancel-in-progress.
9. **`requirements.md` not in git** at research time — CI agent cannot “read the file from the repo” on PR head unless it is committed (or rubrics are inlined into `instructions.ts`).

## Code References

- `.github/workflows/code-review.yml:1-144` — sole PR review workflow (cloud, comment, fail-on)
- `packages/code-reviewer/src/index.ts:27-68` — base resolution, git diff, `REVIEW_FAIL_ON`
- `packages/code-reviewer/src/index.ts:97-129` — cloud env wiring, JSON print, exit 2
- `packages/code-reviewer/src/agent/create-code-reviewer.ts:37-95` — Agent.prompt local/cloud + parse
- `packages/code-reviewer/src/schemas/review-output.ts:2-13` — live Zod contract
- `packages/code-reviewer/src/prompts/instructions.ts:1-20` — generic instructions (no scores)
- `packages/code-reviewer/requirements.md` — target rubrics / pass-fail / canonical prompt (local, untracked)
- `package.json` (root) — Jest ignore `/packages/`

## Architecture Insights

1. **Two-layer verdict design is intentional for CI:** GitHub-friendly `approve|comment|request_changes` already drives `REVIEW_FAIL_ON` and the fail step. Requirements want **scores → pass/fail → map onto that enum**. Smallest CI-compatible change: extend schema with `scores` + `pass_fail` (or `binding_verdict: pass|fail`), keep `verdict` as derived/mapped field, leave workflow `REVIEW_FAIL_ON=request_changes` unchanged.
2. **Prompt is the product gate, Zod is the machine gate.** Without embedding rubrics from requirements into `instructions.ts` (or injecting file contents at runtime), cloud agents will keep producing generic reviews even if the schema adds score fields (models invent numbers).
3. **Comment UX is the human gate.** Authors act on Markdown summary; today they open a JSON dump. Requirements §4 table + 2–3 sentences should become the **primary** comment body; JSON secondary.
4. **Package isolation is consistent** with `workers/api`, but any CI-critical schema change should add at least package `typecheck` (and ideally parse/unit tests) in the workflow before relying on scores for merge blocking.
5. **Diff-first remains correct** for requirements (“Review ONLY the embedded git diff”) — do not expand the agent into full-repo exploration in CI; attach cloud repo only as auxiliary context.

## Historical Context (from prior changes)

- [`context/changes/tool-loop-agent/change.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/context/changes/tool-loop-agent/change.md) — Built `packages/code-reviewer`; redesign from AI SDK/OpenRouter → `@cursor/sdk` + Zod; auth via `CURSOR_API_KEY` (local + GHA secret). Status `impl_reviewed`.
- [`context/changes/tool-loop-agent/plan-brief.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/context/changes/tool-loop-agent/plan-brief.md) / [`plan.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/context/changes/tool-loop-agent/plan.md) — Original MVP: fail-fast JSON CLI; **explicitly OOS:** SARIF, GitHub PR comments, live-API CI. Branch `feat/code-reviewer-pr-ci` has since **implemented** the previously-OOS PR comment + cloud GHA path — this change folder owns aligning that path with scored requirements.
- [`context/changes/tool-loop-agent/reviews/impl-review.md`](https://github.com/michalglocki/zero-waste/blob/d479964d4a15042fa8848143978a9744a86ede7b/context/changes/tool-loop-agent/reviews/impl-review.md) — APPROVED; noted full diff still leaves the machine (now Cursor); redaction OOS.
- `context/foundation/tech-stack.md` / `infrastructure.md` — GHA as planned CI provider; deploy workflows still future.
- **`context/changes/ci-cd-code-review/`** — created by this research (was absent).

## Related Research

- No prior `research.md` under `tool-loop-agent`.
- Closest sibling research: `context/changes/testing-bootstrap-izolacja-gospodarstw/research.md` (product RLS/test risks that requirements rubrics reference) — useful when drafting prompt rubrics for “bezpieczeństwo” / “pokrycie testami względem ryzyka”, not for GHA wiring.

## Open Questions

1. **Schema shape:** Prefer nested `scores: { correctness, idiomaticity, complexity, test_coverage_vs_risk, security }` plus `pass_fail: 'pass'|'fail'`, or flat Polish/English keys matching the canonical prompt?
2. **Who computes pass/fail?** Model-only (prompt + Zod enum) vs deterministic post-parse function applying requirements §3 thresholds (recommended for CI integrity — model can lie about averages).
3. **Commit `requirements.md`?** Required if the agent should load the file from the cloud checkout; otherwise inline a condensed rubric into `instructions.ts`.
4. **Update AGENTS.md** in this change or a follow-up (docs currently deny workflows)?
5. **Add `npm run typecheck` (and optional unit tests for score→verdict mapping) to the workflow** before score-based merge blocking?
6. **Fork PR policy** — remain skipped, or document clearly in README that only same-repo PRs are reviewed?
7. **Should PR comment switch to official PR Reviews** (`REQUEST_CHANGES` / `APPROVE`) for GitHub merge-box UX, or keep issue-comment upsert?

## Implications for `/10x-plan`

Minimum vertical slice for requirements alignment (CI-focused):

1. Extend Zod schema + parse tests with scores + binding pass/fail; **deterministically** map thresholds → `verdict`.
2. Rewrite `instructions.ts` (and optionally inject `requirements.md`) with the five rubrics and canonical prompt.
3. Update workflow comment to render scores table + verdict + 2–3 sentence summary; keep JSON in `<details>`.
4. Keep `REVIEW_FAIL_ON=request_changes` (or fail on `pass_fail=fail` if that becomes the gate field).
5. Commit `requirements.md`; fix `AGENTS.md` CI sentence; consider package `typecheck` step in the workflow.
