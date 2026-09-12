# ToolLoopAgent Code Reviewer — Plan Brief

> Full plan: `context/changes/tool-loop-agent/plan.md`

## What & Why

Add a nested `packages/code-reviewer` package that wraps a Vercel AI SDK `ToolLoopAgent` (OpenRouter + Zod structured output) as a reusable code reviewer, with a thin CLI over `git diff HEAD` — foundation for later promptfoo evals without building the harness now.

## Starting Point

Empty `packages/code-reviewer/` directory; no workspaces; Expo root would otherwise typecheck `packages/**`. Isolation precedent is nested `workers/api`. AI SDK skill installed at `.agents/skills/ai-sdk`.

## Desired End State

`createCodeReviewer({ apiKey, model? })` exports a configured agent; schemas and prompts are separate modules; `npm start` reviews uncommitted diff and prints JSON, failing fast on missing key or empty diff. Root Expo typecheck/tests ignore the package.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| -------- | ------ | ---------------- |
| Deliverable | Library + thin CLI | Satisfies lesson entrypoint and reusable export |
| Isolation | Nested npm (like workers/api) | Avoids introducing workspaces into Expo root |
| Review input | `git diff HEAD` | Closest MVP to PR-style review |
| Output | Zod `Output.object` | Eval-friendly structured findings |
| Tools | None | Keeps scope to agent + structured output |
| Public API | Factory + schema + prompts | Future promptfoo can inject its own model |
| Provider config | `OPENROUTER_API_KEY` + optional `OPENROUTER_MODEL` | Env-driven without config files |
| Errors | Fail fast, non-zero exit | Safe for scripts/CI later |

## Scope

**In scope:** Package scaffold; root exclude/ignore (tsconfig, Jest, ESLint); schemas; prompts; `ToolLoopAgent` factory; CLI; env docs.

**Out of scope:** Promptfoo/evals; agent tools; workspaces; HTTP/UI; SARIF/GitHub comments; diff-vs-main mode; Expo product AI features.

## Architecture / Approach

```
CLI (src/index.ts)
  → env + git diff HEAD
  → createCodeReviewer({ apiKey, model })
       → ToolLoopAgent (OpenRouter chat, no tools, Output.object)
  → JSON stdout | non-zero stderr

Library barrel → createCodeReviewer + schemas + prompts  (future promptfoo)
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| ----- | ---------------- | -------- |
| 1. Scaffold & isolation | Nested package + root excludes | Expo typecheck still picking up packages |
| 2. Agent modules | Schema, prompts, factory | Stale AI SDK APIs if not checked against installed docs |
| 3. CLI fail-fast | Diff → generate → JSON | Empty/huge diffs or bad model ids |

**Prerequisites:** OpenRouter API key for manual smoke; Node + npm.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- Default OpenRouter model id must be chosen from live catalog at implement time (ids churn).
- Huge diffs may hit provider limits; no chunking in this change.
- `git diff HEAD` requires running CLI from a git working tree.

## Success Criteria (Summary)

- Nested package typechecks and runs via `tsx`.
- Structured JSON review for a real local diff with a valid key.
- Missing key / empty diff → clear non-zero failure; library exports ready for later evals.
