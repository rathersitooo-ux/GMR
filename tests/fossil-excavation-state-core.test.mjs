import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOSSIL_EXCAVATION_STATE_CORE,
  consumeFossilsForRestoration,
  createFossilExcavationState,
  findRestorationChoices,
  issueFossilsFromExcavation,
  listAvailableFossils,
  loadFossilExcavationState,
  projectFossilExcavationPresentation,
  projectFossilRestorationPresentation,
  sampleFossilCount,
  sampleRestorationValue,
  serializeFossilExcavationState,
} from '../browser/fossil-excavation-state-core.mjs';

function issue(state, {
  excavationId = 'exc-1',
  stratumId = 'stratum-1',
  ownerId = 'p1',
  round = 4,
  stopAuthorized = true,
  countRoll = 0.80,
  valueRolls = [0.10, 0.70, 0.95, 0.20, 0.40],
} = {}) {
  return issueFossilsFromExcavation(state, {
    excavationId,
    stratumId,
    ownerId,
    round,
    stopAuthorized,
    countRoll,
    valueRolls,
  });
}

function stateWithValues(values, ownerId = 'p1') {
  let state = createFossilExcavationState({ matchId: 'match-choice' });
  values.forEach((value, index) => {
    const valueRoll = value === 1 ? 0.10 : value === 2 ? 0.70 : 0.95;
    state = issue(state, {
      excavationId: `exc-${index + 1}`,
      stratumId: `stratum-${index + 1}`,
      ownerId,
      round: index + 1,
      countRoll: 0.10,
      valueRolls: [valueRoll],
    }).state;
  });
  return state;
}

test('distribution boundary mapping is exact and contains no zero or overflow result', () => {
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.schema, 'gameroad.fossil-excavation-state.v1');
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.ownsRandomness, false);
  assert.deepEqual(
    [0, 0.749999, 0.75, 0.929999, 0.93, 0.979999, 0.98, 0.994999, 0.995, 0.999999].map(sampleFossilCount),
    [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
  );
  assert.deepEqual(
    [0, 0.599999, 0.60, 0.899999, 0.90, 0.999999].map(sampleRestorationValue),
    [1, 1, 2, 2, 3, 3],
  );
  assert.throws(() => sampleFossilCount(1), /COUNTROLL_INVALID/);
  assert.throws(() => sampleRestorationValue(-0.01), /VALUEROLL_INVALID/);
});

test('caller-authorized excavation issues deterministic fossils with primitive provenance only once', () => {
  const initial = createFossilExcavationState({ matchId: 'match-a' });
  const rejected = issue(initial, { stopAuthorized: false });
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.reason, 'STOP_NOT_AUTHORIZED');
  assert.strictEqual(rejected.state, initial);

  const accepted = issue(initial);
  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.effects.count, 2);
  assert.deepEqual(accepted.effects.fossilIds, [
    'fossil:match-a:exc-1:1',
    'fossil:match-a:exc-1:2',
  ]);
  assert.deepEqual(listAvailableFossils(accepted.state), [
    {
      id: 'fossil:match-a:exc-1:1',
      excavationId: 'exc-1',
      stratumId: 'stratum-1',
      ownerId: 'p1',
      excavatedRound: 4,
      restorationValue: 1,
    },
    {
      id: 'fossil:match-a:exc-1:2',
      excavationId: 'exc-1',
      stratumId: 'stratum-1',
      ownerId: 'p1',
      excavatedRound: 4,
      restorationValue: 2,
    },
  ]);
  assert.equal(Object.isFrozen(accepted.state), true);
  assert.equal(Object.isFrozen(accepted.state.excavations[0].fossils[0]), true);
});

test('event replay and alternate event for an already excavated stratum cannot double issue', () => {
  const initial = createFossilExcavationState({ matchId: 'match-idempotent' });
  const first = issue(initial).state;
  const replay = issue(first);
  assert.equal(replay.status, 'duplicate');
  assert.equal(replay.reason, 'EXCAVATION_ALREADY_APPLIED');
  assert.strictEqual(replay.state, first);
  assert.deepEqual(replay.effects.fossilIds, first.availableFossilIds);

  const alternate = issue(first, { excavationId: 'exc-other', stratumId: 'stratum-1' });
  assert.equal(alternate.status, 'duplicate');
  assert.equal(alternate.reason, 'STRATUM_ALREADY_EXCAVATED');
  assert.strictEqual(alternate.state, first);
  assert.equal(first.excavations.length, 1);
});

