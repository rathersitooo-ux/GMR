import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATTLE_AUTO_INPUT,
  createBattleAutoInputController,
} from '../browser/battle-auto-input-core.mjs';

function candidate(inputId, overrides = {}) {
  return {
    inputId,
    kind: 'hand_card',
    legal: true,
    autoSelectable: true,
    requiresManualTarget: false,
    positionOrder: 0,
    comparisonValue: 0,
    commitInput: { inputId },
    ...overrides,
  };
}

function frame(frameKey, candidates) {
  return { frameKey, candidates };
}

test('Auto defaults to manual and never commits until the user enables a mode', async () => {
  let commits = 0;
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-1|road|P1', [candidate('a')]),
    commitHumanInput: () => { commits += 1; return true; },
  });

  assert.deepEqual(controller.status(), {
    mode: 'manual',
    enabled: false,
    inFlightFrameKey: null,
    committedFrameCount: 0,
    persistence: 'none',
    targetSelection: 'manual',
    progressionAuthority: 'human-commit-path-only',
  });
  assert.deepEqual(await controller.runOnce(), { ok: false, committed: false, reason: 'MANUAL_MODE' });
  assert.equal(commits, 0);
  assert.equal(BATTLE_AUTO_INPUT.defaultMode, 'manual');
  assert.equal(BATTLE_AUTO_INPUT.persistence, 'none');
});

test('left mode reads the human legal inputs twice and commits through the caller human path exactly once', async () => {
  let reads = 0;
  const committed = [];
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => {
      reads += 1;
      return frame('round-2|battle|P1', [
        candidate('right', { positionOrder: 2 }),
        candidate('left', { positionOrder: 0 }),
        candidate('middle', { positionOrder: 1 }),
      ]);
    },
    commitHumanInput: (input) => { committed.push(input); return true; },
  });

  assert.equal(controller.setMode('left'), true);
  const result = await controller.runOnce();
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(result.selected.inputId, 'left');
  assert.equal(result.commitPath, 'human');
  assert.equal(result.targetSelection, 'manual');
  assert.equal(reads, 2);
  assert.deepEqual(committed, [{ inputId: 'left' }]);

  const duplicate = await controller.runOnce();
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'FRAME_ALREADY_COMMITTED');
  assert.equal(committed.length, 1);
});

test('simple Auto never selects target, column, shield, or a hand input that still needs a manual target', async () => {
  const committed = [];
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-3|target|P1', [
      candidate('target-p2', { kind: 'target', positionOrder: 0 }),
      candidate('column-left', { kind: 'column', positionOrder: 1 }),
      candidate('shield-1', { kind: 'shield', positionOrder: 2 }),
      candidate('card-needs-target', { requiresManualTarget: true, positionOrder: 3 }),
    ]),
    commitHumanInput: (input) => { committed.push(input); return true; },
  });

  controller.setMode('left');
  const result = await controller.runOnce();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'NO_AUTO_SELECTABLE_HUMAN_INPUT');
  assert.deepEqual(committed, []);
});

test('Auto fails closed when the fresh human legal-input read changes the selected action', async () => {
  let reads = 0;
  let commits = 0;
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => {
      reads += 1;
      if (reads === 1) {
        return frame('round-4|road|P1', [
          candidate('a', { positionOrder: 0 }),
          candidate('b', { positionOrder: 1 }),
        ]);
      }
      return frame('round-4|road|P1', [
        candidate('a', { positionOrder: 2 }),
        candidate('b', { positionOrder: 0 }),
      ]);
    },
    commitHumanInput: () => { commits += 1; return true; },
  });

  controller.setMode('left');
  const result = await controller.runOnce();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'AUTO_SELECTION_CHANGED_ON_REVALIDATION');
  assert.equal(reads, 2);
  assert.equal(commits, 0);
});

test('right/max/min use caller-provided human-visible ordering/value and do not create gameplay authority', async () => {
  const committed = [];
  let activeFrame = 'right';
  const frames = {
    right: frame('f-right', [
      candidate('a', { positionOrder: 0, comparisonValue: 7 }),
      candidate('b', { positionOrder: 2, comparisonValue: 3 }),
      candidate('c', { positionOrder: 1, comparisonValue: 9 }),
    ]),
    max: frame('f-max', [
      candidate('a', { positionOrder: 0, comparisonValue: 7 }),
      candidate('b', { positionOrder: 2, comparisonValue: 3 }),
      candidate('c', { positionOrder: 1, comparisonValue: 9 }),
    ]),
    min: frame('f-min', [
      candidate('a', { positionOrder: 0, comparisonValue: 7 }),
      candidate('b', { positionOrder: 2, comparisonValue: 3 }),
      candidate('c', { positionOrder: 1, comparisonValue: 9 }),
    ]),
  };
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => frames[activeFrame],
    commitHumanInput: (input) => { committed.push(input.inputId); return true; },
  });

  controller.setMode('right');
  assert.equal((await controller.runOnce()).selected.inputId, 'b');
  activeFrame = 'max';
  controller.setMode('max');
  assert.equal((await controller.runOnce()).selected.inputId, 'c');
  activeFrame = 'min';
  controller.setMode('min');
  assert.equal((await controller.runOnce()).selected.inputId, 'b');
  assert.deepEqual(committed, ['b', 'c', 'b']);
  assert.equal(controller.status().progressionAuthority, 'human-commit-path-only');
});

test('situation mode is recognized but cannot act until the shared situation selector is connected', async () => {
  let commits = 0;
  const unconnected = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-5|battle|P1', [candidate('safe')]),
    commitHumanInput: () => { commits += 1; return true; },
  });
  assert.equal(unconnected.setMode('situation'), true);
  assert.equal((await unconnected.runOnce()).reason, 'SITUATION_SELECTOR_NOT_CONNECTED');
  assert.equal(commits, 0);

  const connected = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-6|battle|P1', [candidate('safe'), candidate('other')]),
    selectSituationCandidate: (publicCandidates) => {
      assert.equal(Object.prototype.hasOwnProperty.call(publicCandidates[0], 'commitInput'), false);
      return 'safe';
    },
    commitHumanInput: () => true,
  });
  connected.setMode('situation');
  const result = await connected.runOnce();
  assert.equal(result.ok, true);
  assert.equal(result.selected.inputId, 'safe');
  assert.equal(result.reason, 'SITUATION_SELECTED');
});

test('situation selector cannot smuggle a non-legal or non-auto-selectable input into the human commit path', async () => {
  let commits = 0;
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-7|battle|P1', [
      candidate('legal'),
      candidate('hidden', { legal: false }),
      candidate('manual-only', { autoSelectable: false }),
    ]),
    selectSituationCandidate: () => 'hidden',
    commitHumanInput: () => { commits += 1; return true; },
  });

  controller.setMode('situation');
  const result = await controller.runOnce();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SITUATION_SELECTED_NONLEGAL_INPUT');
  assert.equal(commits, 0);
});

test('reset returns Auto to OFF/manual and clears only controller-local duplicate state', async () => {
  let commits = 0;
  const controller = createBattleAutoInputController({
    readHumanLegalInputs: () => frame('round-8|road|P1', [candidate('a')]),
    commitHumanInput: () => { commits += 1; return true; },
  });

  controller.setMode('left');
  assert.equal((await controller.runOnce()).ok, true);
  assert.equal(commits, 1);
  assert.equal(controller.reset(), true);
  assert.equal(controller.status().mode, 'manual');
  assert.equal(controller.status().committedFrameCount, 0);
  assert.equal((await controller.runOnce()).reason, 'MANUAL_MODE');
  assert.equal(commits, 1);
});
