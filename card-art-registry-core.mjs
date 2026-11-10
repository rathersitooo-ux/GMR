// カードの絵の置き場と対応（ローカルスキンの土台）
// カードデータには絵の番号（artId）だけを持ち、実ファイルは仮イラスト専用の置き場に分ける。
// 表示は番号から引く関数を通す。正式カードが完成したら、その番号の借り物は外せる。
// 絵の形は2種： 'fullart' = 元のイラストそのまま（能力テキストが混ざらないので優先）
//               'card'    = カード画像そのまま（フルアートが無い時の代わり）

export function createArtRegistry() {
  return { entries: new Map() };
}

// entry: { artId, file, form: 'fullart'|'card', cardName, source }
export function registerArt(registry, entry) {
  if (!entry?.artId || !entry?.file) return false;
  if (entry.form !== 'fullart' && entry.form !== 'card') return false;
  registry.entries.set(entry.artId, { ...entry });
  return true;
}

// カード（artIdを持つ）から絵を引く。無ければ null（呼び出し側が仮表示にする）
export function artForCard(registry, card) {
  if (!card?.artId) return null;
  return registry.entries.get(card.artId) || null;
}

// 形ごとの一覧（フルアートで拾い直せる物の洗い出し等に使う）
export function listArtByForm(registry, form) {
  return [...registry.entries.values()].filter((e) => e.form === form);
}

// 借り物を外す（正式カードが完成した枠の分）
export function removeArt(registry, artId) {
  return registry.entries.delete(artId);
}
