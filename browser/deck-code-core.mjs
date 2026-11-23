// デッキコード（単位3：書き出し・読み込み）
// 形：GRD1. + base64url(JSON {v:1, m:[メインの番号の列], x:[EXの番号の列]})
// 番号は本体のカード番号そのまま（DCG_〜 / SP_A など）。新しい形式への変換層は作らない。
// 完全なルール検査（40枚ちょうど・ロイヤル・切り札・公開可否）は呼び出し側の
// 既存の validateDeck が行う。ここでは形だけを確かめる。

export const DECK_CODE_PREFIX = 'GRD1.';
export const DECK_CODE_VERSION = 1;

const ID_PATTERN = /^[A-Za-z0-9_]+$/;

function bytesToBase64Url(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64url');
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(text) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64url'));
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeText(text) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  return new Uint8Array([...text].map((c) => c.charCodeAt(0)));
}

function decodeText(bytes) {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return [...bytes].map((b) => String.fromCharCode(b)).join('');
}

function isIdList(value) {
  return Array.isArray(value) && value.every((id) => typeof id === 'string' && ID_PATTERN.test(id));
}

// デッキ {main:[...], ex:[...]} をコード文字列にする。
export function encodeDeckCode(deck) {
  if (!deck || !isIdList(deck.main) || !isIdList(deck.ex)) {
    return { ok: false, errors: ['デッキの形が壊れています'] };
  }
  const payload = { v: DECK_CODE_VERSION, m: [...deck.main], x: [...deck.ex] };
  const code = DECK_CODE_PREFIX + bytesToBase64Url(encodeText(JSON.stringify(payload)));
  return { ok: true, code };
}

// コード文字列をデッキ {main:[...], ex:[...]} に戻す。形だけを確かめる。
export function decodeDeckCode(code) {
  if (typeof code !== 'string' || !code.startsWith(DECK_CODE_PREFIX)) {
    return { ok: false, errors: ['デッキコードの始まりが違います（GRD1. で始まるはずです）'] };
  }
  const body = code.slice(DECK_CODE_PREFIX.length).trim();
  if (!body || !/^[A-Za-z0-9_-]+$/.test(body)) {
    return { ok: false, errors: ['デッキコードの中身が読めません'] };
  }
  let payload;
  try {
    payload = JSON.parse(decodeText(base64UrlToBytes(body)));
  } catch (_) {
    return { ok: false, errors: ['デッキコードが壊れています'] };
  }
  if (!payload || payload.v !== DECK_CODE_VERSION || !isIdList(payload.m) || !isIdList(payload.x)) {
    return { ok: false, errors: ['デッキコードの版か中身が合いません'] };
  }
  const all = [...payload.m, ...payload.x];
  if (new Set(all).size !== all.length) {
    return { ok: false, errors: ['同じカードが2回入っています'] };
  }
  return { ok: true, deck: { main: [...payload.m], ex: [...payload.x] } };
}
