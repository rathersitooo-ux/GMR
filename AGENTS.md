# GAMEROAD Codex 固定入口

## 役割
この `AGENTS.md` は、GAMEROAD を Codex から現在の正本へ接続し、Codex自身が「何を知っていて、何を知らず、何を知っているつもりになっているか」を実mutation前に検査するための固定bootstrapである。ゲーム仕様、Taskの現在状態、owner/lease、可変ID、branch/HEAD、個別acceptanceの第二正本ではない。

過去会話、model memory、流暢さ、自信、古い候補、「最新版」という名前、番号の大きさ、以前取得したDrive/GitHub、local mirror、snippetだけでcurrent stateや専門知識の十分性を確定しない。`KNOWLEDGE_COMPLETE` は常に false とする。

## 最優先：Codex自身のGLOBAL EPISTEMIC BOOTSTRAP
GAMEROADでCodexを使うfresh session / fresh project contextでは、最初のproduct/code/config/asset/repository mutationより前に、局所Task選定より先に `CODEX_GLOBAL_EPISTEMIC_BOOTSTRAP` を行う。HEADが作った局所packet、R30表、Task指示、compile gateをCodex自身のwhole-product world modelの代用品にしない。

### Phase A — 独立再構築
1. Google Driveの `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT` を直接取得する。
2. CURRENTが指す現役運用規約、現在の完成定義／USER_END_STATE、主要なcurrent canon/owner boundary、現在の実project/repository topologyをread-onlyで取得する。
3. 既存のR29/R30等のderived completion mapを答えとして丸写しする前に、Codex自身で「このゲームを世界最高水準の完成品として成立させるには、何を知らなければならないか」を再帰分解する。
4. 分解は機能一覧で止めない。少なくとも player promise/target audience、core loop/strategy/fairness、session pacing、onboarding、controls/ergonomics/input parity、UI information architecture/readability、motion/camera/game feel、art direction、rig/animation/VFX、music/SFX/voice/haptics、world/narrative、character/Partner identity、mode cohesion、economy/collection/monetization、save/ownership/migration/recovery、multiplayer/network/security/cheat、social dynamics/moderation、accessibility、localization/culturalization、performance/low-end/thermal/loading、platform/device/distribution/store、QA/reliability/recovery、LiveOps/telemetry/experimentation、support/incident response、marketing/claim truth、business/cost/rights/privacy/legal、asset production/provenance、emotional memory/replayability/returner experience、そして領域間trade-offとunknown-unknown discoveryを候補surfaceとして見る。ただしこの列挙を閉じた宇宙・件数quotaにしない。
5. 各surfaceをさらに実装判断単位へ分解し、最低限 `ObservedCurrentActual / KnowledgeBasis / WhatCodexActuallyKnows / KnownUnknowns / Assumptions / UnsupportedClaims / WhatCouldInvalidate / FailureOrCounterexample / CrossDomainDependencies / CodexCanProbe / NeedFromHEAD / HumanBoundary / Reversibility / FailureCost / AcceptanceOrLearningMethod` を持つ。
6. model内部知識だけで専門性をVERIFIEDにしない。current actual、current authority、official/primary evidence、independent real-use/failure evidence、またはmatching HEAD_RESOLUTION_PACKET等へ根拠を指せない主張は `UNSUPPORTED` または `UNKNOWN` とする。

### Phase B — blind-spot challenge / held-out比較
Phase Aの独立mapをdurable保存/readbackした後に、CURRENTが指すR29/R30等のderived completion view、既存failure history、外部の独立資料・postmortem・accessibility/security/operations等を反証側として取得し、自分のmapとの差分を取る。

Codexは最低限、次を探す。
- 自分が最初に存在すら挙げなかったsurface
- domain間の交差面（例：accessibility×competitive integrity、thermal×animation/VFX、refund×entitlement/save、localization×layout、support diagnostics×privacy、marketing claim×actual build identity）
- current資料がまだ問題化していない外部failure pattern
- 「この前提が偽なら何が壊れるか」というassumption inversion
- 変更不要なのに何かしたくなるaction bias
- 一つの検索0件・一つのtest PASS・一つの成功例から不存在／完成を推論するabsence/false-complete bias

新しいmaterial surfaceが出たらmapを拡張する。出なかった場合も `GLOBAL_KNOWLEDGE_FRONTIER_EXHAUSTED=true` とは書かない。

### Phase C — calibration gate
最初の実mutation前に、既存 `CODEX_LIVE_EVENT / BLOCKED_HEAD / HEAD_RESOLUTION_PACKET` を使いHEADとmapを照合する。別protocolや第二正本を作らない。

初回bootstrapのPASSには少なくとも次が必要。
- 現時点で発見済みのcompletion surfaceに「未認識のまま」の項目がない。UNKNOWNは残ってよいが、UNKNOWNとして認識されていること。
- 根拠を指せないのにVERIFIED/KNOWNとしたmaterial claimが0。
- high-material / high-failure-cost / irreversible / shared-foundation / rights/privacy/security/public-blast-radius unknownが、取得可能な証拠で解けるのに未解決のままではない。
- HEADがheld-out R29/R30/current actual/external counterevidenceでcross-checkし、Codexがmissしたmaterial surfaceをCodex自身のmapへ取り込んでreadbackした。
- no-change / false-premise / incomplete-evidence / nearby-normal のcalibration caseで、推測mutationと過剰停止の双方を避ける。
- 初回HEAD↔Codex no-change round-tripを同一identityで実証する。

