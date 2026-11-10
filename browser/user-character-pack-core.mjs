// 自分のキャラの読み込みの核（2026-11-10、第1弾の未回答20の第一版）。
//
// 決まっている土台（2026-11-10）：
// - 第一版は端末内だけの読み込み（サーバーなし・自分にだけ見える）。
// - キャラパック方式：1人1ファイル。本体はカタログ（1人1行）で持ち、
//   中身はパック側に置く。公式のキャラと利用者のキャラで同じ形式。
// - 管理の区画はカスタマイズ側。読み込み後は一覧に並んで、相棒や自分の
//   割り当てができる。共有は別段階（サーバーと確認が要る）。
//
// この核は「パックの形の検査と、カタログの管理」だけを持つ。
// ファイルの読み書きと画面は別段。

const PACK_KIND = 'gameroad-character-pack';
const PACK_VERSION = 1;

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }

// パック（JSONの文字列）を受けて、検査済みの形にして返す。
// 問題があれば errors に全部集めて返す（1つずつ直させる形にしない）。
export function parseCharacterPack(jsonText) {
  let raw;
  try { raw = JSON.parse(jsonText); } catch { return { ok: false, errors: ['JSONとして読めない'] }; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['パックは1つのオブジェクトで書く'] };
  const errors = [];
  if (raw.kind !== PACK_KIND) errors.push(`kind は ${PACK_KIND} にする`);
  if (raw.version !== PACK_VERSION) errors.push(`version は ${PACK_VERSION} にする`);
  if (!isNonEmptyString(raw.id)) errors.push('id（識別子）が要る');
  if (!isNonEmptyString(raw.name)) errors.push('name（名前）が要る');
  const images = Array.isArray(raw.images) ? raw.images.filter(isNonEmptyString) : [];
  if (images.length === 0) errors.push('images（見た目の画像の名前）が1つ以上要る');
  const lines = {};
  if (raw.lines && typeof raw.lines === 'object' && !Array.isArray(raw.lines)) {
    for (const [scene, texts] of Object.entries(raw.lines)) {
      if (Array.isArray(texts)) lines[scene] = texts.filter(isNonEmptyString);
    }
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    pack: {
      id: raw.id.trim(),
      name: raw.name.trim(),
      images,
      lines,
      note: isNonEmptyString(raw.note) ? raw.note.trim() : '',
      source: 'user', // 利用者が読み込んだ物、の印
    },
  };
}

// カタログ：1人1行（識別子と名前と出どころだけ）。中身はパック側。
export function createCharacterCatalog() {
  return { entries: [] }; // { id, name, source }
}

export function catalogAdd(catalog, pack) {
  if (catalog.entries.some((e) => e.id === pack.id)) {
    return { ok: false, error: `同じ識別子が既にある: ${pack.id}` };
  }
  const entry = { id: pack.id, name: pack.name, source: pack.source };
  catalog.entries.push(entry);
  return { ok: true, entry };
}

export function catalogRemove(catalog, id) {
  const before = catalog.entries.length;
  catalog.entries = catalog.entries.filter((e) => e.id !== id);
  return catalog.entries.length !== before;
}

export function catalogList(catalog) {
  return [...catalog.entries];
}
