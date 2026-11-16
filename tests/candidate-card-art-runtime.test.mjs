import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CANDIDATE_CARD_ART_ENTRIES,
  candidateArtForCard,
  createCandidateCardArtRegistry,
} from '../browser/candidate-card-art-runtime.mjs';
import { artForCard } from '../browser/card-art-registry-core.mjs';

const browserDir = fileURLToPath(new URL('../browser/', import.meta.url));

test('輸入カード15枚全部に artId と実ファイルがある', () => {
  assert.equal(CANDIDATE_CARD_ART_ENTRIES.length, 15);
  const registry = createCandidateCardArtRegistry();
  for (const entry of CANDIDATE_CARD_ART_ENTRIES) {
    const found = artForCard(registry, { id: entry.cardId, artId: entry.artId });
    assert.equal(found?.artId, entry.artId, entry.cardId);
    assert.equal(candidateArtForCard({ id: entry.cardId, artId: entry.artId })?.file, entry.file);
    const path = `${browserDir}assets/${entry.file}`;
    assert.ok(existsSync(path), path);
    assert.ok(statSync(path).size > 10000, path);
  }
});

test('GAMEROAD.html のカードデータで15枚全部に artId が付いている', () => {
  const html = readFileSync(`${browserDir}GAMEROAD.html`, 'utf8');
  const start = html.indexOf('window.__CARD_DATA__=');
  assert.ok(start >= 0);
  const jsonStart = html.indexOf('[', start);
  // JSON配列の終わりは次の "];" ではなく raw_decode 相当が必要なため、括弧対応で切り出す
  let depth = 0; let end = -1; let inStr = false; let esc = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth === 0) { end = i; break; } }
  }
  const data = JSON.parse(html.slice(jsonStart, end + 1));
  const cands = data.filter((c) => String(c.id).startsWith('DCG_CAND_'));
  assert.equal(cands.length, 15);
  for (const entry of CANDIDATE_CARD_ART_ENTRIES) {
    const card = cands.find((c) => c.id === entry.cardId);
    assert.ok(card, entry.cardId);
    assert.equal(card.artId, entry.artId, entry.cardId);
  }
  assert.ok(html.includes('candidate-card-art-runtime.mjs'));
});

// --- 移し替え（3b）：tests/dice-items-and-dragils.test.mjs から移したカードデータの7件 ---
// 2026-11-15 ライカの決めの出し直し（2026-11-16に管理役の判断で廃止の訂正を追加）：
// A) 「サイコロ4種は元からアイテム」という前提は裏付けの無い捏造だった（2026-11-15、ライカの訂正）。
//    裏付けのある決めは2つだけ：ダイスはデフォルト2個／ダブルサイコロは廃止（2026-11-12 11:05、
//    ライカの決定。既定が2個なので役目が無い道具として、アイテム化ではなく道具自体を無くす）。
//    よってダブルはカードでもアイテムでも無い。カードデータとデッキ候補から外し、アイテムの定義
//    （ITEM_DEFS）・使用の分岐（useItem）・施設の池（ITEM_POOL）・橋の対応付けからも消す。
//    トリプル／456／10面はカードのまま残し、アイテム側の定義もこの版では残す（扱いは別途）。
// B) ドラギルスの表示名は名前だけ（蒼炎の白龍）。読み（ドラギルス）は名前の読みとして分けて持ち、
//    能力 W・ロードの読み（ダブルロード）は能力側に分ける。連結表示は禁止。
const cardDataHtml = readFileSync(`${browserDir}GAMEROAD.html`, 'utf8');
const cardDataMarker = 'window.__CARD_DATA__=';
const cardDataStart = cardDataHtml.indexOf('[', cardDataHtml.indexOf(cardDataMarker));
let cardDataDepth = 0, cardDataEnd = -1, cardDataInStr = false, cardDataEsc = false;
for (let i = cardDataStart; i < cardDataHtml.length; i++) {
  const ch = cardDataHtml[i];
  if (cardDataInStr) { if (cardDataEsc) cardDataEsc = false; else if (ch === '\\') cardDataEsc = true; else if (ch === '"') cardDataInStr = false; continue; }
  if (ch === '"') cardDataInStr = true;
  else if (ch === '[') cardDataDepth++;
  else if (ch === ']') { cardDataDepth--; if (cardDataDepth === 0) { cardDataEnd = i + 1; break; } }
}
const cardDataCards = JSON.parse(cardDataHtml.slice(cardDataStart, cardDataEnd));
const cardDataById = new Map(cardDataCards.map((c) => [c.id, c]));

