# GAMEROAD コーデックス固定入口

## 2026-08-22 Codex委譲・Drive往復ハードゲート
- この `AGENTS.md` は固定の起動門であり、現在状態そのものではない。GAMEROADでCodexを使うたび、実project stateを変える前に `CODEX_HANDOFF_CURRENT.md` の最上段HEAD packetと、Drive上の `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT` から再解決した現役authority／AcquireKey／ExactMutableResources／受理条件を照合する。
- Driveを読めない、HEAD packetが無い／stale、取得鍵が失効、authorityが矛盾する場合は、推測して書込み・build・save・deployを行わず、既存 `HEAD_BLOCKER_PROTOCOL` の `BLOCKED_HEAD` でHEADへ返す。
- Codexへ渡すのは `CODEX_ONLY_REASON` が具体化できる repository/file-system/terminal/editor/build/Unity 等の実行残差だけ。ChatGPTで可能なCURRENT読込、調査、仕様整理、比較、素材準備、受理試験設計は `AI_PREWORK_COMPLETE` として先に閉じる。Codexの厳しい実行枠を再調査・再整理へ使わない。
- 受渡しと返却は必ず既存Drive経路（01依頼包→Codex実行→02返却包／`CODEX_LIVE_EVENT`→ChatGPT監査）を通す。会話記憶だけの引継ぎは禁止。
- 2026-08-19 R91によりRoblox専用工程はAI作業対象外。本文中の旧Roblox責務・Studio完了条件・旧ID/SHAは履歴としてのみ扱う。

## 役割
- このファイルは実プロジェクト直下へ置く固定の作業地図である。
- ゲーム仕様正本ではない。ドライブの中央地図、取得台帳、全作業表、現役ゲーム実体を優先する。
- 過去会話、古い候補、「最新版」という名前、番号の大きさ、ローカル記憶だけで実装対象を選ばない。

## 毎回最初に読む順番
1. `CODEX_HANDOFF_CURRENT.md`（Drive source: `GAMEROAD_CODEX_HANDOFF_CURRENT.md`）
2. `05_GAMEROAD_理由駆動実装・知見取得門_CURRENT_20260728`
   - ドライブ識別子: `1KlxeBos3EFTTkWX7PdFR-beu_8qpStY0GBCX7YOePgE`
3. `GAMEROAD_全作業取得・空き状況表_CURRENT_20260721`
   - ドライブ識別子: `1QKCll_T9ej6K96fRkRUESCAIYVGbsCYZILGIWMUdm2Y`
4. `GAMEROAD_多チャット作業取得台帳_CURRENT`
   - 可変識別子をここへ固定しない。毎回 `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT` から現役IDを再解決する。
5. `GAMEROAD_全作業接続地図_CURRENT`
   - ドライブ識別子: `1xbJ_pRG50z8C-H-sppl_9iUGol1j8jmaJR10_O8E3ZA`
6. `GAMEROAD_ChatGPT-Codex共通入口_CURRENT`
   - ドライブ識別子: `17xKynlDewWeYHK1xsObex70VoR7YPh6Kn06y57HZV_s`
7. 対象作業の親正本、隣接正本、今回の取得鍵に紐づく01依頼包。

## 双方向連携網
- フォルダー識別子: `1TbN6-tne0aEdd3Vb9nbjBanXk8mlqZL_`
- 00 全体連携網: `1mycFNBhw7r38trqlZEtd5dO3TJCUVlvDEUS0GagGBw0`
- 01 作業依頼包: `16fvXcetBj9rqIEqXda5sitdeQFpJWAgYpmJdYBlbT5o`
- 02 返却報告包: `1TUIVt99DPzSWylUr_kxlz6102ta6dL8tdEKlBHxYgjY`
- 03 調査往復: `1UKO8XFsUVYUADfxkhzrbnB0ZgW4ykWtxxE4kFSHBMlk`
- 04 ユニティー移植入口: `1xYaCmsBeqHsPLnO-eooyKtNJDrjE207Wq3CL9LFnyo4`
- 05 理由駆動実装・知見取得門: `1KlxeBos3EFTTkWX7PdFR-beu_8qpStY0GBCX7YOePgE`

## 理由駆動開始門
次の項目が埋まるまで、原本にも隔離候補にも書き込まない。
- 完成目標と公開版への接続
- 利用者が可能になる行動
- 守る利用者判断
- 防ぐ失敗
- 現役根拠と事実区分
- 採用理由
- 不採用案と理由
- 不足知見
- 答えによって変える物
- 知見取得方法
- 変更対象と変更禁止
- 工程図
- 理由を証明する合格証拠
- 結論を覆す条件

「仕様にあるから」「一般的だから」「便利そうだから」「前の人工知能が作ったから」だけでは開始しない。
不足知見が結論を変え得る場合は実装せず03へ戻す。外部作品の採用例をそのまま本作仕様にしない。

## 作業開始門
- 作業識別子、取得鍵、取得者、排他資源、現役実体の完全名・容量・内容識別値が一致するまで書き込まない。
- 取得鍵不一致、占有中、現役実体未測定の場合は開始しない。
- 引継ぎは同じ取得鍵または正式な再開記録がある場合だけ継続する。
- ドライブを読めない時は推測せず、読めなかった資料と必要な取得方法を返す。

## 実装原則
- 一取得一責務。
- 現役実体から隔離候補を作り、古い候補へ追記しない。
- 変更前後の内容識別値、容量、対象、差分、復元方法を残す。
- 静的検査、コンパイル、制作画面、通信、保存、端末試験を分ける。
- 実行していない検査を合格と書かない。
- 対象CURRENTが要求する実行器・runtime・保存・再読込・試験を実行していない成果を完成扱いしない。Roblox専用工程はR91によりAI作業対象外。
- 仮の画像番号、数値、素材、保存形式、通信口を恒久本体へ足さない。

## 返却前の理由再検査
- 当初守るとした判断を実際に守った証拠
- 防ぐとした失敗を故意に起こした結果
- 実装中に変わった前提
- 新しく判明した不足知見
- 理由が成立しなかった変更
- 隣接正本、素材、別媒体への影響
を02返却包へ記録する。理由を証明できない変更は静的合格でも採用候補にしない。

## 返却
- 02の項目を省略しない。
- 変更、非変更、実行済み、未実行、失敗、復元、次の再開地点を分ける。
- 中央資料の同期と読み戻しが終わるまで占有解放済みと書かない。
