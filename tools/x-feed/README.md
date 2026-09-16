# X Free Bridge

公開X投稿を、X公式APIの有料契約やAPIキーなしで機械可読JSONへ落とす最小ブリッジです。

## 目的

`x.com/<user>/status/<id>` の公開投稿URLを FxTwitter の公開JSON APIへ変換し、`data/x_feed.json` に保存します。保存後はGitHub接続済みのChatGPTから同じデータを直接読めます。

## 使い方

1. `tools/x-feed/targets.txt` に公開X投稿URLを1行1件で追加。
2. リポジトリルートから実行。

```bash
python tools/x-feed/fetch_x_feed.py
```

単発ならファイル編集なしでも実行できます。

```bash
python tools/x-feed/fetch_x_feed.py --target "https://x.com/example/status/1234567890"
```

結果は `data/x_feed.json` に保存されます。重複URLは1回だけ取得します。

## テスト

```bash
python tools/x-feed/test_fetch_x_feed.py
```

ネットワーク不要のURL解析テストだけなので、外部サービスが落ちていても実行できます。

## 制限

- 対象は公開されているstatus URLです。非公開・削除済み・アクセス制限された投稿を回避して読む仕組みではありません。
- FxTwitterは第三者サービスなので、停止やAPI仕様変更で取得できなくなる可能性があります。
- Xのパスワード、Cookie、Bearer Token、APIキーは保存しません。
- アカウント全体のタイムライン探索はこの最小版の対象外です。投稿URLが分かっているものを確実にJSON化する層として使います。

## 出力

`data/x_feed.json` は取得元URL、Xのcanonical URL、FxTwitter API URL、返却された投稿オブジェクトを保持します。取得失敗は `errors` に記録し、成功分を捨てません。
