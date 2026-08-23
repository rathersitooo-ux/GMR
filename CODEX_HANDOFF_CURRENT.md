# GAMEROAD Codex Handoff CURRENT

## Role
ChatGPT HEAD と Codex executor の dynamic restart transport。ゲーム仕様正本・履歴正本・単独mutation許可ではない。current state はこのファイルの古い値ではなく、実行時の Drive CURRENT / current Task / actual から解決する。

## JIT routing
Codex dispatch 前に HEAD が必ず解決する核は、Drive `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT`、現役運用規約、対象Taskの current owner/lease、直接対象actual、consumer/use-site、変更境界、acceptance、material unresolved / ResumeCondition である。

親・隣接正本、全作業接続地図、旧Reason Pack、外部根拠、履歴、failure matrix、size/SHA 等は、今回のidentity・risk・acceptance・矛盾を material に変える時だけ追加取得する。同じ情報を複数sourceから固定順に再取得しない。

Codexへ渡すのは repository / filesystem / terminal / build / editor / Unity 等の Codex 固有 `EXECUTION_RESIDUAL` だけ。`AI_PREWORK_COMPLETE` は「今回のexecution residualを定義するために必要なHEAD側material unresolvedが閉じた」を意味し、全関連資料・全設計・全検査条件の事前完成を意味しない。

## Minimum runnable packet
実dispatchするpacketの核:
- TaskID / WorkUnitKey / AcquireKey
- ExactMutableResources と DoNotChange
- current input/version/HEAD（該当時）
- USER_END_STATE / REAL_OUTPUT_TARGET
- CODEX_ONLY_REASON
- acceptance evidence / test contract
- material unresolved / ResumeCondition

player-visible UI、game flow、操作、画面遷移、入力系、表示中の機能を変更するTaskでは、上記に `GAME_SURFACE_CONTEXT` を追加する。これはDrive全仕様の複製ではなく、今回のuse-siteに必要なJIT契約だけを含む:
- current canon / evidence pointer と、そのcurrent性を判断した根拠
- surface / state / player route と current consumer/use-site
- その場面で成立必須の機能・player action
- required controls / buttons / focus target。名称・数・配置をcurrent資料で確認できない時は発明せず `UNKNOWN/BLOCKED_HEAD` とする
- entry / back / cancel / failure return / selection restore のうち今回materialなもの
- touch / gamepad / keyboard、safe-area、reduced-motion、low-perf等のうち今回materialな入力・accessibility制約
- temporary / debug / playtest controlを正式player UIへ混ぜない等、対象scopeの禁止事項

非player-visible・非UI Taskへ無関係なbutton inventoryを強制しない。stable evidence pointer は必要なものだけ付ける。01 template、02 template、`CODEX_LIVE_EVENT`、local mirror は transport/evidence source であり、すべてを毎回通る固定hopではない。

## Mutation gate
project state mutation 直前に、repo側で実際に消費される current execution input と Drive の current Task / AcquireKey / ExactMutableResources / acceptance を照合する。`GAME_SURFACE_CONTEXT` が必要なTaskでは、対象surface/state/player route・required action/control・current pointerも照合する。source/mirror不一致、stale、owner conflict、identity不明、player-visible契約不明など material な矛盾があれば推測補完せず既存 `BLOCKED_HEAD` へ返す。

## Return / adoption
返却の核は current input/version、実変更diff/artifact、実行testとstatus、failure/unresolved、evidence pointer、rollback または ResumeCondition。未実行・skipped・pending・unknownをPASSにしない。root cause、恒久対策、全回帰、全size/hash、全screenshotは実failureまたはTask acceptance/riskが要求する時だけ追加する。

`GAME_SURFACE_CONTEXT` を受けたTaskは `GAME_SURFACE_RETURN` も返す:
- actual surface / state / player route で何が変わったか、または NO_CHANGE
- actual controls/actionsの追加・削除・移動・意味変更の有無
- current Drive契約とactual code/runtimeの mismatch / missing / ambiguity
- 実行した player-route/runtime/DOM/screenshot/input test と status。未実行証拠を実行済みにしない
- HEAD判断が必要な unresolved / ResumeCondition

Codexは検出したspec gapやactual mismatchを自己判断でDrive canonical specへ昇格・書換えしない。同じTask/AcquireKeyのreturn evidenceとしてHEADへ返す。HEADは返却後にcurrent authorityとactual outputをreadbackして採否し、採用する事実・証拠・状態だけを既存のcurrent Drive sinkへ反映してreadbackする。commit / PR / merge / green CI / Codex自己申告だけをproduct/game完成証拠にしない。

## Current AI boundary
Roblox専用工程のAI対象可否は、その時点のCURRENT user rulingを正とし、このhandoffへdated file ID・size・SHA・Studio手順・old resume pointを固定しない。Browser / Unity / repository 等のlaneも current Task から解決する。

## Staleness
このファイルは現在routingだけを保持する。意味が変われば旧current本文を置換し、dated案件・旧AcquireKey・旧hash・旧resumeをactive-looking inline historyとして蓄積しない。
