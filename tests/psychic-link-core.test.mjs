import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PSYCHIC_LINK_COMPONENTS,
  PSYCHIC_LINK_SUPER,
  PSYCHIC_LINK_TIMELINE,
  PSYCHIC_LINK_TOTAL_MS,
  applyLink,
  applyUnlink,
  canLink,
  canUnlink,
  createPsychicLinkState,
  describeBoard,
  hasAllComponents,
} from '../browser/psychic-link-core.mjs';

test('3枚そろうとリンクできる', () => {
  const state = createPsychicLinkState();
  assert.equal(state.status, 'components');
  assert.equal(hasAllComponents(state), true);
  assert.equal(canLink(state), true);
});

test('1枚足りないとリンクできない', () => {
  const state = createPsychicLinkState(['gaial-kaiser', 'dragonic-pippy']);
  assert.equal(hasAllComponents(state), false);
  assert.equal(canLink(state), false);
  assert.equal(applyLink(state), state);
});

test('リンクすると表示は1枚、中の3枚は残る', () => {
  const linked = applyLink(createPsychicLinkState());
  assert.equal(linked.status, 'linked');
  assert.equal(linked.superId, 'gaial-oudragon');
  assert.deepEqual(linked.componentIds, ['gaial-kaiser', 'dragonic-pippy', 'boost-grenoh']);
  const board = describeBoard(linked);
  assert.equal(board.shown.length, 1);
  assert.equal(board.shown[0].id, 'gaial-oudragon');
  assert.deepEqual(board.kept, ['gaial-kaiser', 'dragonic-pippy', 'boost-grenoh']);
  assert.equal(canLink(linked), false);
  assert.equal(canUnlink(linked), true);
});

test('リンク解除すると元の3枚に戻る', () => {
  const linked = applyLink(createPsychicLinkState());
  const back = applyUnlink(linked);
  assert.equal(back.status, 'components');
  assert.equal(back.superId, null);
  assert.equal(describeBoard(back).shown.length, 3);
  assert.equal(canLink(back), true);
});

test('合体後のカードはコスト24・パワー25000', () => {
  assert.equal(PSYCHIC_LINK_SUPER.cost, 24);
  assert.equal(PSYCHIC_LINK_SUPER.power, 25000);
  assert.equal(PSYCHIC_LINK_COMPONENTS.length, 3);
});

test('演出の時間割は3枚→全画面→白い光→合体後の順', () => {
  assert.deepEqual(
    PSYCHIC_LINK_TIMELINE.map((s) => s.phase),
    ['components-lightning', 'super-fullscreen', 'white-flash', 'linked'],
  );
  assert.ok(PSYCHIC_LINK_TIMELINE.every((s, i, a) => i === 0 || s.atMs > a[i - 1].atMs));
  assert.equal(PSYCHIC_LINK_TIMELINE.at(-1).atMs < PSYCHIC_LINK_TOTAL_MS, true);
});
