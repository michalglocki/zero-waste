# ToolLoopAgent Code Reviewer Implementation Plan

## Overview

Create a nested Node/TypeScript package at `packages/code-reviewer` that exposes a reusable code-review `ToolLoopAgent` (Vercel AI SDK + OpenRouter + Zod structured output) plus a thin CLI entrypoint that reviews the current git working-tree diff. Schemas and prompts live in separate modules; the public API is a factory suitable for a future promptfoo harness (eval setup is explicitly out of scope).

## Current State Analysis

- `packages/code-reviewer/` exists but is empty (no `package.json`, source, or deps).
- Repo has no npm workspaces; `workers/api` is the established nested-package pattern (own `package.json` / `tsconfig` / lockfile).
- Root Expo `tsconfig.json` includes `**/*.ts` and only excludes `workers` — without excluding `packages`, root `typecheck` would typecheck the new package under Expo settings.
- Root Jest ignores `/workers/` only; same treatment needed for `/packages/`.
- No first-party `ai` / OpenRouter / Zod usage in app code. Agent skill `.agents/skills/ai-sdk/SKILL.md` requires verifying APIs against installed `node_modules/ai` docs, not training memory.
- Latest versions checked at plan time: `ai@7.x`, `@openrouter/ai-sdk-provider@3.x`, `zod@4.x`, `tsx@4.x`.

### Key Discoveries:

- Isolation precedent: `workers/api/package.json` + `workers/api/tsconfig.json` (standalone nested npm).
- Root coupling risk: `tsconfig.json` `include` / `exclude` and root `package.json` Jest `testPathIgnorePatterns`.
- AI SDK agent surface: `ToolLoopAgent` + `Output.object({ schema })` from `ai`; OpenRouter via `createOpenRouter` from `@openrouter/ai-sdk-provider`.
- Planning decisions locked with the user: library + thin CLI; nested npm; input = git diff; structured Zod output; **no tools**; factory + schema + prompts export; env-driven model; fail-fast exit codes.

## Desired End State

- `packages/code-reviewer` is an installable nested package with its own deps and `tsx`-runnable CLI.
- Callers (and future evals) can `import { createCodeReviewer, reviewOutputSchema, … }` and run `agent.generate({ prompt })` without the CLI.
- CLI reads `OPENROUTER_API_KEY` (+ optional `OPENROUTER_MODEL`), captures `git diff HEAD`, fails non-zero on missing key / empty diff / generate failure, and prints structured review JSON on success.
- Root Expo `typecheck` / `test` remain unaffected by the new package.

### Verification (end-to-end):

- From `packages/code-reviewer`: `npm run typecheck` passes; `npm start` with a non-empty local diff and valid key prints JSON matching the Zod schema.
- Missing key or empty diff exits non-zero with a clear stderr message.
- Root `npm run typecheck` still passes and does not typecheck package sources under Expo config.

## What We're NOT Doing

- Promptfoo / any eval harness, datasets, or CI eval jobs
- Agent tools (`readFile`, shell, search, etc.)
- npm/pnpm workspaces or Turborepo
- HTTP server / streaming UI route
- GitHub PR review comments / SARIF
- Reviewing committed history ranges beyond uncommitted `git diff HEAD` (no `--base main` mode in this change)
- Changing Expo app product code or `has_ai` foundation flags beyond minimal root exclude/ignore needed for isolation

## Implementation Approach

Scaffold `packages/code-reviewer` as a nested npm project (mirror `workers/api` isolation). Install current `ai`, `@openrouter/ai-sdk-provider`, `zod`, plus `tsx`/`typescript`/`@types/node`. Structure source as:

- `src/schemas/` — Zod review output schema (+ inferred type)
- `src/prompts/` — system/instructions + user-prompt builder for a diff
- `src/agent/` (or equivalent) — `createCodeReviewer({ apiKey, model? })` returning a configured `ToolLoopAgent` with **empty/no tools**, `Output.object`, OpenRouter chat model
- `src/index.ts` — CLI: load env, validate key, run `git diff HEAD`, invoke agent, print `result.output` as JSON, map failures to exit codes
- Package `exports` / main entry also re-export factory, schema, and prompts for library use

