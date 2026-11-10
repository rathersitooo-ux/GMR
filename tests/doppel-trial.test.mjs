// ドッペルゲンガー試し版のテスト（2026-11-10）。
// 系統は「手札に戻る」版。通常／超／統一形を切り替えて比べるための核。
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoppelTrial, fieldTotalsAfter, winnerOf } from '../browser/doppel-trial-core.mjs';
import { measureMatches } from '../browser/doppel-trial-measure.mjs';

const F = (playerId, cardId, name, number, extra = {}) => ({ playerId, cardId, name, number, ...extra });

test('通常：同じ数字が2枚以上で手札へ戻る。1枚だけなら何も起きない', () => {
  const field = [F('P1', 'a', 'a', 7), F('P2', 'b', 'b', 7), F('P3', 'c', 'c', 3)];
  const r = evaluateDoppelTrial(field, { form: 'normal' });
  assert.equal(r.triggered, true);
  assert.deepEqual(r.returns.map((c) => c.cardId), ['a', 'b']);
  assert.equal(r.destroys.length, 0);
  const r2 = evaluateDoppelTrial([F('P1', 'a', 'a', 7), F('P2', 'b', 'b', 3)], { form: 'normal' });
  assert.equal(r2.triggered, false);
});

test('超：同じ数字は戻らず消滅する', () => {
  const field = [F('P1', 'a', 'a', 7), F('P2', 'b', 'b', 7)];
  const r = evaluateDoppelTrial(field, { form: 'super' });
  assert.equal(r.returns.length, 0);
  assert.deepEqual(r.destroys.map((c) => c.cardId), ['a', 'b']);
});

