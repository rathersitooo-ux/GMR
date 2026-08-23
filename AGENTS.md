# GAMEROAD Codex 固定入口

## 役割
この `AGENTS.md` は、GAMEROAD を Codex から現在の正本へ接続するための固定bootstrapである。ゲーム仕様、Taskの現在状態、owner/lease、可変ID、branch/HEAD、個別acceptanceの第二正本ではない。

過去会話、memory、古い候補、「最新版」という名前、番号の大きさ、以前取得したDrive/GitHub、local mirror、snippetだけでcurrent stateを確定しない。

## JIT開始門
GAMEROADでCodexを使うrunは、実project stateを変える前に次を行う。

1. Google Driveの `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT` を直接取得する。
2. そのCURRENTが指す現役運用規約と、今回対象Taskのcurrent owner/lease/reason/gateを必要範囲だけ解決する。
3. Task→直接対象actual→consumer/use-site→acceptance/testをHOTとして取得する。
4. parent/child、dependency、全作業接続地図、旧Reason、履歴、素材台帳、failure資料等は、identity・risk・矛盾・acceptanceをmaterialに変える時だけ追加取得する。
5. repo側 `CODEX_HANDOFF_CURRENT.md` とDriveのcurrent handoff/Task packetを照合する。local mirrorはexecution inputでありcurrent authorityではない。

固定資料順を巡回すること自体を開始条件・成果にしない。同一情報を複数sourceから無条件に再取得しない。

Drive/current Task/AcquireKey/ExactMutableResources/acceptanceが読めない、stale、矛盾、owner conflict、identity不明の場合は推測してwrite/build/save/deployせず、既存 `BLOCKED_HEAD` / `HEAD_BLOCKER_PROTOCOL` へ返す。

## Codexの責務
Codexへ渡すのは repository / filesystem / terminal / build / editor / Unity その他、現在のCodex固有executorが必要な `EXECUTION_RESIDUAL` を中心とする。

HEAD側で既にstable evidenceとして解決済みの一般調査、仕様整理、旧資料監査、外部比較をCodexで無条件に全面再実行しない。今回のmutation・test・acceptanceをmaterialに変える不足だけをJIT取得する。

`CODEX_READY`、01/02 template、`CODEX_LIVE_EVENT`、handoff mirrorはtransport/evidenceであり、すべてを毎run通る固定hopではない。

## 並列worker
現在のCodex surfaceがmulti-agentを支援する場合、独立仕事は別threadと、同一repoでは可能な限り別worktreeへ分離する。

- 一worker一主WIPを原則とする。
- 各workerは開始時にfresh CURRENTとformal WorkUnit/AcquireKeyを解決する。
- 後発workerは先行workerがACTIVEにした具体mutable targetを候補から除外する。
- AcquireKeyが異なるだけでは非競合の証明にしない。
- 同じfile/branch、schema/migration、shared registry、order-dependent state、同一Human acceptance object等、安全分割できないtargetは直列化する。
- 安全な独立WorkUnitがworker数より少ない場合、slotを埋めるために仕事を捏造・複製しない。
- focused promptはCURRENTの候補宇宙を閉じるTask quotaではなくselection lensとして扱い、focused laneがblocked/no-deltaならCURRENTの非競合な高価値実作業へfallbackする。
- alias番号、TaskID、branch、閾値等の可変値をこの固定入口へハードコードしない。実行時CURRENTから解決する。

## mutation門
write/update/delete/commit/push/merge/deploy等の直前に、必要範囲でcurrent repo/branch/HEAD、target blob/file、TaskID/WorkUnitKey/AcquireKey、ExactMutableResources、owner/lock、consumer/use-site、acceptanceをfresh照合する。

中断によって実行成否不明、二重副作用、未保存progress喪失、stale owner/version/revision、再開地点消失その他のmaterial riskが生じ得る操作では、CURRENTの `INTERRUPTION_TRAP_CHECK` / `RESOLUTION_PREP_MODE` を適用する。

mutation結果がtimeout/disconnect等でUNKNOWNなら同じmutationを盲目的に再送せず、fresh-readして `NOT_APPLIED / APPLIED_AND_VERIFIED / PARTIALLY_APPLIED / UNKNOWN` へ収束させてからretry/repair/rollbackを選ぶ。

failed / pending / skipped / unrun / unknownをPASSにしない。commit / PR / merge / green CIだけをruntime/product完成証拠にしない。

## 返却と採用
返却は必要範囲で、current input/version、actual diff/artifact、executed test/status、failure/unresolved、evidence pointer、rollback/ResumeConditionを含める。

HEADは返却後にcurrent authorityとactual outputをreadbackして採否し、必要なauthority/stateだけ同期してterminal/releaseする。実行していないtestや未確認runtimeを完成扱いしない。

## 境界とstaleness
Roblox、Browser、Unityその他のAI/Human/capability境界は、このファイルへdated current値として固定せずrun時点のDrive CURRENTを正とする。

固定bootstrapの意味が変わった時は、旧current本文へ追記overrideを重ねず本文を直接置換する。Driveのcurrent authorityが正であり、この `AGENTS.md` は短いexecution bootstrapとして保つ。
