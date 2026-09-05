import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleAutoInputController } from '../browser/battle-auto-input-core.mjs';
import { createBattleAutoDomBridge } from '../browser/ui-state-feedback-ready-plan-adapter.mjs';

function fixture() {
  let activeRole = 'road';
  const listeners = new Map();
  const makeSelect = (id, values) => ({
    id,
    value: '',
    options: values.map((value) => ({ value, disabled: false })),
    focus() { activeRole = id === 'roadSelect' ? 'road' : 'battle'; },
    addEventListener(type, handler) {
      const list = listeners.get(`${id}:${type}`) || [];
      list.push(handler);
      listeners.set(`${id}:${type}`, list);
    },
    removeEventListener() {},
    dispatchEvent(event) {
      for (const handler of listeners.get(`${id}:${event.type}`) || []) handler(event);
      return true;
    },
  });
  const ids = ['CARD-A', 'CARD-B', 'CARD-C'];
  const road = makeSelect('roadSelect', ids);
  const battle = makeSelect('battleSelect', ids);
  const ranks = new Map([['CARD-A', 3], ['CARD-B', 9], ['CARD-C', 5]]);
  const buttons = ids.map((id) => ({
    dataset: { cardId: id },
    disabled: false,
    querySelector(selector) {
      return selector === '.handCardRank' ? { textContent: String(ranks.get(id)) } : null;
    },
    click() {
      const select = activeRole === 'road' ? road : battle;
      select.value = id;
      select.dispatchEvent({ type: 'change' });
    },
  }));
  const hand = { children: buttons };
  const nodes = { roadSelect: road, battleSelect: battle, hand };
  const document = {
    getElementById(id) { return nodes[id] || null; },
    querySelectorAll(selector) { return selector === '#hand .handCard' ? buttons : []; },
  };
  return { target: { ownerDocument: document }, road, battle, buttons };
}

test('left Auto selects through the same human card click path and leaves READY manual', async () => {
  const fx = fixture();
  const bridge = createBattleAutoDomBridge({ target: fx.target });
  const controller = createBattleAutoInputController(bridge);
  assert.equal(controller.setMode('left'), true);

  const road = await controller.runOnce();
  assert.equal(road.committed, true);
  assert.equal(road.commitPath, 'human');
  assert.equal(fx.road.value, 'CARD-A');
  assert.equal(fx.battle.value, '');

  const battle = await controller.runOnce();
  assert.equal(battle.committed, true);
  assert.equal(fx.road.value, 'CARD-A');
  assert.equal(fx.battle.value, 'CARD-B');
  assert.equal(controller.status().targetSelection, 'manual');
  assert.equal(controller.status().progressionAuthority, 'human-commit-path-only');
});

test('max/min use the visible hand number and never expose target/column/shield candidates', async () => {
  const fx = fixture();
  const bridge = createBattleAutoDomBridge({ target: fx.target });
  const firstFrame = bridge.readHumanLegalInputs();
  assert.ok(firstFrame.candidates.length > 0);
  assert.deepEqual([...new Set(firstFrame.candidates.map((candidate) => candidate.kind))], ['card']);
  assert.equal(firstFrame.candidates.some((candidate) => candidate.requiresManualTarget), false);

  const controller = createBattleAutoInputController(bridge);
  controller.setMode('max');
  const max = await controller.runOnce();
  assert.equal(max.selected.inputId, 'CARD-B');
  assert.equal(fx.road.value, 'CARD-B');

  fx.road.value = '';
  fx.battle.value = '';
  controller.reset();
  controller.setMode('min');
  const min = await controller.runOnce();
  assert.equal(min.selected.inputId, 'CARD-A');
  assert.equal(fx.road.value, 'CARD-A');
});