Pin root `tsconfig`, Jest, and ESLint to ignore `packages` the same way nested work is kept out of the Expo app path. Document required env vars in the package README (short).

**Default model:** if `OPENROUTER_MODEL` unset, use a current, widely available OpenRouter chat model id chosen at implement time from OpenRouter’s live catalog / provider docs (do not hardcode a retired id from memory).

## Critical Implementation Details

**AI SDK source of truth:** After `npm install` inside the package, implement against `node_modules/ai/docs/` (and OpenRouter provider docs in its package). Prefer `Output.object` + `ToolLoopAgent` patterns from the installed docs over remembered v5/v6 APIs.

**Git diff contract:** CLI runs `git diff HEAD` from the process cwd (repo root when invoked there). Empty stdout ⇒ fail fast. Do not stage, commit, or modify the working tree.

**Library vs CLI:** Factory must not read `process.env` as the only path — CLI resolves env and passes `apiKey` / `model` into `createCodeReviewer`. This keeps promptfoo free to inject its own model later.

## Phase 1: Package Scaffold & Root Isolation

### Overview

Create a runnable nested TypeScript package shell and prevent Expo root tooling from picking it up.

### Changes Required:

#### 1. Nested package manifest & TS tooling

**File**: `packages/code-reviewer/package.json`

**Intent**: Declare a private nested package with scripts for typecheck and CLI start via `tsx`, and dependencies on AI SDK, OpenRouter provider, Zod, plus dev tooling.

**Contract**: `"type": "module"` (AI SDK v7 is ESM-only — do not ship as CJS). Scripts at least `typecheck` (`tsc --noEmit`) and `start` (`tsx src/index.ts`). Runtime deps: `ai`, `@openrouter/ai-sdk-provider`, `zod`. Dev deps: `typescript`, `tsx`, `@types/node`. Optional tiny env loader only if needed for CLI (e.g. `dotenv`) — keep CLI-only.

#### 2. Package TypeScript config

**File**: `packages/code-reviewer/tsconfig.json`

**Intent**: Strict Node ESM TS config scoped to package `src/`, independent of Expo base config and **not** a copy of `workers/api` Cloudflare settings (`jsx`, `worker-configuration.d.ts`, Bundler-oriented Worker defaults).

**Contract**: `strict: true`, `noEmit: true`, `include: ["src/**/*.ts"]`. ESM-compatible `module` / `moduleResolution` suitable for Node + `tsx` (verify against installed AI SDK package examples after install).

#### 3. Root ignore package sources

**File**: `tsconfig.json`

**Intent**: Stop root Expo typecheck from compiling `packages/**`.

**Contract**: Add `packages` alongside `workers` in `exclude`.

#### 4. Root Jest ignore

**File**: `package.json` (root)

**Intent**: Keep Expo Jest from discovering package tests later.

**Contract**: Add `/packages/` to `jest.testPathIgnorePatterns` next to `/workers/`.

#### 5. Root ESLint ignore

**File**: `eslint.config.js`

**Intent**: Keep `expo lint` from applying Expo ESLint rules to the nested Node package.

**Contract**: Extend the existing `ignores` array (currently `dist/*`) with `packages/**` (and optionally `workers/**` for consistency if not already covered by tooling — only require `packages/**` for this change).

#### 6. Package gitignore (secrets + nested install)

**File**: `packages/code-reviewer/.gitignore`

**Intent**: Prevent committing OpenRouter keys and nested `node_modules`, matching the `workers/api` nested-package precedent (root only ignores `.env*.local`, not plain `.env`).

**Contract**: Mirror `workers/api` secret ignores: `.env*` plus `!.env.example`, and `node_modules/`.

#### 7. Env example & short README

**Files**: `packages/code-reviewer/.env.example`, `packages/code-reviewer/README.md`

