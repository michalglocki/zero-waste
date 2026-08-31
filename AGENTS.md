# Repository Guidelines

Zero waste is a household inventory mobile MVP on Expo SDK 56 (React Native, TypeScript, expo-router). Product intent and stack choices live in `@context/foundation/prd.md` and `@context/foundation/tech-stack.md`.

## Hard rules

- Expo HAS CHANGED across majors. Before writing Expo or React Native code, read the versioned docs at https://docs.expo.dev/versions/v56.0.0/ — do not rely on training-data defaults.
- Never overwrite `context/`; it is the source of truth for PRD, tech-stack hand-off, and change logs.
- Import app code via the `@/` alias (`@/*` → `./src/*`); see `@tsconfig.json`.

## Security & configuration

- Local env files matching `.env*.local` are gitignored (`@.gitignore`). Do not commit secrets or native signing material (`*.jks`, `*.p8`, `*.mobileprovision`).

## Project structure

- `src/app/` — screens and layouts (`@src/app/`).
- `src/components/`, `src/hooks/`, `src/constants/` — UI, hooks, theme tokens.
- `assets/` — images and icons referenced from `@app.json`.
- `context/foundation/` — shaping docs; `context/changes/` — run logs (e.g. bootstrap verification).
- `scripts/` — project scripts; `scripts.scaffold/` — scaffold sidecars from bootstrap.

## Build, test, and development

- Dev scripts: `@package.json` (`start`, `android`, `ios`, `web`, `lint`).
- No unit or e2e runner is configured yet; do not add one without an explicit project decision.

## Coding style & naming

- Match existing kebab-case module names (`animated-icon.tsx`, `app-tabs.tsx`) and platform siblings (`.web.tsx`); see `@tsconfig.json`.
- Route files under `src/app/` use default exports; follow neighbors in `src/components/` for export style.
- Keep `experiments.typedRoutes` and `experiments.reactCompiler` in `@app.json` unless changing them on purpose.

## Commit & pull request guidelines

- History is short and informal; prefer concise, why-focused subjects.
- No `.github/workflows` yet — CI is planned in `@context/foundation/tech-stack.md` but not present.
