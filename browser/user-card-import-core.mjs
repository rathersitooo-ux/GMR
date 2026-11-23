// 単位4：作ったカードの読み込み口（中身だけの部品。画面の配線は GAMEROAD.html 側）
// 決めは正本（鎖-無い部分の実装-20261122.md）の単位2の固定1〜8が正。
// 形式：{format:'gameroad-user-cards', version:1, cards:[...]}
// 1枚の必須10欄：id, display_name, suit, rank, power, ability_type, ability, effect_type, ability_cost, rules_text
// 任意：artId（絵の番号。無ければ仮表示）, artDataUrl（絵の実物を埋め込む。data:image/...）, effect_amount（整数）
// 読み込み側が付ける固定値：runtime_status 'playable', authority 'user_created',
// browser_status 'user_created', is_user_card true（入力に書いてあっても使わない）。
// 効果の一覧はここでは受け取るだけ。呼び出し側が解決処理その物から抜き出す（手書きの写しを持たない）。
// 起動時の復元は GAMEROAD.html 側で同期の軽い形でやる（部品の読み込みを待つと、保存済みデッキの
// 復元より遅れて、作ったカード入りのデッキが消えるため）。軽い形の門はこの部品の検査と
// 同じ境界（番号の形・必須10欄・力と費用の範囲・効果の文字）で、単位4の確かめで両方通す。

export const USER_CARD_STORAGE_KEY = 'gameroad.browser.v10.usercards.1';
export const USER_CARD_PACKAGE_FORMAT = 'gameroad-user-cards';
export const USER_CARD_PACKAGE_VERSION = 1;
export const USER_CARD_ID_PREFIX = 'USR_';
export const USER_CARD_ID_PATTERN = /^USR_[A-Za-z0-9_]+$/;
// 絵の埋め込みの上限：実測（2026-11-22、端末保存は4MBまで入って5MBで弾かれた）から決めた。
// 1枚の絵は実物300KBまで（data URL の文字では約410,000字）。超えた絵は落として札だけ入れる。
export const USER_CARD_MAX_ART_BYTES = 300 * 1024;
export const USER_CARD_MAX_ART_DATA_URL_CHARS = 410000;
// 保存全体の上限：端末保存の残り（本編の続きデータ・デッキ枠）の分を空けて3MBまで。
export const USER_CARD_MAX_STORED_BYTES = 3 * 1024 * 1024;
export const USER_CARD_MAX_CARDS_PER_FILE = 100;

export const USER_CARD_REQUIRED_FIELDS = [
  'id', 'display_name', 'suit', 'rank', 'power',
  'ability_type', 'ability', 'effect_type', 'ability_cost', 'rules_text',
];

const KNOWN_OPTIONAL_FIELDS = ['artId', 'artDataUrl', 'effect_amount'];
const KNOWN_FIELDS = new Set([...USER_CARD_REQUIRED_FIELDS, ...KNOWN_OPTIONAL_FIELDS]);

export function byteLength(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
}

// 解決処理その物のソースから、受けられる効果の種類を抜き出す。
// GAMEROAD.html 側の読み込み時チェックと同じ抜き方（case'...'＋'none'）。
export function extractEffectTypes(resolverSource) {
  const out = new Set(['none']);
  if (typeof resolverSource !== 'string') return out;
  for (const m of resolverSource.matchAll(/case'([A-Za-z0-9_]+)'/g)) out.add(m[1]);
  return out;
}