**Intent**: Document `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, and how to `npm install` / `npm start` from the package directory.

**Contract**: No secrets committed; local keys live in ignored `.env` / `.env.local` under the package.

### Success Criteria:

#### Automated Verification:

- `packages/code-reviewer/package.json` and `tsconfig.json` exist
- From `packages/code-reviewer`: `npm install` completes
- Root `tsconfig.json` excludes `packages`
- Root Jest config ignores `/packages/`
- Root `eslint.config.js` ignores `packages/**`
- `packages/code-reviewer/.gitignore` ignores `.env` / `.env*` secrets (and `node_modules/`) while `.env.example` remains trackable

#### Manual Verification:

- Package directory layout matches nested `workers/api` isolation (own install, not hoisted via workspaces)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Agent Modules (Schemas, Prompts, Factory)

### Overview

Implement the reusable reviewer: Zod output schema, prompt modules, and `createCodeReviewer` wrapping `ToolLoopAgent` with OpenRouter and structured output — no tools.

### Changes Required:

#### 1. Structured output schema

**File**: `packages/code-reviewer/src/schemas/review-output.ts` (name may vary; keep under `schemas/`)

**Intent**: Define the review JSON shape for scoring and future evals.

**Contract**: Zod object with at least: `summary: string`, `findings: array` of `{ severity: enum (e.g. info|warning|error), path: string | null, message: string }`, and optionally `verdict: enum` (e.g. approve|comment|request_changes). Export schema and inferred TypeScript type.

#### 2. Prompt modules

**File**: `packages/code-reviewer/src/prompts/*.ts`

**Intent**: Keep instructions and user-prompt construction out of the agent factory body.

**Contract**: Export system/instructions string(s) for a code-review persona focused on correctness, security, and clarity of the provided diff. Export a function `buildReviewPrompt(diff: string): string` (or equivalent) that embeds the diff for the user turn.

#### 3. Agent factory

**File**: `packages/code-reviewer/src/agent/create-code-reviewer.ts` (path flexible under `src/`)

**Intent**: Build a reusable `ToolLoopAgent` configured for OpenRouter + structured review output.

**Contract**: `createCodeReviewer(options: { apiKey: string; model?: string })` returns a `ToolLoopAgent` instance. Uses `createOpenRouter({ apiKey })` and a chat model id from `options.model` or env-default resolved by the caller. Sets `output: Output.object({ schema: reviewOutputSchema })` (or installed-docs equivalent). **No `tools` (or empty tools object if the API requires the property).** Wires instructions from the prompts module. Do not read env inside the factory.

#### 4. Public library barrel

**File**: `packages/code-reviewer/src/lib.ts` (or package `exports` pointing at agent/schema/prompt modules)

**Intent**: Single import surface for future promptfoo / other callers.

**Contract**: Re-export `createCodeReviewer`, `reviewOutputSchema` (and type), and prompt helpers. CLI may import from here or from modules directly.

### Success Criteria:

#### Automated Verification:

- From `packages/code-reviewer`: `npm run typecheck` passes with agent modules present
- Factory signature accepts `apiKey` + optional `model` and returns a `ToolLoopAgent`
- Schema module exports a Zod schema usable by `Output.object`

#### Manual Verification:

- Skim module layout: schemas / prompts / agent are separate files (not a single monolith)

---

## Phase 3: CLI Entrypoint & Fail-Fast Behavior

### Overview

Wire `src/index.ts` as the thin CLI: env → diff → generate → JSON stdout / non-zero errors.

### Changes Required:

#### 1. CLI entry

**File**: `packages/code-reviewer/src/index.ts`

**Intent**: Provide the lesson entrypoint that reviews uncommitted changes and prints structured output.

**Contract**:
- Load env (`OPENROUTER_API_KEY` required; `OPENROUTER_MODEL` optional).
- Missing API key → stderr message, exit `1`.
- Run `git diff HEAD` (inherit cwd); on git failure or empty diff → stderr message, exit `1`.
- `createCodeReviewer({ apiKey, model })` then `generate` with `buildReviewPrompt(diff)`.
- On success: print `JSON.stringify(result.output, null, 2)` to stdout, exit `0`.
- On generate/provider failure: stderr, exit `1`.
- When executed as main (CLI), run the flow; keep library exports available via the barrel from Phase 2 (CLI file should not be the only export path if that blocks eval imports — prefer `package.json` `exports` mapping `"."` to the barrel and `"./cli"` or `"bin"`/`start` script to `src/index.ts`).

#### 2. Package scripts polish

**File**: `packages/code-reviewer/package.json`

**Intent**: Ensure `npm start` runs the CLI via `tsx`.

**Contract**: `start` → `tsx src/index.ts`. Document in README.

### Success Criteria:

#### Automated Verification:

- From `packages/code-reviewer`: `npm run typecheck` passes
- Simulated/missing-key path: running CLI without `OPENROUTER_API_KEY` exits non-zero (manual or small scripted check)
- Empty-diff path: clean tree ⇒ non-zero exit with clear message

#### Manual Verification:

- With a real key and a small local uncommitted diff, `npm start` prints JSON with `summary` + `findings` matching the schema
- Output is usable as a library import surface for a future eval (factory + schema + prompts exported)
- README documents the chosen default OpenRouter model id and how to override it via `OPENROUTER_MODEL`

---

## Testing Strategy

### Unit Tests:

- Not required in this change (no test runner wired for the package yet). Prefer typecheck + manual CLI smoke.
- If a tiny pure unit test is added later: schema parse of a fixture object — optional, not a phase gate.

### Integration Tests:

- None (no promptfoo; no live-API CI).

### Manual Testing Steps:

1. `cd packages/code-reviewer && npm install && npm run typecheck`
2. Unset key → `npm start` → expect non-zero + message
3. Set key, clean git tree → expect non-zero empty-diff message
4. Make a trivial uncommitted edit → `npm start` → valid JSON review on stdout

## Performance Considerations

Diff size is unbounded; for MVP accept full `git diff HEAD`. If the diff is huge, the provider may truncate or error — fail fast on provider error; do not add chunking in this change.

## Migration Notes

None for the Expo app. New package is additive. Operators need an OpenRouter API key locally.

## References

- Prompt: m5l2-agent (`tool-loop-agent`)
- Skill: `.agents/skills/ai-sdk/SKILL.md`
- Isolation precedent: `workers/api/package.json`, `workers/api/tsconfig.json`
- AI SDK agents: https://ai-sdk.dev/docs/agents/overview
- OpenRouter provider: https://ai-sdk.dev/providers/community-providers/openrouter

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Package Scaffold & Root Isolation

#### Automated

- [x] 1.1 packages/code-reviewer/package.json and tsconfig.json exist
- [x] 1.2 npm install completes in packages/code-reviewer
- [x] 1.3 Root tsconfig.json excludes packages
- [x] 1.4 Root Jest config ignores /packages/
- [x] 1.5 Root eslint.config.js ignores packages/**
- [x] 1.6 Package .gitignore covers .env secrets and node_modules while .env.example stays trackable

#### Manual

- [x] 1.7 Package layout matches nested workers/api isolation

### Phase 2: Agent Modules (Schemas, Prompts, Factory)

#### Automated

- [ ] 2.1 npm run typecheck passes with agent modules
- [ ] 2.2 createCodeReviewer accepts apiKey + optional model and returns ToolLoopAgent
- [ ] 2.3 Schema module exports Zod schema for Output.object

#### Manual

- [ ] 2.4 Schemas / prompts / agent live in separate modules

### Phase 3: CLI Entrypoint & Fail-Fast Behavior

#### Automated

- [ ] 3.1 npm run typecheck passes with CLI
- [ ] 3.2 CLI without OPENROUTER_API_KEY exits non-zero
- [ ] 3.3 Empty git diff HEAD exits non-zero with clear message

#### Manual

- [ ] 3.4 npm start with key + uncommitted diff prints schema-valid JSON
- [ ] 3.5 Library exports (factory + schema + prompts) usable for future eval
- [ ] 3.6 README documents default OpenRouter model id and OPENROUTER_MODEL override
