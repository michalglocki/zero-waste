# code-reviewer

Nested Node/TypeScript package: a reusable Cursor SDK code reviewer (local `Agent.prompt` + Zod-validated JSON) plus a thin CLI over git diffs.

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

CLI flag equivalent: `--base origin/main` (overrides `REVIEW_BASE`).

Do not commit `.env` / `.env.local` — they are gitignored. `.env.example` is the trackable template.

For GitHub Actions, store the key as repository secret `CURSOR_API_KEY`. Workflow: `.github/workflows/code-review.yml`.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm start           # tsx src/index.ts
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

## GitHub Actions

On `pull_request` (opened / synchronize / reopened), the workflow:

1. Checks out with full history (`fetch-depth: 0`)
2. Installs this package (`npm ci`)
3. Runs with `REVIEW_BASE=origin/<base_ref>` and `REVIEW_FAIL_ON=request_changes`
4. Posts (or updates) a PR comment with the JSON report
5. Fails the check when the reviewer errors or returns `request_changes`

Requires secret `CURSOR_API_KEY`. Same-repo PRs only for secret access (fork PRs do not receive secrets by default).

## Library use

```ts
import {
  createCodeReviewer,
  reviewOutputSchema,
  buildReviewPrompt,
  DEFAULT_CURSOR_MODEL,
} from 'code-reviewer';

const agent = createCodeReviewer({ apiKey, model: DEFAULT_CURSOR_MODEL });
const { output } = await agent.generate({ prompt: buildReviewPrompt(diff) });
```

The CLI resolves env and passes `apiKey` / `model` into `createCodeReviewer`.
