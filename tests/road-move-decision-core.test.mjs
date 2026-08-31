import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveRoadMoveDecision,
  roadCardIdentity
} from '../browser/road-move-decision-core.mjs';

const path = Object.freeze(['A', 'B', 'C']);
const valid = Object.freeze({ pathLegal: true, stoppable: true });
const road3 = Object.freeze({ instanceId: 'road-3-a', value: 3 });
const road5 = Object.freeze({ instanceId: 'road-5-a', value: 5 });
const road6 = Object.freeze({ instanceId: 'road-6-a', value: 6 });

function decide(overrides = {}) {
  return deriveRoadMoveDecision({
    currentPath: path,
    validity: valid,
    focusedRoadCard: null,
    compatibleRoadCards: [road3, road5, road6],
    handRoadCards: [road3, road5, road6],
    ...overrides
  });
}

test('explicit valid focus uniquely resolves Decision even when several Road cards are compatible', () => {
  const result = decide({ focusedRoadCard: road5 });
  assert.equal(result.canDecide, true);
  assert.equal(result.reason, 'READY_FOCUSED');
  assert.equal(result.resolution, 'FOCUSED');
  assert.equal(result.decisionRoadCard.instanceId, 'road-5-a');
  assert.equal(result.requiresRoadCardChoice, false);
  assert.equal(result.compatibleRoadCardCount, 3);
});

test('a sole compatible in-hand Road card is only resolved at Decision without requiring prior formal selection', () => {
  const result = decide({
    compatibleRoadCards: [road5],
    focusedRoadCard: null
  });
  assert.equal(result.canDecide, true);
  assert.equal(result.reason, 'READY_SOLE_COMPATIBLE');
  assert.equal(result.resolution, 'SOLE_COMPATIBLE');
  assert.equal(result.decisionRoadCard.instanceId, 'road-5-a');
  assert.equal(result.requiresRoadCardChoice, false);
});

test('multiple compatible Road cards never auto-pick when none is explicitly focused', () => {
  const result = decide({ focusedRoadCard: null });
  assert.equal(result.canDecide, false);
  assert.equal(result.reason, 'ROAD_CARD_CHOICE_REQUIRED');
  assert.equal(result.resolution, 'UNRESOLVED');
  assert.equal(result.decisionRoadCard, null);
  assert.equal(result.requiresRoadCardChoice, true);
});

test('an invalid old focus does not erase the path and a sole current candidate can resolve at Decision', () => {
  const originalPath = [...path];
  const result = decide({
    currentPath: originalPath,
    focusedRoadCard: road3,
    compatibleRoadCards: [road5]
  });
  assert.deepEqual(originalPath, path);
  assert.equal(result.invalidFocusedRoadCard, true);
  assert.equal(result.focusedRoadCardCompatible, false);
  assert.equal(result.canDecide, true);
  assert.equal(result.resolution, 'SOLE_COMPATIBLE');
  assert.equal(result.decisionRoadCard.instanceId, 'road-5-a');
});

test('a compatible-looking card that no longer exists in the valid hand cannot be used for Decision', () => {
  const result = decide({
    focusedRoadCard: road5,
    compatibleRoadCards: [road5],
    handRoadCards: [road3, road6]
  });
  assert.equal(result.canDecide, false);
  assert.equal(result.reason, 'NO_COMPATIBLE_ROAD_CARD_IN_HAND');
  assert.equal(result.invalidFocusedRoadCard, true);
  assert.equal(result.decisionRoadCard, null);
});

test('illegal or non-stoppable current paths block Decision even when a card is uniquely resolved', () => {
  for (const validity of [false, { pathLegal: false }, { pathLegal: true, stoppable: false }]) {
    const result = decide({
      validity,
      compatibleRoadCards: [road5],
      focusedRoadCard: road5
    });
    assert.equal(result.canDecide, false);
    assert.equal(result.reason, 'PATH_INVALID');
  }
});

test('missing currentPath blocks Decision and path legality is not inferred from Road-card state', () => {
  const result = decide({
    currentPath: [],
    compatibleRoadCards: [road5],
    focusedRoadCard: road5
  });
  assert.equal(result.canDecide, false);
  assert.equal(result.reason, 'PATH_INVALID');
});

test('duplicate projections of the same Road-card identity stay one candidate', () => {
  const duplicateRoad5 = { instanceId: 'road-5-a', value: 5 };
  const result = decide({
    compatibleRoadCards: [road5, duplicateRoad5],
    handRoadCards: [road5]
  });
  assert.equal(result.compatibleRoadCardCount, 1);
  assert.equal(result.canDecide, true);
  assert.equal(result.resolution, 'SOLE_COMPATIBLE');
});

test('focused resolution returns the current hand object rather than a stale focus object with the same identity', () => {
  const staleFocus = { instanceId: 'road-5-a', value: 5, stale: true };
  const currentHandCard = { instanceId: 'road-5-a', value: 5, stale: false };
  const result = decide({
    focusedRoadCard: staleFocus,
    compatibleRoadCards: [staleFocus],
    handRoadCards: [currentHandCard]
  });
  assert.equal(result.canDecide, true);
  assert.equal(result.decisionRoadCard.stale, false);
  assert.equal(result.decisionRoadCard, currentHandCard);
});

test('primitive legacy Road identities are supported without treating Road value as exact movement matching', () => {
  assert.equal(roadCardIdentity('5'), 'string:5');
  const result = deriveRoadMoveDecision({
    currentPath: ['start', 'step1', 'step2'],
    validity: true,
    focusedRoadCard: null,
    compatibleRoadCards: ['5'],
    handRoadCards: ['5']
  });
  assert.equal(result.canDecide, true);
  assert.equal(result.decisionRoadCard, '5');
});

test('unrelated Battle-card fields cannot influence the Road-move decision projection', () => {
  const base = {
    currentPath: path,
    validity: valid,
    focusedRoadCard: road5,
    compatibleRoadCards: [road3, road5],
    handRoadCards: [road3, road5]
  };
  const withoutBattle = deriveRoadMoveDecision(base);
  const withBattle = deriveRoadMoveDecision({
    ...base,
    battleCard: { id: 'battle-x' },
    battleSelection: 'reserved',
    readyPlan: true
  });
  assert.deepEqual(withBattle, withoutBattle);
});

test('custom identity adapters are allowed for CURRENT hand representations without baking a second card model into this core', () => {
  const identifyRoadCard = (card) => card?.slotKey ?? null;
  const focused = { slotKey: 'slot-2', roadValue: 3 };
  const hand = { slotKey: 'slot-2', roadValue: 3, current: true };
  const result = deriveRoadMoveDecision({
    currentPath: path,
    validity: { legal: true, canStop: true },
    focusedRoadCard: focused,
    compatibleRoadCards: [focused],
    handRoadCards: [hand],
    identifyRoadCard
  });
  assert.equal(result.canDecide, true);
  assert.equal(result.resolution, 'FOCUSED');
  assert.equal(result.decisionRoadCard.current, true);
});
