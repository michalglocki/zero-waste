---
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
---

## Why this stack

Zero waste is a cross-platform mobile MVP: barcode scanning, fast stock lookup while shopping, and shared household inventory with login. Expo (React Native) is the vetted default for mobile in JavaScript/TypeScript — one codebase for iOS and Android, TypeScript throughout, and bootstrapper confidence is verified so scaffolding should be smooth. Deployment defaults to app store builds via EAS; GitHub Actions will auto-deploy on merge to main. Auth is in scope for the PRD but not bundled in the starter — plan to add a provider (e.g. Supabase or Firebase) during implementation. Spring/Java was ruled out because the registry has no Java mobile starter aligned with this product type.
