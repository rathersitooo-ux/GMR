import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBattleNowGuideController,
  readBattleNowGuideSnapshot,
} from '../browser/battle-now-guide-runtime.mjs';

function fakeElement() {
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; },
  };
}

test('controller writes the one-line guide into the element and tracks the step', () => {
  const element = fakeElement();
  let snapshot = { screen: 'battle', phase: 'plan', roadId: null, battleId: null };
  const controller = createBattleNowGuideController({ element, readSnapshot: () => snapshot });

  const road = controller.update();
  assert.equal(road.step, 'road');
  assert.equal(element.textContent, '今やること：1 ロードを選ぶ → 2 バトルを選ぶ → 3 終点を決める → 準備完了');
  assert.equal(element.hidden, false);
  assert.equal(element.dataset.nowGuideStep, 'road');
  assert.equal(element.dataset.nowGuideActive, 'true');

  snapshot = { screen: 'battle', phase: 'plan', roadId: 'road-a', battleId: null };
  assert.equal(controller.update().step, 'battle');
  assert.equal(element.dataset.nowGuideStep, 'battle');

  snapshot = { screen: 'battle', phase: 'target', roadId: 'road-a', battleId: 'battle-b' };
  assert.equal(controller.update().message, '今やること：攻撃先を選んで「攻撃先を決定」を押す');
  assert.equal(element.dataset.nowGuidePhase, 'target');

  snapshot = { screen: 'home', phase: 'plan' };
  assert.equal(controller.update().active, false);
  assert.equal(element.textContent, '');
  assert.equal(element.hidden, true);
  assert.equal(element.attrs['aria-hidden'], 'true');

  controller.destroy();
  assert.equal(controller.update(), null);
});

test('snapshot reader takes the lit phase and the current selections from the DOM', () => {
  const nodes = {
    'section[data-screen="battle"]': { classList: { contains: (name) => name === 'active' } },
    '#phaseBar [data-ph].on': { dataset: { ph: 'move' } },
    '#phaseTitle': { textContent: '移動を解決' },
    '#roadSelect': { value: 'road-a' },
    '#battleSelect': { value: '' },
  };
  const doc = { querySelector: (selector) => nodes[selector] ?? null };
  assert.deepEqual(readBattleNowGuideSnapshot(doc), {
    screen: 'battle', phase: 'move', roadId: 'road-a', battleId: null,
  });
});

test('snapshot reader falls back to the phase title and stays inactive off the battle screen', () => {
  const nodes = {
    'section[data-screen="battle"]': { classList: { contains: () => false } },
    '#phaseTitle': { textContent: '行動を計画' },
    '#roadSelect': { value: '' },
    '#battleSelect': { value: '' },
  };
  const doc = { querySelector: (selector) => nodes[selector] ?? null };
  const snapshot = readBattleNowGuideSnapshot(doc);
  assert.equal(snapshot.screen, null);
  assert.equal(snapshot.phase, 'plan');
  assert.equal(snapshot.roadId, null);
});
