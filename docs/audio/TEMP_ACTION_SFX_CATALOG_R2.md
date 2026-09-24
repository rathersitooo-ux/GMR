# 仮SFX割り当て一覧（R2）

共通画面は少数のUI音を使い回し、Battleはカード・対象・アクション・ターン用の音を分ける。音量は既存SFX設定を使い、画面遷移の正式音は現在の再生経路を維持する。

## 共通画面

Home、Cards、Characters、Setup、Missions、Profile、Shop、Gacha、Records、Settingsなど、共通ナビゲーションを使う画面に適用する。

| 操作 | 音の分類 | 音源ファイル | 音量係数 | 再生条件 |
| --- | --- | --- | ---: | --- |
| 通常ボタン・一般アクション | `ui_button` | `click_001.ogg` | 0.42 | 有効な汎用コントロールを押す |
| 決定・購入・保存・開始・受取・送信 | `ui_confirm` | `confirmation_001.ogg` | 0.52 | 決定系コントロールまたはフォーム送信 |
| カード・キャラ・アイテム・プレイヤー選択 | `ui_select` | `select_001.ogg` | 0.44 | 選択対象を押す |
| タブ切替 | `ui_tab` | `switch_001.ogg` | 0.38 | タブを押す |
| トグルをON | `ui_toggle_on` | `toggle_001.ogg` | 0.42 | チェック・ラジオ・スイッチがONになる |
| トグルをOFF | `ui_toggle_off` | `toggle_002.ogg` | 0.40 | チェック・ラジオ・スイッチがOFFになる |
| パネル・メニュー・選択リストを開く | `ui_open` | `open_001.ogg` | 0.38 | 詳細・メニュー操作または選択リストを開く |
| 閉じる・取消・戻る・Escape | `ui_close` | `close_001.ogg` | 0.38 | 閉じる／戻る操作またはEscape |
| スライダー操作 | `ui_slider` | `tick_001.ogg` | 0.30 | range入力。連続再生は間引く |
| テキスト欄にフォーカス | 無音 | — | — | 入力中やキーボード移動では鳴らさない |
| 無効・拒否された操作 | `ui_invalid` | `error_001.ogg` | 0.48 | 無効なコントロールまたは拒否された遷移 |
| 操作対象のない画面部分をタップ | `ui_empty_tap` | `click_005.ogg` | 0.18 | コントロールや補助表示以外の画面面を短くタップ |
| 成功した画面遷移 | 既存の正式音 | `click_002.ogg` | 既存設定 | 既存の遷移音を一度だけ再生。汎用音は重ねない |

## Battle画面

| 操作 | 音の分類 | 音源ファイル | 音量係数 | 再生条件 |
| --- | --- | --- | ---: | --- |
| 手札カード選択 | `battle_card_select` | `bookFlip1.ogg` | 0.48 | Battleの手札カードを押す |
| プレイヤー・到達可能対象の選択 | `battle_target` | `metalClick.ogg` | 0.40 | Battleトークン・対象・選択可能な盤面ノードを押す |
| アクション確定 | `battle_action` | `sword.1.ogg` | 0.34 | 決定系Battle操作、または手札カードを対象へドラッグして確定 |
| パス・ターン終了 | `battle_turn` | `bookClose.ogg` | 0.48 | パス／ターン終了を押す |
| Battleのその他ボタン | `battle_button` | `click_003.ogg` | 0.30 | 上記以外の有効なBattleコントロール |
| 操作対象のないBattle部分をタップ | `battle_empty_tap` | `click_005.ogg` | 0.14 | コントロールや補助表示以外の盤面を短くタップ |
| 閉じる・取消・戻る | `ui_close` | `close_001.ogg` | 0.38 | 共通の閉じる音を使う |

## 再生と音源

- 仮SFXの音量係数に現在の `#sfxVolume` を掛ける。`#sfxMute` 中は鳴らさない。利用者の操作中だけ再生し、ブラウザー側で再生できない場合も操作を止めない。
- `click_001`、`confirmation_001`、`select_001`、`switch_001`、トグル2種、`open_001`、`close_001`、`tick_001`、`click_003`、`error_001`、`click_005` はKenney Interface Soundsの素材。
- Battleカード・盤面にはKenney RPG Audioの `bookFlip1`、`metalClick`、`bookClose` を割り当てる。Battleアクションには同梱の `drawKnife1.ogg` を `sword.1.ogg` として割り当てる。
- 提供されたThe Spriters Resource「The Sacred Stones」の音一覧はBattle操作カテゴリの参考にした。今回の再生ファイルは上記音源パックから選んだ。
