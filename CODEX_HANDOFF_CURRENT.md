# GAMEROAD Codex Handoff CURRENT

## Role
このファイルは ChatGPT HEAD と Codex executor の dynamic Task transport である。ゲーム仕様、Task状態、owner/lease、branch/HEAD、acceptance の第二正本ではない。

実行時の正は Drive `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT` と repo `AGENTS.md`。このファイルの記述が両者と衝突した場合は CURRENT / `AGENTS.md` を優先する。

## Start
最初の material mutation 前に、今回scopeを安全に実行できる最小限だけ fresh 取得する。

- Drive CURRENT
- 現役運用規約
- current Task / WorkUnit / owner / lease / ExactMutableResources / DoNotChange
- current repo / branch / HEAD / direct actual
- actual consumer / use-site
- USER_END_STATE / REAL_OUTPUT_TARGET
- acceptance / test
- material blocker / ResumeCondition

今回mutationを変えない全域情報を埋めるために着工を止めない。全体網羅型の事前モデル化、全surface棚卸し、全未知埋め、別の校正protocolを通常WorkUnitの開始条件にしない。

UNKNOWNはUNKNOWNのまま保持する。irreversible / shared-foundation / rights / privacy / security / public-blast-radius など高失敗コストのUNKNOWNだけ、その影響範囲を fail-close して既存のHEAD解決経路へ返す。

## Execution
current actual と acceptance から、完成距離を最も縮める non-conflicting WorkUnit を一つ実行する。

新規constructionは `REUSE_AS_IS -> ADAPT -> COMPOSE -> BUILD` の順。current consumer が要求していない将来用module、第二router、第二state machine、第二registry、汎用frameworkを先回りして作らない。

同じ mutable target を複数writerへ割り当てない。owner/leaseが衝突する場合は別mutable targetの独立作業だけを行い、worker数を埋めるために仕事を作らない。

Codexだけで解けない material gap は利用者へ技術relayを求めず、既存HEAD解決経路へ返す。別handoff、別Task系統、第二正本は作らない。

## Player-visible work
UI、game flow、画面遷移、入力、表示中機能を変更する場合だけ、今回use-siteに必要な `GAME_SURFACE_CONTEXT` をJITで確認する。

- surface / state / player route
- current consumer / use-site
- その場面で必須のplayer action
- materialなcontrols / focus target
- entry / back / cancel / failure return / selection restore の必要分
- materialなtouch / gamepad / keyboard / safe-area / reduced-motion / low-perf制約
- debug / playtest UIを正式player UIへ混ぜない等の禁止事項

名称、数、配置、意味をcurrent資料で確認できないものは発明しない。無関係な全画面button inventoryは作らない。

## Finite resources
Codex session / worker / cycle が有限・従量になり得る場合は、current user constraint と実際の必要量だけを扱う。取得不能な残量を捏造しない。

追加worker、追加cycle、unattended継続は自動拡張しない。同等acceptanceへ届く低消費経路がある場合はそちらを優先する。

この節を全Taskの定型レポート項目へ拡張しない。今回の実行判断をmaterialに変える時だけ記録する。

## Mutation gate
write / update / delete / commit / push / merge / deploy の直前に fresh 照合する。

- repo / branch / HEAD / target file or blob
- TaskID / WorkUnitKey / AcquireKey
- owner / lease / ExactMutableResources / DoNotChange
- actual consumer / use-site
- acceptance / test

materialな矛盾があれば推測補完しない。mutation結果が timeout / disconnect 等でUNKNOWNなら盲目的に再送せず fresh-read して適用状態を確定してから retry / repair / rollback を選ぶ。

## Test and completion
failed / pending / skipped / unrun / unknown をPASSにしない。commit / PR / merge / green CIだけをruntime/product完成証拠にしない。

player-visible変更は actual player route / use-site で確認する。必要ないtest、surface、artifactを帳尻合わせで増やさない。

## Return
返却の核は次だけでよい。

- current input / version
- actual diff / artifact
- 実行したtestとstatus
- failure / unresolved
- evidence pointer
- rollback または ResumeCondition
- 次の一手

player-visible Taskなら、actual routeで何が変わったか、controls/actionsの変更、current契約とのmismatch、実行したruntime/DOM/input/screenshot testを必要分だけ追加する。

spec gapやactual mismatchをCodex判断でDrive canonicalへ昇格しない。同じTaskのreturn evidenceとしてHEADへ返す。

## Staleness
Browser / Unity / Roblox / Human / capability境界、可変Task値、branch/HEAD、ID、SHAをこのファイルへ固定しない。実行時のCURRENTを正とする。

このtransportの意味が変わった時は追記overrideを重ねず、本文を直接縮約・置換する。
