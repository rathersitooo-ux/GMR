# GAMEROAD Codex Handoff CURRENT

## Role
ChatGPT HEAD と Codex executor の dynamic restart transport。ゲーム仕様正本・履歴正本・単独mutation許可ではない。current state はこのファイルの古い値ではなく、実行時の Drive CURRENT / current Task / actual から解決する。

このhandoffはCodexへ局所Taskだけを見せてwhole-game contextを省略するためのものではない。fresh Codex session / fresh project contextでは、repo側 `AGENTS.md` の `CODEX_GLOBAL_EPISTEMIC_BOOTSTRAP` が最初の実mutationより先に発火する。このhandoffのTask packetはそのbootstrap後の通常JIT実行を補助するtransportであり、Codex自身のwhole-product world modelを置き換えない。

Codexは有限・従量・共有枠になり得るexecutor候補であり、このhandoffは**Codexを起動すること自体の許可**ではない。初回Codex invocationの前に、Codexプロセス外のcurrent router/wake gateが利用者の現在制約と同等成果の代替経路を評価している必要がある。Codexを既に起動した後で、そのCodex自身に「Codexを使うべきだった」と事後正当化させない。

## GLOBAL EPISTEMIC BOOTSTRAP transport
初回bootstrapではHEADが完成像の答えを先に局所packet化して渡さない。Codexはfresh CURRENT、現役運用規約、completion definition / USER_END_STATE、主要current canon/owner boundary、実project/repository topologyをread-only取得し、まず自力でwhole-game completion knowledge surfaceを再帰分解する。

Codex独立mapは既存 `CODEX_LIVE_EVENT Stage=BLOCKED_HEAD` に同一TaskID/WorkUnitKey/AcquireKey/EventSeqで保存/readbackする。別protocol・第二正本・別Task系統を作らない。mapの各細粒度surfaceは少なくとも `ObservedCurrentActual / KnowledgeBasis / WhatCodexActuallyKnows / KnownUnknowns / Assumptions / UnsupportedClaims / WhatCouldInvalidate / FailureOrCounterexample / CrossDomainDependencies / CodexCanProbe / NeedFromHEAD / HumanBoundary / Reversibility / FailureCost / AcceptanceOrLearningMethod` を持つ。

Phase Aの独立map保存後にだけ、HEADはR29/R30等のderived completion view、current failure history、外部primary/independent/failure evidenceをheld-out oracleとして比較する。Codexが最初に存在すら挙げなかったsurface、unsupported VERIFIED、domain交差面、反例を `HEAD_RESOLUTION_PACKET` で返し、Codex自身のmapへ統合/readbackさせる。

初回mutation許可には `CODEX_WORLD_MODEL_CHECKPOINT=VALID_FOR_CURRENT_SCOPE` が必要。これは次を満たすcurrent-scope calibration checkpointであり、knowledge completeではない。
- 現在発見済みsurfaceに未認識のままの項目がない。UNKNOWNはUNKNOWNとして明示される。
- 根拠に辿れないmaterial VERIFIED/KNOWN claimが0。
- 取得可能なhigh-material / high-failure-cost / irreversible / shared-foundation / rights/privacy/security/public-blast-radius unknownを推測で残さない。
- HEAD held-out cross-checkで出たmaterial missをCodex自身のmapへ取り込んだ。
- no-change / false-premise / incomplete-evidence / nearby-normal calibrationで、不要mutationと過剰停止の双方を避けた。
- 同一identityのHEAD↔Codex no-change round-tripが成立した。

`KNOWLEDGE_COMPLETE=false` / `GLOBAL_KNOWLEDGE_FRONTIER_EXHAUSTED=false` は常に維持する。scope/version/authority/major architectureがmaterialに変わった時やsurprising failure後はglobal mapのdeltaを再評価する。

## JIT routing — WORLD MODEL checkpoint後
`CODEX_WORLD_MODEL_CHECKPOINT=VALID_FOR_CURRENT_SCOPE` 成立後の通常WorkUnitでは、HEADとCodexは最小十分なJIT evidenceを使う。

Codex dispatch前後に解決する核は、Drive `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT`、現役運用規約、対象Taskの current owner/lease、直接対象actual、consumer/use-site、変更境界、acceptance、material unresolved / ResumeCondition である。

親・隣接正本、全作業接続地図、旧Reason Pack、外部根拠、履歴、failure matrix、size/SHA 等は、今回のidentity・risk・acceptance・矛盾を material に変える時だけ追加取得する。同じ情報を複数sourceから固定順に再取得しない。ただし初回GLOBAL EPISTEMIC BOOTSTRAPを「今回Taskに不要」として省略しない。

通常WorkUnitでCodexへ渡す `EXECUTION_RESIDUAL` は、CodexのGLOBAL EPISTEMIC MAPから今回targetに関係するsurface/cross-domain edgeを呼び戻した上で扱う。HEADが知っていることを理由にCodex自身のmaterial knowledge boundaryを空欄にしない。

## Finite-resource dispatch context
Codexへ新しい実WorkUnitを渡す時は、既存packetの一部として最低限次を解決する。別protocolや第二正本は作らない。
- `RESOURCE_CONSTRAINT_SOURCE`: current user RAW / current authority pointer。AI要約だけを利用者制約の正本にしない。
- `CODEX_RESOURCE_STATE`: `KNOWN` または `UNKNOWN`。UNKNOWNを0にも無限にも変換しない。
- `CODEX_ONLY_REASON`: なぜ同等acceptanceへ到達する低消費/非Codex経路では足りないか。Codex禁止ではないので、妥当なbounded理由があれば使える。
- `BOUNDED_INVOCATION`: このdispatchで必要なCodex session/worker/cycleの上限。無期限・常駐・再帰的worker増殖を暗黙値にしない。
- `LOWER_CONSUMPTION_EQUIVALENT`: 同等以上のacceptanceへ届く低消費候補の有無と採否根拠。
- `RECURRING_AUTHORIZATION`: unattended/recurring/long-running consumptionを現在明示的に許す根拠。単発許可を常駐許可へ拡張しない。

