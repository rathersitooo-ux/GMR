# 仮の絵：他のゲームからの輸入カード15枚（DCG_CAND_*）

このフォルダの15枚は、他のカードゲームの実物のカード絵です。
輸入カード15枚（効果だけ実装され、絵が無かった分）に、仮イラストとしてだけ使っています。
**正式な絵ではありません。** 正式カードが完成したら、その番号（artId）の借り物は外します
（受け口は `browser/card-art-registry-core.mjs` の removeArt）。

置き場の記録（移植の時用）：出どころ／形式／元の置き場は下の表の通り。
ファイルは全部このフォルダ（browser/assets/provisional-art/candidate-cards/）に JPG で置いてある。
公開パッケージへは deploy/cloudflare/scripts/build.mjs の登録で
assets/provisional-art/candidate-cards/ へそのままコピーされる（変換なし）。

| ファイル | カード | artId | 形 | 出どころ |
|---|---|---|---|---|
| dcg-cand-onimaru.jpg | 鬼丸「覇」 (DCG_CAND_ONIMARU) | CANDART_ONIMARU | card | Duel Masters Wiki (Fandom) ページ画像 Dm26ex3-1 |
| dcg-cand-dogiragon.jpg | ドギラゴンバスター (DCG_CAND_DOGIRAGON) | CANDART_DOGIRAGON | card | Duel Masters Wiki (Fandom) ページ画像 Dm26ex4（蒼き団長ドギラゴン剣） |
| dcg-cand-inferno-gate.jpg | インフェルノ・ゲート (DCG_CAND_INFERNO_GATE) | CANDART_INFERNO_GATE | card | Duel Masters Wiki (Fandom) ページ画像 Dm19-27 |
| dcg-cand-hogan-blaster.jpg | ホーガン・ブラスター (DCG_CAND_HOGAN_BLASTER) | CANDART_HOGAN_BLASTER | card | Duel Masters Wiki (Fandom) ページ画像 Dm26ex5-dp20 |
| dcg-cand-tensei-program.jpg | 転生プログラム (DCG_CAND_TENSEI_PROGRAM) | CANDART_TENSEI_PROGRAM | card | Duel Masters Wiki (Fandom) Transmogrify（jpname=転生プログラムを原文で確認） |
| dcg-cand-kiriko.jpg | エンペラー・キリコ (DCG_CAND_KIRIKO) | CANDART_KIRIKO | card | Duel Masters Wiki (Fandom) ページ画像 Dmex17 |
| dcg-cand-bolbalzak.jpg | 無双竜機ボルバルザーク (DCG_CAND_BOLBALZAK) | CANDART_BOLBALZAK | card | デュエル・マスターズ公式カード検索 cardimage dm10-009（DM10 9/110） |
| dcg-cand-cyber-brain.jpg | サイバー・ブレイン (DCG_CAND_CYBER_BRAIN) | CANDART_CYBER_BRAIN | card | Duel Masters Wiki (Fandom) ページ画像 Dm26rp1-t5 |
| dcg-cand-perfect-galaxy.jpg | 不滅の精霊パーフェクト・ギャラクシー (DCG_CAND_PERFECT_GALAXY) | CANDART_PERFECT_GALAXY | card | Duel Masters Wiki (Fandom) ページ画像 Dmbd18-se6 |
| dcg-cand-harpie.jpg | ハーピィの羽根帚 (DCG_CAND_HARPIE) | CANDART_HARPIE | fullart | YGOPRODeck API card_images image_url_cropped (id 18144507) |
| dcg-cand-ash-blossom.jpg | 灰流うらら (DCG_CAND_ASH_BLOSSOM) | CANDART_ASH_BLOSSOM | fullart | YGOPRODeck API card_images image_url_cropped (id 14558127) |
| dcg-cand-maxx-c.jpg | 増殖するG (DCG_CAND_MAXX_C) | CANDART_MAXX_C | fullart | YGOPRODeck API card_images image_url_cropped (id 23434538) |
| dcg-cand-black-lotus.jpg | ブラック・ロータス (DCG_CAND_BLACK_LOTUS) | CANDART_BLACK_LOTUS | fullart | Scryfall API image_uris.art_crop (Vintage Masters) |
| dcg-cand-sol-ring.jpg | ソル・リング (DCG_CAND_SOL_RING) | CANDART_SOL_RING | fullart | Scryfall API image_uris.art_crop |
| dcg-cand-lightning.jpg | 稲妻 (DCG_CAND_LIGHTNING) | CANDART_LIGHTNING | fullart | Scryfall API image_uris.art_crop (Lightning Bolt) |

取得日：2026-11-15。15枚とも実物を開いてカード名と絵が合っていることを目で確認済み。
Fandom経由の8枚は取得時に WebP で届いたため、その場で JPG へ変換した（絵の中身は無変更）。