// 範囲の訂正（2026-11-15、ライカ）：ライカの決めとして確認できるのはダブルのみ。
// トリプル／456／10面はカードのまま残す（この版＝公開パッケージの絞り込み版）。
const DICE_CARD_IDS = ['DCG_DICE_DOUBLE'];
const KEPT_DICE_CARDS = ['DCG_DICE_TRIPLE', 'DCG_DICE_456', 'DCG_DICE_D10'];

test('ダブルはカードデータに無い（廃止。デッキ候補からも外れる）', () => {
  for (const id of DICE_CARD_IDS) assert.equal(cardDataById.has(id), false, id);
  // 総数は土台の版で変わる（公開土台106→102／作業コピー113→109）ので、絶対数ではなく不在で固定する。
});

test('トリプル／456／10面はカードのまま（範囲の訂正で戻した）', () => {
  for (const id of KEPT_DICE_CARDS) {
    const c = cardDataById.get(id);
    assert.ok(c, id);
    assert.equal(c.ability_type, 'Spell', id);
    assert.equal(c.authority, 'user_spec_item_20261109', id);
  }
});

test('ぐる〜れっと・ダイスはAI候補の別物（この直しの対象外）', () => {
  // 土台の版によっては未収録（公開土台106種には無い／作業コピーには有る）。
  // 有る場合は、AI候補の印と形が変わっていないことだけを固定する。
  const rlt = cardDataById.get('DCG_RLT_DICE');
  if (!rlt) return;
  assert.equal(rlt.authority, 'ai_candidate_roulette_20261111');
  assert.equal(rlt.ability_type, 'Spell');
});

test('アイテム定義にサイコロ3種（トリプル／456／10面）が揃い、使用でダイスの状態が変わる受け口がある', () => {
  assert.match(cardDataHtml, /dice_triple:\{name:'トリプルサイコロ'/);
  assert.match(cardDataHtml, /dice_456:\{name:'456サイコロ'/);
  assert.match(cardDataHtml, /dice_d10:\{name:'10面ダイス'/);
  assert.match(cardDataHtml, /case'dice_triple':p\.diceCount=3/);
  assert.match(cardDataHtml, /case'dice_456':p\.diceFixed=\[4,5,6\]/);
  assert.match(cardDataHtml, /case'dice_d10':p\.diceSides=10/);
});

test('ダブルはアイテム側にも無い（廃止。定義・使用の分岐のどちらにも残らない）', () => {
  assert.equal(cardDataHtml.includes('dice_double'), false);
  assert.equal(cardDataHtml.includes('ダブルサイコロ'), false);
  assert.equal(cardDataHtml.includes('ITEM_DICE_DOUBLE'), false);
});

test('ドラギルスの表示名は名前だけで、読みは分けて持つ', () => {
  const d = cardDataById.get('DCG_DRAG_DRAGILS');
  assert.ok(d);
  assert.equal(d.display_name, '蒼炎の白龍');
  assert.equal(d.name_reading, 'ドラギルス');
  assert.equal(d.ability_reading, 'ダブルロード');
  assert.equal('reading' in d, false);
  assert.equal(d.ability, 'W・ロード');
  assert.equal(d.rulesKey, 'W_LOAD');
});

test('連結した名前（蒼炎の白龍ドラギルス／蒼炎の白竜ドラギルス）はデータのどこにも無い', () => {
  assert.equal(cardDataHtml.includes('蒼炎の白龍ドラギルス'), false);
  assert.equal(cardDataHtml.includes('蒼炎の白竜ドラギルス'), false);
  assert.equal(cardDataHtml.includes('蒼炎の白竜'), false);
});