test('serialized reload preserves excavation idempotence and deterministic state bytes', () => {
  const baseA = createFossilExcavationState({ matchId: 'match-reload' });
  const baseB = createFossilExcavationState({ matchId: 'match-reload' });
  const stateA = issue(baseA).state;
  const stateB = issue(baseB).state;
  assert.deepEqual(serializeFossilExcavationState(stateA), serializeFossilExcavationState(stateB));

  const snapshot = JSON.parse(JSON.stringify(serializeFossilExcavationState(stateA)));
  const loaded = loadFossilExcavationState(snapshot);
  assert.deepEqual(serializeFossilExcavationState(loaded), snapshot);
  const replay = issue(loaded);
  assert.equal(replay.status, 'duplicate');
  assert.strictEqual(replay.state, loaded);
});

test('restoration choices enumerate only owner fossils whose one-to-three values exactly match X', () => {
  let state = stateWithValues([1, 1, 1, 2, 3]);
  state = issue(state, {
    excavationId: 'other-exc',
    stratumId: 'other-stratum',
    ownerId: 'p2',
    round: 7,
    countRoll: 0.10,
    valueRolls: [0.95],
  }).state;

  const choices = findRestorationChoices(state, { ownerId: 'p1', targetValue: 3 });
  assert.ok(choices.length >= 3);
  assert.ok(choices.every(choice => choice.fossilIds.length >= 1 && choice.fossilIds.length <= 3));
  assert.ok(choices.every(choice => choice.totalValue === 3));
  assert.ok(choices.some(choice => choice.restorationValues.length === 1 && choice.restorationValues[0] === 3));
  assert.ok(choices.some(choice => choice.restorationValues.length === 2 && choice.restorationValues.reduce((a, b) => a + b, 0) === 3));
  assert.ok(choices.some(choice => choice.restorationValues.length === 3 && choice.restorationValues.every(value => value === 1)));
  const p2Id = listAvailableFossils(state, { ownerId: 'p2' })[0].id;
  assert.ok(choices.every(choice => !choice.fossilIds.includes(p2Id)));
});

test('valid restoration consumes selected fossils once and writes an immutable primitive provenance record', () => {
  const issued = issue(createFossilExcavationState({ matchId: 'match-restore' })).state;
  const fossils = listAvailableFossils(issued, { ownerId: 'p1' });
  const result = consumeFossilsForRestoration(issued, {
    restorationId: 'restore-1',
    ownerId: 'p1',
    dinosaurCardId: 'dino-test-1',
    dinosaurSource: 'graveyard',
    round: 4,
    phase: 'battle-card-select',
    sequence: 1,
    targetValue: 3,
    fossilIds: fossils.map(fossil => fossil.id),
    restorationAuthorized: true,
  });
  assert.equal(result.status, 'accepted');
  assert.equal(result.reason, 'RESTORATION_COMMITTED');
  assert.deepEqual(listAvailableFossils(result.state), []);
  assert.equal(result.state.restorations.length, 1);
  assert.deepEqual(result.state.restorations[0], {
    restorationId: 'restore-1',
    matchId: 'match-restore',
    round: 4,
    phase: 'battle-card-select',
    sequence: 1,
    ownerId: 'p1',
    dinosaurCardId: 'dino-test-1',
    dinosaurSource: 'graveyard',
    fossils,
    totalValue: 3,
    success: true,
  });
  assert.notStrictEqual(result.state.restorations[0].fossils[0], result.state.excavations[0].fossils[0]);
  assert.equal(Object.isFrozen(result.state.restorations[0]), true);
  assert.equal(Object.isFrozen(result.state.restorations[0].fossils[0]), true);
});