function isNonEmptyString(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

// 1枚の検査。ctx：{ baseIds:Set, storedIds:Set, fileIds:Set, baseNames:Set, effectTypes:Set }
// 返す：{ ok, card（読み込み側の固定値つきの保存形。だめな時はなし）, errors:[], warnings:[] }
export function validateUserCard(raw, ctx) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['カードの形が壊れています'], warnings };
  }
  const id = raw.id;
  if (typeof id !== 'string' || !USER_CARD_ID_PATTERN.test(id)) {
    return { ok: false, errors: [`${String(id ?? '(番号なし)')}：番号は USR_ で始まる英数字と _ だけです`], warnings };
  }
  if (ctx.baseIds?.has(id)) errors.push(`${id}：本体のカードと番号が重なっています`);
  if (ctx.storedIds?.has(id)) errors.push(`${id}：既に読み込んだカードと番号が重なっています`);
  if (ctx.fileIds?.has(id)) errors.push(`${id}：同じファイルの中で番号が重なっています`);
  for (const f of USER_CARD_REQUIRED_FIELDS) {
    if (f === 'id') continue;
    if (raw[f] === undefined || raw[f] === null || raw[f] === '') errors.push(`${id}：${f} がありません`);
  }
  if (errors.length) return { ok: false, errors, warnings };
  if (!isNonEmptyString(raw.display_name, 80)) errors.push(`${id}：名前は1〜80文字です`);
  if (ctx.baseNames?.has(String(raw.display_name).trim()) || ctx.storedNames?.has(String(raw.display_name).trim())) {
    errors.push(`${id}：同じ名前のカードが既にあります（デッキには同じ名前は1枚までです）`);
  }
  if (!isNonEmptyString(raw.suit, 8)) errors.push(`${id}：スートは1〜8文字です`);
  if (!isNonEmptyString(raw.rank, 8)) errors.push(`${id}：ランクは1〜8文字です`);
  if (!Number.isInteger(raw.power) || raw.power < 0 || raw.power > 13) errors.push(`${id}：力は0〜13の数字です`);
  if (!isNonEmptyString(raw.ability_type, 40)) errors.push(`${id}：能力の種類は1〜40文字です`);
  if (!isNonEmptyString(raw.ability, 500)) errors.push(`${id}：能力の文は1〜500文字です`);
  if (!isNonEmptyString(raw.rules_text, 1000)) errors.push(`${id}：説明文は1〜1000文字です`);
  if (!Number.isInteger(raw.ability_cost) || raw.ability_cost < 0 || raw.ability_cost > 9) {
    errors.push(`${id}：費用は0〜9の数字です`);
  }
  if (typeof raw.effect_type !== 'string' || !ctx.effectTypes?.has(raw.effect_type)) {
    errors.push(`${id}：効果 ${String(raw.effect_type)} は使えません（新しい効果はこの鎖では作れません）`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  const card = {
    id,
    display_name: String(raw.display_name).trim(),
    suit: String(raw.suit).trim(),
    rank: String(raw.rank).trim(),
    power: raw.power,
    ability_type: String(raw.ability_type).trim(),
    ability: String(raw.ability).trim(),
    effect_type: raw.effect_type,
    ability_cost: raw.ability_cost,
    rules_text: String(raw.rules_text).trim(),
    // 読み込み側が付ける固定値（入力に書いてあっても使わない）
    runtime_status: 'playable',
    authority: 'user_created',
    browser_status: 'user_created',
    is_user_card: true,
  };
  if (raw.effect_amount !== undefined) {
    if (!Number.isInteger(raw.effect_amount) || raw.effect_amount < 1 || raw.effect_amount > 99) {
      errors.push(`${id}：effect_amount は1〜99の数字です`);
      return { ok: false, errors, warnings };
    }
    card.effect_amount = raw.effect_amount;
  }
  if (raw.artId !== undefined) {
    if (typeof raw.artId !== 'string' || !raw.artId.trim() || raw.artId.length > 80) {
      warnings.push(`${id}：絵の番号が読めないので絵なしで入れます`);
    } else {
      card.artId = raw.artId.trim();
    }
  }
  if (raw.artDataUrl !== undefined) {
    if (typeof raw.artDataUrl !== 'string' || !raw.artDataUrl.startsWith('data:image/')) {
      warnings.push(`${id}：絵の実物が data:image/ ではないので絵なしで入れます`);
    } else if (raw.artDataUrl.length > USER_CARD_MAX_ART_DATA_URL_CHARS) {
      warnings.push(`${id}：絵が大きすぎるので絵なしで入れます（上限は実物300KBまで）`);
    } else {
      card.artDataUrl = raw.artDataUrl;
    }
  }
  for (const k of Object.keys(raw)) {
    if (!KNOWN_FIELDS.has(k) && !['runtime_status', 'authority', 'browser_status', 'is_user_card'].includes(k)) {
      warnings.push(`${id}：${k} は使わないので落とします`);
    }
  }
  return { ok: true, card, errors, warnings };
}

// ファイル1件の読み込み。ctx は validateUserCard と同じ。
// 返す：{ ok（包みが読めたか）, accepted:[card], rejected:[{index, id, errors}], warnings:[], errors:[]（包み全体の失敗） }
export function parseUserCardPackage(text, ctx) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: ['ファイルの中身が読めません（JSONの形が壊れています）'] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: ['ファイルの包みの形が壊れています'] };
  }
  if (parsed.format !== USER_CARD_PACKAGE_FORMAT) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: ['作ったカードの包みではありません（format が違います）'] };
  }
  if (parsed.version !== USER_CARD_PACKAGE_VERSION) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: ['作ったカードの包みの版が合いません（版は1です）'] };
  }
  if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: ['カードが0枚です'] };
  }
  if (parsed.cards.length > USER_CARD_MAX_CARDS_PER_FILE) {
    return { ok: false, accepted: [], rejected: [], warnings: [], errors: [`1つのファイルは${USER_CARD_MAX_CARDS_PER_FILE}枚までです`] };
  }
  const accepted = [];
  const rejected = [];
  const warnings = [];
  const fileIds = new Set();
  const fileNames = new Set();
  for (let i = 0; i < parsed.cards.length; i++) {
    const raw = parsed.cards[i];
    const r = validateUserCard(raw, {
      ...ctx,
      fileIds,
      fileNames,
      storedNames: ctx.storedNames,
    });
    const rawId = raw && typeof raw === 'object' ? String(raw.id ?? '') : '';
    const rawName = raw && typeof raw === 'object' && typeof raw.display_name === 'string' ? raw.display_name.trim() : '';
    if (rawId) fileIds.add(rawId);
    if (rawName) fileNames.add(rawName);
    if (!r.ok) {
      rejected.push({ index: i, id: rawId || `(ファイルの${i + 1}枚目)`, errors: r.errors });
      continue;
    }
    accepted.push(r.card);
    warnings.push(...r.warnings);
  }
  // 名前の重なりはファイルの中でも見る（後から入る分が先に入った分と重なったら落とす）
  const seenNames = new Set(ctx.storedNames || []);
  const kept = [];
  for (const c of accepted) {
    if (seenNames.has(c.display_name)) {
      rejected.push({ index: -1, id: c.id, errors: [`${c.id}：同じファイルの中で名前が重なっています`] });
      continue;
    }
    seenNames.add(c.display_name);
    kept.push(c);
  }
  return { ok: true, accepted: kept, rejected, warnings, errors: [] };
}