このcontextは、既に起動済みCodex内での追加worker・追加cycleの抑制にも使う。ただしinitial invocationの費用判断は必ず外側で行う。

## Minimum runnable packet
通常dispatch packetの核:
- TaskID / WorkUnitKey / AcquireKey
- ExactMutableResources と DoNotChange
- current input/version/HEAD（該当時）
- USER_END_STATE / REAL_OUTPUT_TARGET
- `RESOURCE_CONSTRAINT_SOURCE / CODEX_RESOURCE_STATE / CODEX_ONLY_REASON / BOUNDED_INVOCATION / LOWER_CONSUMPTION_EQUIVALENT / RECURRING_AUTHORIZATION`
- acceptance evidence / test contract
- material unresolved / ResumeCondition
- current `CODEX_WORLD_MODEL_CHECKPOINT` identity/scope
- 今回targetへmaterialなGLOBAL EPISTEMIC MAP surface/cross-domain delta

player-visible UI、game flow、操作、画面遷移、入力系、表示中の機能を変更するTaskでは `GAME_SURFACE_CONTEXT` も追加する。これはDrive全仕様の複製ではなく、今回のuse-siteに必要なJIT契約だけを含む:
- current canon / evidence pointer と、そのcurrent性を判断した根拠
- surface / state / player route と current consumer/use-site
- その場面で成立必須の機能・player action
- required controls / buttons / focus target。名称・数・配置をcurrent資料で確認できない時は発明せず `UNKNOWN/BLOCKED_HEAD`
- entry / back / cancel / failure return / selection restore のうち今回materialなもの
- touch / gamepad / keyboard、safe-area、reduced-motion、low-perf等のうち今回materialな入力・accessibility制約
- temporary / debug / playtest controlを正式player UIへ混ぜない等、対象scopeの禁止事項

非player-visible・非UI Taskへ無関係なbutton inventoryを強制しない。stable evidence pointer は必要なものだけ付ける。01 template、02 template、`CODEX_LIVE_EVENT`、local mirror は transport/evidence source であり、すべてを毎回通る固定hopではない。

## Mutation and continuation gate
project state mutation直前に、repo側で実際に消費される current execution input、Drive current Task / AcquireKey / ExactMutableResources / acceptance、`CODEX_WORLD_MODEL_CHECKPOINT` のscope validityを照合する。今回targetにmaterialな新surface、cross-domain edge、unsupported claimが出たらGLOBAL EPISTEMIC MAPへdelta追加し、必要なら既存 `BLOCKED_HEAD` へ返す。

さらに追加worker、追加cycle、recurring continuationの直前には finite-resource dispatch context を再確認する。`CODEX_RESOURCE_STATE=UNKNOWN` のまま unattended multi-worker/recurring escalationを自動許可しない。現在のbounded invocationを使い切ったら、同一理由で無期限に延長せず外側のrouter/HEADへ戻す。

`GAME_SURFACE_CONTEXT` が必要なTaskでは、対象surface/state/player route・required action/control・current pointerも照合する。source/mirror不一致、stale、owner conflict、identity不明、player-visible契約不明、knowledge basis不明などmaterialな矛盾があれば推測補完しない。

## Return / adoption
返却の核は current input/version、実変更diff/artifact、実行testとstatus、failure/unresolved、evidence pointer、rollback または ResumeCondition。GLOBAL EPISTEMIC MAPへ新規surface/unknown/counterexampleが増えた場合は、そのdeltaも同じ既存evidence pathへ返す。

有限resourceを使ったWorkUnitでは、観測可能な範囲で `actual invocation/worker/cycle count` と実成果を返し、次のrouteが推測ではなく実測から縮約できるようにする。取得不能なtoken/credit残量を捏造しない。未実行・skipped・pending・unknownをPASSにしない。

`GAME_SURFACE_CONTEXT` を受けたTaskは `GAME_SURFACE_RETURN` も返す:
- actual surface / state / player route で何が変わったか、または NO_CHANGE
- actual controls/actionsの追加・削除・移動・意味変更の有無
- current Drive契約とactual code/runtimeの mismatch / missing / ambiguity
- 実行した player-route/runtime/DOM/screenshot/input test と status
- HEAD判断が必要な unresolved / ResumeCondition

Codexは検出したspec gapやactual mismatchを自己判断でDrive canonical specへ昇格・書換えしない。同じTask/AcquireKeyのreturn evidenceとしてHEADへ返す。HEADは返却後にcurrent authorityとactual outputをreadbackして採否し、採用する事実・証拠・状態だけを既存current Drive sinkへ反映する。commit / PR / merge / green CI / Codex自己申告だけをproduct/game完成証拠にしない。

## Current AI boundary
Roblox専用工程のAI対象可否は、その時点のCURRENT user rulingを正とし、このhandoffへdated file ID・size・SHA・Studio手順・old resume pointを固定しない。Browser / Unity / repository 等のlaneも current Task から解決する。

## Staleness
このファイルは現在routingだけを保持する。意味が変われば旧current本文を置換し、dated案件・旧AcquireKey・旧hash・旧resumeをactive-looking inline historyとして蓄積しない。