test('invalid restoration authorization, ownership, count, duplicate ids, and sum mismatch are no-mutation', () => {
  let state = issue(createFossilExcavationState({ matchId: 'match-reject' })).state;
  state = issue(state, {
    excavationId: 'exc-p2',
    stratumId: 'stratum-p2',
    ownerId: 'p2',
    round: 5,
    countRoll: 0.10,
    valueRolls: [0.10],
  }).state;
  const p1 = listAvailableFossils(state, { ownerId: 'p1' });
  const p2 = listAvailableFossils(state, { ownerId: 'p2' });
  const command = {
    restorationId: 'restore-invalid',
    ownerId: 'p1',
    dinosaurCardId: 'dino-test',
    dinosaurSource: 'hand',
    round: 5,
    phase: 'battle-card-select',
    sequence: 2,
    targetValue: 3,
    fossilIds: p1.map(fossil => fossil.id),
    restorationAuthorized: true,
  };

  const unauthorized = consumeFossilsForRestoration(state, { ...command, restorationAuthorized: false });
  assert.equal(unauthorized.reason, 'RESTORATION_NOT_AUTHORIZED');
  assert.strictEqual(unauthorized.state, state);

  const otherOwner = consumeFossilsForRestoration(state, { ...command, fossilIds: [p2[0].id], targetValue: 1 });
  assert.equal(otherOwner.reason, 'FOSSIL_NOT_OWNED');
  assert.strictEqual(otherOwner.state, state);

  const empty = consumeFossilsForRestoration(state, { ...command, fossilIds: [] });
  assert.equal(empty.reason, 'FOSSIL_SELECTION_COUNT_INVALID');
  assert.strictEqual(empty.state, state);

  const four = consumeFossilsForRestoration(state, { ...command, fossilIds: [p1[0].id, p1[1].id, p2[0].id, 'missing'] });
  assert.equal(four.reason, 'FOSSIL_SELECTION_COUNT_INVALID');
  assert.strictEqual(four.state, state);

  const duplicateIds = consumeFossilsForRestoration(state, { ...command, fossilIds: [p1[0].id, p1[0].id] });
  assert.equal(duplicateIds.reason, 'FOSSIL_SELECTION_IDS_INVALID');
  assert.strictEqual(duplicateIds.state, state);

  const mismatch = consumeFossilsForRestoration(state, { ...command, fossilIds: [p1[0].id], targetValue: 3 });
  assert.equal(mismatch.reason, 'RESTORATION_VALUE_MISMATCH');
  assert.strictEqual(mismatch.state, state);
});

test('restoration replay remains duplicate after JSON reload and cannot consume a second time', () => {
  const issued = issue(createFossilExcavationState({ matchId: 'match-restore-replay' })).state;
  const fossilIds = listAvailableFossils(issued).map(fossil => fossil.id);
  const command = {
    restorationId: 'restore-replay',
    ownerId: 'p1',
    dinosaurCardId: 'dino-test',
    dinosaurSource: 'hand',
    round: 4,
    phase: 'battle-card-select',
    sequence: 3,
    targetValue: 3,
    fossilIds,
    restorationAuthorized: true,
  };
  const committed = consumeFossilsForRestoration(issued, command).state;
  const loaded = loadFossilExcavationState(JSON.parse(JSON.stringify(serializeFossilExcavationState(committed))));
  const replay = consumeFossilsForRestoration(loaded, command);
  assert.equal(replay.status, 'duplicate');
  assert.equal(replay.reason, 'RESTORATION_ALREADY_APPLIED');
  assert.strictEqual(replay.state, loaded);
  assert.equal(replay.state.restorations.length, 1);
  assert.deepEqual(listAvailableFossils(replay.state), []);
});

test('excavation presentation is owner-scoped, immutable, and preserves source state bytes', () => {
  let state = stateWithValues([1, 2], 'p1');
  state = issue(state, {
    excavationId: 'p2-exc',
    stratumId: 'p2-stratum',
    ownerId: 'p2',
    round: 8,
    countRoll: 0.10,
    valueRolls: [0.95],
  }).state;
  const before = JSON.stringify(serializeFossilExcavationState(state));
  const projection = projectFossilExcavationPresentation(state, { ownerId: 'p1' });

  assert.equal(projection.schema, 'gameroad.fossil-presentation.v1');
  assert.equal(projection.view, 'FOSSIL_EXCAVATION');
  assert.equal(projection.ownerId, 'p1');
  assert.equal(projection.excavationCount, 2);
  assert.equal(projection.latestExcavation.stratumId, 'stratum-2');
  assert.equal(projection.inventory.availableCount, 2);
  assert.deepEqual(projection.inventory.restorationValueCounts, [
    { value: 1, count: 1 },
    { value: 2, count: 1 },
    { value: 3, count: 0 },
  ]);
  assert.ok(projection.inventory.fossils.every(fossil => fossil.ownerId === 'p1'));
  assert.ok(projection.latestExcavation.fossilIds.every(id => !id.includes('p2-exc')));
  assert.equal(projection.authority.presentationOnly, true);
  assert.equal(projection.authority.ownsDinosaurEvidenceClassification, false);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.inventory.fossils[0]), true);
  assert.equal(JSON.stringify(serializeFossilExcavationState(state)), before);
});