// 保存する形（{v:1, cards:[...]}）を作る。大きさの上限を超えたら ok:false。
export function buildStoredJson(existingCards, newCards) {
  const cards = [...(existingCards || []), ...(newCards || [])];
  const json = JSON.stringify({ v: 1, cards });
  if (byteLength(json) > USER_CARD_MAX_STORED_BYTES) {
    return { ok: false, error: '保存が大きすぎます（上限3MB）。絵の大きい札を外してから入れてください', json: null, bytes: byteLength(json) };
  }
  return { ok: true, json, bytes: byteLength(json), count: cards.length };
}

// 起動時の復元用の軽い形の検査（部品の読み込みを待てない場所で使う）。
// 門は validateUserCard と同じ境界。効果の一覧までは見ない（読み込み時に通った分だけが保存されているため）。
export function isStoredCardShapeOk(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  if (typeof c.id !== 'string' || !USER_CARD_ID_PATTERN.test(c.id)) return false;
  for (const f of ['display_name', 'suit', 'rank', 'ability', 'effect_type', 'rules_text']) {
    if (typeof c[f] !== 'string' || !c[f].trim()) return false;
  }
  if (typeof c.ability_type !== 'string' || !c.ability_type.trim()) return false;
  if (!Number.isInteger(c.power) || c.power < 0 || c.power > 13) return false;
  if (!Number.isInteger(c.ability_cost) || c.ability_cost < 0 || c.ability_cost > 9) return false;
  return true;
}
