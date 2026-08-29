# GAMEROAD Codex 固定入口

## 役割
この `AGENTS.md` は Codex を GAMEROAD の現在正本へ接続するための短い起動門である。ゲーム仕様、Task状態、owner/lease、可変ID、branch/HEAD、個別acceptanceの第二正本ではない。

過去会話、model memory、古い候補、local mirror、snippetだけで current state を確定しない。必要な事実は実行時の Drive CURRENT / current Task / actual から解決する。

## 1. JIT bootstrap
最初の material mutation 前に、今回scopeを安全に実行できる最小限だけfresh取得する。

1. Drive `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT`。
2. 現役運用規約。
3. 対象 Task / WorkUnit の current owner / lease / ExactMutableResources / DoNotChange。
4. 直接対象 actual と、その consumer / use-site。
5. USER_END_STATE / REAL_OUTPUT_TARGET と acceptance / test。
6. material blocker / ResumeCondition。

親・隣接正本、全作業接続地図、履歴、外部根拠、failure matrix、size/SHA等は、今回の identity・risk・acceptance・矛盾を material に変える時だけ追加取得する。同じ情報を固定順に全件再取得しない。

## 2. やらないこと
fresh session を理由に whole-game を再帰分解した巨大 knowledge map を先に作らない。全surface列挙、全分野の未知埋め、held-out oracle round-trip、`CODEX_WORLD_MODEL_CHECKPOINT`、no-change round-tripを通常WorkUnitの開始条件にしない。

UNKNOWNは隠さない。ただし今回mutationに関係しない未知を埋めるために作業を止めない。irreversible / shared-foundation / rights/privacy/security / public-blast-radius等の高失敗コストUNKNOWNは、その影響範囲だけ止めて既存 `CODEX_LIVE_EVENT Stage=BLOCKED_HEAD` へ返す。

## 3. 実行単位
current actual と acceptance から、完成距離を最も縮める non-conflicting WorkUnit を一つ選ぶ。owner/leaseをfresh確認し、必要なら NEW AcquireKey を取得してから実行する。同じ mutable target を複数writerへ割り当てない。

新規constructionは既存物を先に確認し、`REUSE_AS_IS -> ADAPT -> COMPOSE -> BUILD` の順で残差を縮める。将来用の部品・抽象層・汎用基盤を、current consumerが要求していないのに先回り制作しない。

## 4. HEADとの連携
Codexだけで解けない material gap は利用者へ技術relayを求めず、既存 `BLOCKED_HEAD` へ返す。HEADは必要なcurrent evidenceだけをJIT取得し、matching `HEAD_RESOLUTION_PACKET` を返す。

HEAD待ちでも別mutable targetで非競合・中断安全な独立作業がある場合だけ続行する。別protocol・第二handoff・第二正本を作らない。

Drive `GAMEROAD_CODEX_HANDOFF_CURRENT.md` はTask transportであり、このJIT bootstrapとcurrent authorityを置き換えない。

## 5. mutation直前
write/update/delete/commit/push/merge/deploy等の直前に、少なくとも次をfresh照合する。

- current repo / branch / HEAD / target file or blob
- TaskID / WorkUnitKey / AcquireKey
- owner / lease / ExactMutableResources / DoNotChange
- actual consumer / use-site
- acceptance / test

materialな矛盾があれば推測補完せず、その影響範囲だけ止める。mutation結果がtimeout/disconnect等でUNKNOWNなら盲目的に再送せず、fresh-readして `NOT_APPLIED / APPLIED_AND_VERIFIED / PARTIALLY_APPLIED / UNKNOWN` へ収束してからretry/repair/rollbackを選ぶ。

## 6. testと完成判定
failed / pending / skipped / unrun / unknownをPASSにしない。commit / PR / merge / green CIだけをruntime/product完成証拠にしない。player-visible変更はactual player route / use-siteで確認する。

必要ないtestやsurfaceを帳尻合わせで増やさない。今回のacceptanceにmaterialな検証だけ実行する。

## 7. 返却
返却の核は次だけでよい。

- current input / version
- actual diff / artifact
- 実行したtestとstatus
- failure / unresolved
- evidence pointer
- rollback または ResumeCondition
- 次の一手

今回scope外のknowledge棚卸しを返却必須にしない。spec gapやactual mismatchをCodex判断でDrive canonicalへ昇格せず、同じTaskのreturn evidenceとしてHEADへ返す。

## 8. 並列とstaleness
multi-agentでも安全な独立WorkUnitが実在する時だけ分ける。同一mutable targetは直列化し、worker数を埋めるために仕事を作らない。

Roblox / Browser / Unityその他のAI/Human/capability境界や可変Task値をこのファイルへ固定しない。run時点のDrive CURRENTを正とする。

この入口の意味が変わった時は追記overrideを重ねず本文を直接縮約・置換する。
