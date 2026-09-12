# code-reviewer

Nested Node/TypeScript package: a reusable Cursor SDK code reviewer (local `Agent.prompt` + Zod-validated JSON) plus a thin CLI over `git diff HEAD`.

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

Do not commit `.env` / `.env.local` — they are gitignored. `.env.example` is the trackable template.

For GitHub Actions, store the same value as a repository secret named `CURSOR_API_KEY` and pass it into the job env (e.g. `CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}`).

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm start           # tsx src/index.ts — reviews uncommitted git diff HEAD
```

Run from this package directory (own `node_modules`; not an npm workspace). Prefer invoking the CLI from the repo root so `git diff HEAD` sees the full working tree (git still works from this subdirectory).

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

The CLI resolves env and passes `apiKey` / `model` into `createCodeReviewer`. Override the model with `CURSOR_MODEL` or `createCodeReviewer({ apiKey, model })`.

<!-- reviewer-smoke: noop marker for PR validation 2026-09-12T14:59:36.9448606+02:00 -->

