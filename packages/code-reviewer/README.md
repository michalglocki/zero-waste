# code-reviewer

Nested Node/TypeScript package: a reusable Cursor SDK code reviewer (local `Agent.prompt` + Zod-validated JSON) plus a thin CLI over git diffs.

Human SoT for rubrics and thresholds: [`requirements.md`](./requirements.md). The agent emits five scores; **`finalizeReviewOutput` overwrites binding `passFail` and `verdict`** so CI does not trust model arithmetic.

## Setup

```bash
cd packages/code-reviewer
npm install
cp .env.example .env
# edit .env and set CURSOR_API_KEY
```

## Environment

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `CURSOR_API_KEY` | yes | Cursor user/service API key (`crsr_…`) |
| `CURSOR_MODEL` | no | Cursor model id. Default: `composer-2.5` |
| `REVIEW_BASE` | no | Git ref for branch/PR reviews. Runs `git diff <base>...HEAD` instead of uncommitted `git diff HEAD`. |
| `REVIEW_FAIL_ON` | no | Comma-separated verdicts that exit `2` (e.g. `request_changes`). |
| `CURSOR_RUNTIME` | no | `local` (default) or `cloud`. GitHub Actions uses `cloud` (local agents segfaulted on GHA runners). |
| `CURSOR_CLOUD_REPO_URL` | no | Optional repo URL when `CURSOR_RUNTIME=cloud`. |
| `CURSOR_CLOUD_STARTING_REF` | no | Optional starting ref / SHA for cloud repo checkout. |
| `CURSOR_CLOUD_PR_URL` | no | Optional PR URL attached to the cloud agent. |

CLI flag equivalent: `--base origin/main` (overrides `REVIEW_BASE`).

Do not commit `.env` / `.env.local` — they are gitignored. `.env.example` is the trackable template.

For GitHub Actions, store the key as repository secret `CURSOR_API_KEY`. Workflow: `.github/workflows/code-review.yml`.

## Output shape

Finalized stdout / library result (`reviewOutputSchema`):

| Field | Notes |
| ----- | ----- |
| `scores` | `{ correctness, idiomaticity, complexity, testCoverageVsRisk, security }` integers 1–10 |
| `summary` | 2–3 actionable Markdown sentences |
| `findings` | `{ severity, path, message }[]` — `error` only for §3-class issues |
| `passFail` | `pass` \| `fail` — **CLI-computed** from requirements §3 |
| `verdict` | `approve` \| `comment` \| `request_changes` — mapped from `passFail` (+ warnings / mid scores) |

Model-supplied `passFail` / `verdict` (if any) are ignored after parse.

## Scripts

```bash
npm run typecheck      # tsc --noEmit
npm test               # threshold + formatter unit tests
npm start              # tsx src/index.ts → finalized JSON on stdout
npm run format-comment -- path/to/review-output.json [baseRefLabel]
```

### Local uncommitted review

```bash
cd packages/code-reviewer
npm start
```

### Branch / PR-range review (committed commits only)

```bash
# from repo root so git refs resolve cleanly
REVIEW_BASE=origin/main npm --prefix packages/code-reviewer start
# or
npm --prefix packages/code-reviewer start -- --base origin/main
```

### Dry-run PR comment markdown

```bash
npm run format-comment -- ./review-output.json 'origin/main...HEAD'
```

## GitHub Actions

On `pull_request` (opened / synchronize / reopened), the workflow:

1. Checks out with full history (`fetch-depth: 0`)
2. Installs this package (`npm ci`)
3. Runs `npm run typecheck` and `npm test` before spending Cursor quota
4. Runs with Cursor **cloud** runtime, `REVIEW_BASE=origin/<base_ref>`, and `REVIEW_FAIL_ON=request_changes`
5. Posts (or updates) a PR comment with **scores table + Werdykt + summary** first, raw JSON in `<details>` (via `print-review-comment.ts`)
6. Fails the check when the reviewer errors or mapped `verdict` is `request_changes`

Requires secret `CURSOR_API_KEY`. **Same-repo PRs only** — fork PRs are skipped by the workflow `if:` (no secrets on forks).

## Library use

```ts
import {
  createCodeReviewer,
  formatReviewCommentMarkdown,
  reviewOutputSchema,
  buildReviewPrompt,
  DEFAULT_CURSOR_MODEL,
} from 'code-reviewer';

const agent = createCodeReviewer({ apiKey, model: DEFAULT_CURSOR_MODEL });
const { output } = await agent.generate({ prompt: buildReviewPrompt(diff) });
// output already finalized (scores + passFail + verdict)
const commentBody = formatReviewCommentMarkdown(output);
```

The CLI resolves env and passes `apiKey` / `model` into `createCodeReviewer`.
