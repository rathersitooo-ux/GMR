# 公開X投稿ブリッジ

X公式APIの有料契約やAPIキーを使わず、**既知の公開X投稿URL**を機械可読JSONへ保存するための最小ブリッジです。

`x.com/<user>/status/<id>` などの公開status URLを FxTwitter の公開JSON APIへ変換し、`data/x_feed.json` に保存します。保存後はGitHub上の同ファイルを通常のリポジトリ資料として参照できます。

## 使い方

`data/x-feed-targets.txt` に公開X投稿URLを1行1件で追加し、リポジトリルートから実行します。

```bash
node tools/x-feed.mjs
```

単発取得は対象一覧を編集せずに実行できます。

```bash
node tools/x-feed.mjs --target "https://x.com/example/status/1234567890"
```

出力先を変える場合:

```bash
node tools/x-feed.mjs --output ./tmp/x_feed.json
```

同じURLが複数回指定された場合は最初の1回だけ取得します。取得できた投稿は保持し、失敗した対象は `errors` に記録します。

## テスト

```bash
node --test tests/x-feed.test.mjs
```

テストはURL解析、重複排除、provider URL正規化、成功/失敗の集約をスタブで確認するため、外部ネットワークを必要としません。

## 安全境界

- 対象は、利用者側ですでにURLが分かっている**公開status URL**だけです。
- Xのパスワード、Cookie、Bearer Token、APIキー等は要求・保存しません。
- 非公開、削除済み、アクセス制限された投稿を回避して読む機能ではありません。
- アカウント全体のタイムライン探索や非公開データ探索は対象外です。
- FxTwitterは第三者サービスです。停止・レート制限・仕様変更時は取得失敗として扱い、別経路へ黙ってフォールバックしません。
- Required Gate自体は変更しません。この実装は既存の `tools/*.mjs` + `tests/*.test.mjs` の通常Node検証レーンを利用します。

## 出力形式

`data/x_feed.json` のトップレベルは以下です。

- `version`: 出力形式バージョン。
- `updated_at_utc`: 実取得を行った時刻。初期ファイルでは `null`。
- `provider`: 現在は `FxTwitter`。
- `items`: 取得成功した投稿。
- `errors`: 取得失敗した対象と理由。

各 `items` 要素は、入力URL (`requested_url`)、Xのcanonical URL (`canonical_url`)、利用したprovider URL (`provider_url`)、providerが返した投稿オブジェクト (`tweet`) を保持します。
