# GAMEROAD Codex local handoff mirror

STATUS: HEAD_REFRESH_REQUIRED

Drive source: `GAMEROAD_CODEX_HANDOFF_CURRENT.md` (`1r6aGPWWyxkrYg__xBumHrbUV4ay43bdb`)
Bootstrap updated: 2026-08-22 JST

This checked-in file is only the fail-closed local mirror slot required by GAMEROAD's existing Codex local-placement contract. It is **not** current task authority and it never authorizes a mutation by itself.

Before each Codex task, ChatGPT as HEAD must refresh this local mirror from the live Drive source and the exact current 01 request packet so that the packet contains the current `TaskID`, `WorkUnitKey`, `AcquireKey`, `ExactMutableResources`, `CODEX_ONLY_REASON`, `AI_PREWORK_COMPLETE`, change/do-not-change scope, acceptance evidence, and return/live-event sink.

If this file still says `HEAD_REFRESH_REQUIRED`, if its packet is stale, if the Drive source cannot be resolved, or if the current acquisition/authority conflicts, Codex must not modify, build, save, deploy, or guess. Return `BLOCKED_HEAD` through the existing `HEAD_BLOCKER_PROTOCOL`.

The current 2026-08-19 R91 user ruling excludes Roblox-only execution from the AI work universe. Older Roblox IDs, SHA values, Studio steps, and resume points are history/provenance only unless the user explicitly issues a newer ruling.