test('統一形：同名は消滅、同数は手札へ戻る', () => {
  const field = [
    F('P1', 'a', '炎の剣士', 5),
    F('P2', 'b', '炎の剣士', 9), // 同名（数字は違う）
    F('P3', 'c', '氷の女王', 5), // P1と同数
    F('P4', 'd', '風の旅人', 2),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.deepEqual(r.destroys.map((c) => c.cardId), ['a', 'b']);
  assert.deepEqual(r.returns.map((c) => c.cardId), ['c']);
  // a は同名でも同数でもある：nameFirst では消滅が優先される
  assert.equal(r.destroys.some((c) => c.cardId === 'a'), true);
});

test('統一形：先後を切り替えると、両方に当たった札の行き先が変わる', () => {
  const field = [F('P1', 'a', '炎の剣士', 5), F('P2', 'b', '炎の剣士', 5)];
  const nameFirst = evaluateDoppelTrial(field, { form: 'unified', order: 'nameFirst' });
  const numberFirst = evaluateDoppelTrial(field, { form: 'unified', order: 'numberFirst' });
  assert.equal(nameFirst.destroys.length, 2);
  assert.equal(nameFirst.returns.length, 0);
  assert.equal(numberFirst.returns.length, 2);
  assert.equal(numberFirst.destroys.length, 0);
});

test('オリカは同名判定の対象外（数字の判定には入る）', () => {
  const field = [
    F('P1', 'a', '自作くん', 4, { isOriginal: true }),
    F('P2', 'b', '自作くん', 9, { isOriginal: true }),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.equal(r.triggered, false); // 同名でも消滅しない、同数でもない
  const field2 = [
    F('P1', 'a', '自作くん', 4, { isOriginal: true }),
    F('P2', 'c', '氷の女王', 4),
  ];
  const r2 = evaluateDoppelTrial(field2, { form: 'unified' });
  assert.deepEqual(r2.returns.map((c) => c.cardId), ['a', 'c']); // 数字では戻る
});

test('除外（アタッカー以外という細則の当て先）が効く', () => {
  const field = [F('P1', 'a', 'a', 7), F('P2', 'b', 'b', 7)];
  const r = evaluateDoppelTrial(field, { form: 'normal', excludePlayerId: 'P1' });
  assert.equal(r.triggered, false); // P1を除くと同数は1枚だけ
});

test('戻った・消えた分は合計に入らず、勝者が変わることがある', () => {
  const field = [F('P1', 'a', 'a', 9), F('P1', 'b', 'b', 9), F('P2', 'c', 'c', 10)];
  const r = evaluateDoppelTrial(field, { form: 'normal' });
  const totals = fieldTotalsAfter(field, r);
  assert.equal(totals.P1, undefined); // 2枚とも戻った
  assert.equal(totals.P2, 10);
  assert.equal(winnerOf(totals), 'P2');
});

test('同名判定は系統の識別子でやる：リメイク（名前違い・同じ系統）は同名になる', () => {
  const F2 = (playerId, cardId, name, number, lineageId) => ({ playerId, cardId, name, number, lineageId });
  const field = [
    F2('P1', 'a', '炎の剣士', 5, 'lineage_honoo'),
    F2('P2', 'b', '炎の剣士・神アート版', 9, 'lineage_honoo'),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.deepEqual(r.destroys.map((c) => c.cardId), ['a', 'b']);
});

test('神アート式：別名が違っても実際の系統が同じなら同名。別名が同じでも系統が違えば同名にしない', () => {
  const F2 = (playerId, cardId, name, number, lineageId) => ({ playerId, cardId, name, number, lineageId });
  const sameActual = evaluateDoppelTrial([
    F2('P1', 'a', '別名アルファ', 5, 'actual_card_x'),
    F2('P2', 'b', '別名ベータ', 9, 'actual_card_x'),
  ], { form: 'unified' });
  assert.deepEqual(sameActual.destroys.map((c) => c.cardId), ['a', 'b']);
  const differentActual = evaluateDoppelTrial([
    F2('P1', 'a', '同じ別名', 5, 'actual_card_x'),
    F2('P2', 'b', '同じ別名', 9, 'actual_card_y'),
  ], { form: 'unified' });
  assert.equal(differentActual.triggered, false);
});

test('同じキャラでも名前（系統）が違えば同名にしない', () => {
  const field = [
    F('P1', 'a', 'サースナー・剣', 4),
    F('P2', 'b', 'サースナー・盾', 9),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.equal(r.triggered, false);
});

test('表記ゆれ（中黒・空白・全角英字）は、識別子が無い時の判定をぶらさない', () => {
  const field = [
    F('P1', 'a', '炎の・剣士', 4),
    F('P2', 'b', '炎の剣士', 9),
    F('P3', 'c', 'ＡＢＣ', 2),
    F('P4', 'd', 'abc', 3),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.deepEqual(r.destroys.map((c) => c.cardId), ['a', 'b', 'c', 'd']);
});

test('自分の同名同士：既定は含まない（相手との間だけ）。含む設定も選べる', () => {
  const field = [F('P1', 'a', '炎の剣士', 4), F('P1', 'b', '炎の剣士', 9)];
  const incl = evaluateDoppelTrial(field, { form: 'unified', includeOwnPairs: true });
  assert.equal(incl.destroys.length, 2);
  const byDefault = evaluateDoppelTrial(field, { form: 'unified' });
  assert.equal(byDefault.triggered, false);
  const excl = evaluateDoppelTrial(field, { form: 'unified', includeOwnPairs: false });
  assert.equal(excl.triggered, false);
  // 相手と混ざれば、除く設定でも発動する
  const mixed = evaluateDoppelTrial(
    [F('P1', 'a', '炎の剣士', 4), F('P1', 'b', '炎の剣士', 9), F('P2', 'c', '炎の剣士', 2)],
    { form: 'unified', includeOwnPairs: false },
  );
  assert.equal(mixed.destroys.length, 3);
});

test('変身：変身先のカードとして扱い、同名判定も変身後の系統で見る', () => {
  const F2 = (playerId, cardId, name, number, lineageId) => ({ playerId, cardId, name, number, lineageId });
  // a は元は別のカードだが、変身して「氷の女王」になっている想定（今の姿の系統で渡す）
  const field = [
    F2('P1', 'a', '氷の女王', 6, 'lineage_icequeen'),
    F2('P2', 'b', '氷の女王', 9, 'lineage_icequeen'),
    F2('P3', 'c', '炎の剣士', 3, 'lineage_honoo'),
  ];
  const r = evaluateDoppelTrial(field, { form: 'unified' });
  assert.deepEqual(r.destroys.map((c) => c.cardId), ['a', 'b']);
});

test('測る道具：同じ種では同じ結果になり、形ごとの数が返る', () => {
  const a = measureMatches(10, 42);
  const b = measureMatches(10, 42);
  assert.deepEqual(a, b);
  assert.equal(a.rounds, 200);
  assert.ok(a.normal.triggeredRounds > 0);
  assert.equal(a.normal.destroyed, 0);
  assert.equal(a.super.returned, 0);
  assert.ok(a.super.destroyed > 0);
});
