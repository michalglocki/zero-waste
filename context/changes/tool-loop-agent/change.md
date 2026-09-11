---
change_id: tool-loop-agent
title: ToolLoopAgent code reviewer package
status: implementing
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

m5l2: greenfield `packages/code-reviewer` — modular `ToolLoopAgent` (AI SDK + OpenRouter + Zod), factory export for future promptfoo, thin CLI over `git diff HEAD`. No eval harness in this change. Nested npm package (same isolation pattern as `workers/api`).

Plan review: `reviews/plan-review.md` — F1–F5 FIXED; verdict SOUND after triage.