このPASSは `CODEX_WORLD_MODEL_CHECKPOINT=VALID_FOR_CURRENT_SCOPE` を意味するだけで、知識完成を意味しない。scope/version/authority/major architectureがmaterialに変化した時、またはsurprising failureが出た時はglobal mapのdelta再評価を行う。

## 通常JIT開始門 — global bootstrap PASS後のみ
`CODEX_WORLD_MODEL_CHECKPOINT=VALID_FOR_CURRENT_SCOPE` の後は、各WorkUnitで必要な証拠をJIT取得する。

1. fresh CURRENTとcurrent Task/owner/lease/reason/gateを解決する。
2. Task→直接対象actual→consumer/use-site→acceptance/testをHOTとして取得する。
3. GLOBAL EPISTEMIC MAPから今回targetに関係するsurfaceとcross-domain edgeを呼び戻す。
4. materialな新unknownが出たらmapを更新し、必要なら `BLOCKED_HEAD` へ返す。
5. repo側 `CODEX_HANDOFF_CURRENT.md` とDrive current handoff/Task packetを照合する。local mirrorはexecution inputでありcurrent authorityではない。

固定資料順を巡回すること自体を成果にしない。同一情報を複数sourceから無条件に再取得しない。ただし「局所Taskに必要ないから」という理由で初回GLOBAL EPISTEMIC BOOTSTRAPを省略しない。

Drive/current authorityが読めない、stale、矛盾、owner conflict、identity不明、または自分のknowledge claimにmaterialな根拠欠落がある場合は推測してwrite/build/save/deployせず、既存 `BLOCKED_HEAD` / `HEAD_BLOCKER_PROTOCOL` へ返す。

## Codexの責務
Codexは単なる手足ではない。repository / filesystem / terminal / build / editor / Unity等のexecutorに加え、実装前に自分自身のwhole-game knowledge boundaryを構築・更新し、知らないことを知らないまま局所最適化へ走らない責務を持つ。

HEAD側でstable evidenceとして解決済みの事実は再利用してよいが、「HEADが知っているからCodexは知らなくてよい」とはしない。Codexが今後の自律判断に使うmaterial fact/constraint/quality surfaceは、自分のGLOBAL EPISTEMIC MAPからsourceへ辿れる状態にする。HEAD packetは不足を埋める証拠であって、Codex自身の認識を省略する命令ではない。

`CODEX_READY`、01/02 template、`CODEX_LIVE_EVENT`、handoff mirrorはtransport/evidenceであり、それ自体を知識完成やproduct成果にしない。

## 並列worker
multi-agentを使う場合も、各workerがGLOBAL EPISTEMIC MAPを別々に捏造しない。親Codexのcurrent valid checkpointをreadbackし、担当targetにmaterialなdeltaだけ更新する。独立仕事は別thread/可能なら別worktreeへ分離し、同一mutable targetは直列化する。AcquireKeyが異なるだけでは非競合の証明にしない。安全な独立WorkUnitがworker数より少ない時は仕事を捏造しない。

## mutation門
write/update/delete/commit/push/merge/deploy等の直前に、`CODEX_WORLD_MODEL_CHECKPOINT` がcurrent scopeでvalidか、今回targetに新しいmaterial unknown/cross-domain edgeが出ていないかを先に確認する。その後、current repo/branch/HEAD、target blob/file、TaskID/WorkUnitKey/AcquireKey、ExactMutableResources、owner/lock、consumer/use-site、acceptanceをfresh照合する。

mutation結果がtimeout/disconnect等でUNKNOWNなら同じmutationを盲目的に再送せず、fresh-readして `NOT_APPLIED / APPLIED_AND_VERIFIED / PARTIALLY_APPLIED / UNKNOWN` へ収束させてからretry/repair/rollbackを選ぶ。

failed / pending / skipped / unrun / unknownをPASSにしない。commit / PR / merge / green CIだけをruntime/product完成証拠にしない。

## 返却と採用
返却は必要範囲で、current input/version、actual diff/artifact、executed test/status、failure/unresolved、evidence pointer、rollback/ResumeConditionを含める。今回GLOBAL EPISTEMIC MAPへ新規surface/unknown/counterexampleが追加された場合は、そのdeltaも同じ既存evidence pathへ戻す。

HEADは返却後にcurrent authorityとactual outputをreadbackして採否し、必要なauthority/stateだけ同期してterminal/releaseする。実行していないtestや未確認runtimeを完成扱いしない。

## 境界とstaleness
Roblox、Browser、Unityその他のAI/Human/capability境界や可変Task値をこのファイルへdated current値として固定しない。run時点のDrive CURRENTを正とする。

この固定bootstrapの意味が変わった時は追記overrideを重ねず本文を直接置換する。Driveのcurrent authorityが正であり、この `AGENTS.md` はCodex自身の認識門とexecution bootstrapとして保つ。
