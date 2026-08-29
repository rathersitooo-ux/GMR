# GAMEROAD CODEX 4-WINDOW LAUNCH CURRENT

Drive mirror: `GAMEROAD_CODEX_4WINDOW_LAUNCH_CURRENT` (`1Zj32du5jLLwZWmESeDl7DDjZ55t1TmuiwhdGym0-9U4`).

## Purpose
This filename is kept for backward compatibility. **Four is a ceiling, not a launch target.** The current purpose is to avoid making the user paste a giant prompt again while launching only the number of independent GAMEROAD Codex workers that are both non-conflicting and worth the additional finite/metered Codex consumption.

`W1` / `W2` / `W3` / `W4` are identifiers only. Do not invent fixed roles for them.

This file is an inner Codex routing surface. It does **not** authorize the initial Codex invocation. The pre-Codex wake/dispatch decision must already have been made outside the Codex process under current user/resource constraints. Do not use an already-running Codex session to retroactively justify why Codex should have been started.

## Parent thread
1. Read this file, `AGENTS.md`, and `CODEX_HANDOFF_CURRENT.md`.
2. Fresh-read Google Drive `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT`, then only the current authority / owner / lock / lease / Human-capability evidence needed for launch. Recover any current user constraint that materially changes executor/resource selection.
3. Resolve the bounded Codex authorization for this already-started session: exact user/resource constraint source, whether remaining allowance is KNOWN or UNKNOWN, `CODEX_ONLY_REASON` or equivalent bounded reason, whether recurring/long-running execution was explicitly authorized, and whether a same-acceptance lower-consumption route exists. Plan inclusion is not evidence of free/unlimited/opportunity-cost-zero usage.
4. Start **zero to four** additional independent workers. For each proposed worker beyond the current thread, require a distinct safe WorkUnit plus a marginal-value reason showing that the extra finite-resource consumption materially shortens distance to `USER_END_STATE`. If remaining allowance is UNKNOWN, do not treat that as permission for automatic multi-worker or recurring escalation.
5. Use isolated worktrees where appropriate, but worktree separation does not by itself prove non-conflict. Each worker must fresh-read CURRENT/current acquisition state before work selection, exclude concrete mutable targets already valid-ACTIVE in another worker, formal-acquire one safe non-conflicting work unit before mutation, and then execute -> test -> readback -> necessary sync -> terminal/release.
6. If fewer workers are justified, launch fewer. Do not fabricate work, marginal value, quota, or urgency merely to fill slots.
7. Verify only the thread IDs actually created. Never report four windows as launched unless four were both authorized and actually created.
8. After launch verification, workers continue the GAMEROAD work they acquired; launch confirmation is not the end goal.

## Do not
- Do not ask the user to paste the 43-section common prompt again.
- Do not reprint long rules into the chat when the repo bootstrap/CURRENT can be read directly.
- Do not restore the retired fixed mapping of W1/W2/W3/W4 to code/art/game/recovery roles.
- Do not equate "supported by the Codex surface" with "authorized or worth spending four workers".
- Do not infer `remaining allowance = infinity` from UNKNOWN, plan inclusion, or prior successful Codex use.
- Do not convert the finite-resource constraint into a fabricated permanent Codex ban. A bounded Codex worker remains valid when it is the best current route to acceptance.
- Do not treat search/planning/task bookkeeping as the workers' end result when executable downstream work exists.
- Do not claim game/product progress merely because the launcher or control plane changed.

If Drive CURRENT cannot be accessed from the current Codex environment, return the exact blocker as `DRIVE_CURRENT_UNAVAILABLE`; do not use 'paste the whole long prompt again' as the fallback.

## Minimal user launch command

> repoの `CODEX_4WINDOW_LAUNCH_CURRENT.md` を全文読んで、CURRENTと現在の利用制約から正当化できる必要数だけ（最大4）GAMEROADの作業員を起動して作業を開始して。4枠を埋めること自体を目的にせず、長文promptの再貼付けは求めないで。

## Minimal Project instructions

> GAMEROADではrepoの `AGENTS.md` を常時守る。旧4窓入口を求められたら `CODEX_4WINDOW_LAUNCH_CURRENT.md` を全文読んで、4を目標ではなく上限として扱う。追加workerごとに非競合性と有限resourceの追加消費に見合う実成果を確認し、長文promptを利用者へ再貼付けさせない。current stateは毎回Drive CURRENTから取得する。

## Launch result

Return only the necessary launch state, for example:

```text
LAUNCH_STATE=<PASS|BLOCKED|PARTIAL>
AUTHORIZED_WORKER_COUNT=<0..4>
W1=<thread id / Task or NOT_AUTHORIZED_OR_NEEDED>
W2=<thread id / Task or NOT_AUTHORIZED_OR_NEEDED>
W3=<thread id / Task or NOT_AUTHORIZED_OR_NEEDED>
W4=<thread id / Task or NOT_AUTHORIZED_OR_NEEDED>
RESOURCE_STATE=<KNOWN|UNKNOWN>
BLOCKER=<none or exact blocker>
```

This file is launcher transport, not a second source of truth for GAMEROAD specification, task state, user intent, price, quota, or allowance. Volatile/current state always comes from Drive CURRENT, direct current user evidence, and direct actuals.
