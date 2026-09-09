# GAMEROAD CURRENT AutoHook

ChatGPT Web でメッセージを送信する直前に、GAMEROAD の CURRENT 起動トリガーを自動で先頭へ付加する無料の userscript です。

## 目的

- 毎回 CURRENT BOOTLOADER を手で貼り付ける作業をなくす。
- 利用者の入力本文は変更・要約せず、その前に短い起動トリガーだけを付ける。
- 長い CURRENT 本文を userscript 側へ複製しない。Google Drive の CURRENT を毎 turn fresh 取得するよう ChatGPT へ要求する。
- スケジュールタスク、リマインド、定期実行は作らない。

## なぜ全文ではなく短いトリガーなのか

CURRENT 本文を userscript に固定すると、Drive 側が更新された時に stale authority になります。そのため、この userscript が持つのは CURRENT そのものではなく、以下の current authority 入口を fresh に読むための pointer だけです。

- `GAMEROAD_Drive総合目次・記録ルーティング_CURRENT`
  - Drive ID: `14CYoFblBecfUqrnFKfdWayHsi8cnAbsrfFzNxZ0OvkY`
- `GAMEROAD_ChatGPT-Codex-Claude共通入口_CURRENT`
  - Drive ID: `17xKynlDewWeYHK1xsObex70VoR7YPh6Kn06y57HZV_s`

## 対応範囲

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

公式 Android ChatGPT アプリ内部へ userscript を挿入するものではありません。Android では Firefox + Violentmonkey の ChatGPT Web で使う想定です。

## 無料での導入

1. Android に Firefox を入れる。
2. Firefox Add-ons から Violentmonkey を入れる。
3. 次の raw userscript を Firefox で開き、Violentmonkey のインストール画面から追加する。
   - `https://raw.githubusercontent.com/rathersitooo-ux/GMR/main/tools/chatgpt-current-autohook/GAMEROAD_CURRENT_AutoHook.user.js`
4. `chatgpt.com` を開く。

一度 userscript を導入した後は、ChatGPT Web の送信直前に自動で動作します。userscript の `@updateURL` / `@downloadURL` も同じ main raw URL を指します。

## 動作

送信しようとした本文が次のどちらも含まない時だけ、AutoHook が CURRENT 起動トリガーを先頭へ付加します。

- `【GAMEROAD CURRENT AUTOHOOK】`
- `【全会話共通・CURRENT BOOTLOADER】`

そのため、手動で完全版 BOOTLOADER を貼った場合は二重注入しません。

送信経路は以下を捕捉します。

- フォーム submit
- Enter 送信
- 送信ボタンの pointerdown / mousedown / click

AutoHook 自身の再送による二重送信を避ける bypass と pending guard を持ちます。

## 検証

リポジトリ側 static test は最低限、以下を固定します。

- ChatGPT Web の対象 domain
- 2つの CURRENT Drive ID
- AutoHook marker と完全版 BOOTLOADER marker
- submit / Enter / 送信ボタンの3経路
- 二重送信防止の pending/bypass
- raw main の自動更新 URL

最終的な Android 実機の Firefox + Violentmonkey + ChatGPT Web での送信到達は、端末側で userscript を有効化した後に実利用確認が必要です。

## 出典と境界

送信 interception の設計は、公開されている `qvanle/preprompt` の ChatGPT Web submit interception パターンを参考にしつつ、GAMEROAD 用に独立した最小 userscript として実装しています。外部プロジェクトのコードを丸ごと取り込まず、CURRENT pointer 注入だけに責務を限定しています。
