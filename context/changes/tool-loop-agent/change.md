---
change_id: tool-loop-agent
title: ToolLoopAgent code reviewer package
status: impl_reviewed
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

m5l2: greenfield `packages/code-reviewer` — originally AI SDK `ToolLoopAgent` + OpenRouter; redesigned 2026-09-12 to `@cursor/sdk` local `Agent.prompt` + Zod parse (company policy blocks OpenRouter). Auth via `CURSOR_API_KEY` (local `.env` + GitHub Actions secret). Nested npm package (same isolation pattern as `workers/api`).

Plan review: `reviews/plan-review.md` — F1–F5 FIXED; verdict SOUND after triage.
Impl review: `reviews/impl-review.md` — APPROVED; F1 FIXED (Cursor smoke), F2 ACCEPTED.
