import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PSYCHIC_LINK_BATTLE_TIMELINE,
  PSYCHIC_LINK_BATTLE_TOTAL_MS,
  createPsychicLinkBattleBridge,
  derivePsychicLinkPowerValue,
  pickLinkComponents,
  shouldStartPsychicLink,
  suitGlyphOf,
} from '../browser/psychic-link-battle-runtime.mjs';

test('パワー値は3枚のpowerの合計を千倍の整数で持つ', () => {
  const value = derivePsychicLinkPowerValue([{ power: 5 }, { power: 9 }, { power: 13 }]);
  assert.equal(value, 27000);
  assert.equal(Number.isInteger(value), true);
});

test('素の値が小数でもパワー値に小数点は出ない（13.5なら13500）', () => {
  assert.equal(derivePsychicLinkPowerValue([{ power: 13.5 }]), 13500);
  assert.equal(derivePsychicLinkPowerValue([{ power: 4.25 }, { power: 4.25 }]), 8500);
});

test('カードが無い・数字が無い場合は0', () => {
  assert.equal(derivePsychicLinkPowerValue([]), 0);
  assert.equal(derivePsychicLinkPowerValue([{ id: 'X' }]), 0);
  assert.equal(derivePsychicLinkPowerValue(null), 0);
});

test('材料は盤面の最初の3枚。2枚以下ではそろわない', () => {
  const field = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
  assert.deepEqual(pickLinkComponents(field).map((c) => c.id), ['A', 'B', 'C']);
  assert.equal(pickLinkComponents(field.slice(0, 2)), null);
  assert.equal(pickLinkComponents(null), null);
});

test('発火の判定は「3枚そろった・未リンク・再生中でない」', () => {
  assert.equal(shouldStartPsychicLink({ fieldCount: 3 }), true);
  assert.equal(shouldStartPsychicLink({ fieldCount: 2 }), false);
  assert.equal(shouldStartPsychicLink({ fieldCount: 5, alreadyLinked: true }), false);
  assert.equal(shouldStartPsychicLink({ fieldCount: 5, playing: true }), false);
});

test('スートの印は既存の盤面表示と同じ記号', () => {
  assert.equal(suitGlyphOf({ suit: 'SP' }), '♠');
  assert.equal(suitGlyphOf({ suit: 'HT' }), '♥');
  assert.equal(suitGlyphOf({ suit: 'DI' }), '♦');
  assert.equal(suitGlyphOf({ suit: 'CL' }), '♣');
  assert.equal(suitGlyphOf({ glyph: '★' }), '★');
});

test('時間割はv23の段取りで、最後が総時間ちょうど', () => {
  assert.deepEqual(
    PSYCHIC_LINK_BATTLE_TIMELINE.map((s) => s.phase),
    ['charge', 'rise', 'converge', 'materialize', 'flip', 'flash', 'reveal', 'cutin', 'pillar', 'land', 'settle', 'linked'],
  );
  assert.ok(PSYCHIC_LINK_BATTLE_TIMELINE.every((s, i, a) => i === 0 || s.atMs > a[i - 1].atMs));
  assert.equal(PSYCHIC_LINK_BATTLE_TIMELINE.at(-1).atMs, PSYCHIC_LINK_BATTLE_TOTAL_MS);
});

// 橋の発火：解決で人間が勝ち、盤面に3枚そろった時だけ、1回だけ発火する。
function fakeWorld({ winnerIds, lanes }) {
  const match = {
    id: 'M1',
    players: [{ id: 'P1', human: true, lanes }],
    lastBattleResolution: { serial: 1, winnerIds },
  };
  const state = { match };
  const plays = [];
  const bridge = createPsychicLinkBattleBridge({
    getState: () => state,
    getCardFace: (id) => ({ name: id, suit: 'SP', power: Number(id.replace('C', '')) || 0 }),
    herImage: 'her.png',
    createPerformance: () => ({
      play: (components) => { plays.push(components); return Promise.resolve({ status: 'linked', componentIds: components.map((c) => c.id), powerValue: 6000 }); },
      destroy: () => {},
    }),
  });
  return { bridge, plays, match };
}

test('橋：人間が勝って3枚そろうと発火し、材料とパワー値が材料の数字から作られる', async () => {
  const { bridge, plays } = fakeWorld({
    winnerIds: ['P1'],
    lanes: { L: ['C1'], C: ['C2'], R: ['C3'] },
  });
  bridge.tick();
  assert.equal(plays.length, 1);
  assert.deepEqual(plays[0].map((c) => c.id), ['C1', 'C2', 'C3']);
  const probe = bridge.probe();
  assert.equal(probe.lastTrigger().powerValue, 6000);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(probe.status(), 'linked');
  assert.equal(probe.linkState().powerValue, 6000);
  // 同じ解決では二度発火しない。
  bridge.tick();
  assert.equal(plays.length, 1);
});

test('橋：人間が勝っていない・2枚だけ、では発火しない', () => {
  const lost = fakeWorld({ winnerIds: ['P2'], lanes: { L: ['C1'], C: ['C2'], R: ['C3'] } });
  lost.bridge.tick();
  assert.equal(lost.plays.length, 0);
  const two = fakeWorld({ winnerIds: ['P1'], lanes: { L: ['C1'], C: ['C2'], R: [] } });
  two.bridge.tick();
  assert.equal(two.plays.length, 0);
});
