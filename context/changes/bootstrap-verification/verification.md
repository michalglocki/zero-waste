---
bootstrapped_at: 2026-05-27T19:18:11Z
starter_id: expo
starter_name: Expo (React Native)
project_name: zero-waste
language_family: js
package_manager: npm
cwd_strategy: subdir-then-move
bootstrapper_confidence: verified
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: expo
package_manager: npm
project_name: zero-waste
hints:
  language_family: js
  team_size: solo
  deployment_target: appstore-via-eas
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: verified
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Zero waste is a cross-platform mobile MVP: barcode scanning, fast stock lookup while shopping, and shared household inventory with login. Expo (React Native) is the vetted default for mobile in JavaScript/TypeScript — one codebase for iOS and Android, TypeScript throughout, and bootstrapper confidence is verified so scaffolding should be smooth. Deployment defaults to app store builds via EAS; GitHub Actions will auto-deploy on merge to main. Auth is in scope for the PRD but not bundled in the starter — plan to add a provider (e.g. Supabase or Firebase) during implementation. Spring/Java was ruled out because the registry has no Java mobile starter aligned with this product type.

## Pre-scaffold verification

| Signal      | Value                                         | Severity | Notes                                    |
| ----------- | --------------------------------------------- | -------- | ---------------------------------------- |
| npm package | create-expo-app v4.0.0 modified 2026-05-15   | fresh    | resolved from `bootstrap-run.log`        |
| GitHub repo | not run                                       | —        | Expo docs URL is not a GitHub repository |

## Scaffold log

**Resolved invocation**: `npx create-expo-app .bootstrap-scaffold --yes --template default`

**Strategy**: subdir-then-move

**Exit code**: 0

**Files moved**: 14

**Conflicts (.scaffold siblings)**: scripts -> `scripts.scaffold`

**.gitignore handling**: moved silently

**.bootstrap-scaffold cleanup**: deleted

**Move log (from `bootstrap-run.log`)**:

- moved: `.claude`, `.vscode`, `assets`, `node_modules`, `src`, `.gitignore`, `AGENTS.md`, `app.json`, `CLAUDE.md`, `LICENSE`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`
- skipped: `.git`
- conflict sidecar created: `scripts.scaffold`

## Post-scaffold audit

**Tool**: `npm audit --json`

**Summary**: 0 CRITICAL, 0 HIGH, 11 MODERATE, 0 LOW

**Direct vs transitive**: 2 direct MODERATE (`expo`, `expo-splash-screen`), 9 transitive MODERATE

Top affected packages (all MODERATE): `expo`, `expo-splash-screen`, `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/inline-modules`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, `uuid`, `xcode`.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | verified           |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | appstore-via-eas   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

## Next steps

1. Start the app: `npm start`
2. Launch targets: `npm run android`, `npm run ios`, or `npm run web`
3. Decide whether to keep or remove `scripts.scaffold` after diffing against `scripts/`
4. Plan dependency updates for the moderate advisories (Expo ecosystem pins may require coordinated upgrades)

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.
