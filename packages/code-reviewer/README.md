# code-reviewer

Nested Node/TypeScript package: a reusable AI SDK `ToolLoopAgent` code reviewer (OpenRouter + Zod structured output) plus a thin CLI over `git diff HEAD`.

## Setup

```bash
cd packages/code-reviewer
npm install
cp .env.example .env
# edit .env and set OPENROUTER_API_KEY
```

## Environment

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `OPENROUTER_API_KEY` | yes | OpenRouter API key |
| `OPENROUTER_MODEL` | no | OpenRouter chat model id. Default: `deepseek/deepseek-v4.1-flash` |

Do not commit `.env` / `.env.local` — they are gitignored. `.env.example` is the trackable template.

## Scripts

```bash
npm run typecheck   # tsc --noEmit
npm start           # tsx src/index.ts — reviews uncommitted git diff HEAD
```

Run from this package directory (own `node_modules`; not an npm workspace). Prefer invoking the CLI from the repo root so `git diff HEAD` sees the full working tree (git still works from this subdirectory).

## Library use

Import the factory, schema, and prompts from the package root (not the CLI entry):

```ts
import {
  createCodeReviewer,
  reviewOutputSchema,
  buildReviewPrompt,
  DEFAULT_OPENROUTER_MODEL,
} from 'code-reviewer';
```

The CLI resolves env and passes `apiKey` / `model` into `createCodeReviewer`. Override the model with `OPENROUTER_MODEL` or `createCodeReviewer({ apiKey, model })`.