test('restoration presentation never invents a target and only exposes caller-targeted value matches', () => {
  const state = stateWithValues([1, 2, 3], 'p1');
  const before = JSON.stringify(serializeFossilExcavationState(state));
  const noTarget = projectFossilRestorationPresentation(state, { ownerId: 'p1' });
  assert.equal(noTarget.requestedTargetValue, null);
  assert.equal(noTarget.targetSource, 'not-provided');
  assert.deepEqual(noTarget.valueMatchChoices, []);

  const target3 = projectFossilRestorationPresentation(state, { ownerId: 'p1', targetValue: 3 });
  const target4 = projectFossilRestorationPresentation(state, { ownerId: 'p1', targetValue: 4 });
  assert.equal(target3.targetSource, 'caller');
  assert.ok(target3.valueMatchChoices.length > 0);
  assert.ok(target4.valueMatchChoices.length > 0);
  assert.ok(target3.valueMatchChoices.every(choice => choice.totalValue === 3));
  assert.ok(target4.valueMatchChoices.every(choice => choice.totalValue === 4));
  assert.notDeepEqual(target3.valueMatchChoices, target4.valueMatchChoices);
  assert.equal(JSON.stringify(serializeFossilExcavationState(state)), before);
});

test('restoration presentation cannot leak another owner fossils, choices, or committed history', () => {
  let state = stateWithValues([1, 2], 'p1');
  state = issue(state, {
    excavationId: 'p2-exc',
    stratumId: 'p2-stratum',
    ownerId: 'p2',
    round: 7,
    countRoll: 0.10,
    valueRolls: [0.10],
  }).state;

  const p1Ids = listAvailableFossils(state, { ownerId: 'p1' }).map(fossil => fossil.id);
  state = consumeFossilsForRestoration(state, {
    restorationId: 'p1-restore',
    ownerId: 'p1',
    dinosaurCardId: 'dino-p1',
    dinosaurSource: 'hand',
    round: 8,
    phase: 'caller-authoritative-phase',
    sequence: 1,
    targetValue: 3,
    fossilIds: p1Ids,
    restorationAuthorized: true,
  }).state;

  const p2Id = listAvailableFossils(state, { ownerId: 'p2' })[0].id;
  state = consumeFossilsForRestoration(state, {
    restorationId: 'p2-restore',
    ownerId: 'p2',
    dinosaurCardId: 'dino-p2',
    dinosaurSource: 'graveyard',
    round: 9,
    phase: 'caller-authoritative-phase',
    sequence: 2,
    targetValue: 1,
    fossilIds: [p2Id],
    restorationAuthorized: true,
  }).state;

  const projection = projectFossilRestorationPresentation(state, { ownerId: 'p1', targetValue: 3 });
  assert.deepEqual(projection.inventory.fossils, []);
  assert.deepEqual(projection.valueMatchChoices, []);
  assert.equal(projection.history.length, 1);
  assert.equal(projection.history[0].restorationId, 'p1-restore');
  assert.equal(projection.history[0].dinosaurCardId, 'dino-p1');
  assert.ok(projection.history[0].fossils.every(fossil => fossil.ownerId === 'p1'));
  assert.equal(JSON.stringify(projection).includes('p2-restore'), false);
  assert.equal(JSON.stringify(projection).includes('dino-p2'), false);
});

test('presentation projection fails closed for missing owner and invalid caller target without mutating state', () => {
  const state = stateWithValues([1, 2], 'p1');
  const before = JSON.stringify(serializeFossilExcavationState(state));
  assert.throws(() => projectFossilExcavationPresentation(state), /OWNERID_REQUIRED/);
  assert.throws(() => projectFossilRestorationPresentation(state, { ownerId: '' }), /OWNERID_REQUIRED/);
  assert.throws(() => projectFossilRestorationPresentation(state, { ownerId: 'p1', targetValue: 0 }), /TARGETVALUE_INVALID/);
  assert.equal(JSON.stringify(serializeFossilExcavationState(state)), before);
});

test('presentation capability metadata explicitly refuses rule, persistence, evidence, and asset authority', () => {
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.presentationSchema, 'gameroad.fossil-presentation.v1');
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.ownsRestorationAuthorization, false);
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.ownsDinosaurEvidenceClassification, false);
  assert.equal(FOSSIL_EXCAVATION_STATE_CORE.ownsFormalAssets, false);
});
