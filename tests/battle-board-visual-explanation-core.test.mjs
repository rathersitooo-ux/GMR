import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const corePath = process.env.CORE_UNDER_TEST || path.resolve(import.meta.dirname, '../browser/battle-board-visual-explanation-core.mjs');
const { projectBattleBoardVisualExplanation } = await import(pathToFileURL(corePath).href + `?v=${Date.now()}`);

const valid = ['C:0:0', 'L:1:0', 'L:2:0', 'L:3:0', 'R:1:0'];

function base(overrides = {}) {
  return {
    validPositionIds: valid,
    currentPositionId: 'C:0:0',
    selectedPositionId: 'L:2:0',
    reachablePositionIds: ['L:1:0', 'L:2:0', 'R:1:0'],
    pathPositionIds: ['C:0:0', 'L:1:0', 'L:2:0'],
    undoPositionId: 'L:1:0',
    threatPositionIds: ['L:2:0', 'L:3:0'],
    forecastPositionIds: ['L:3:0'],
    honeyPositionIds: ['L:1:0', 'L:3:0'],
    honeyCollectablePositionIds: ['L:3:0'],
    targetPositionIds: ['L:2:0', 'R:1:0'],
    winFrontierPositionIds: ['R:1:0'],
    invalidPositionIds: ['L:3:0'],
    positionKindByPosition: {
      'C:0:0': 'central',
      'L:1:0': 'road',
      'L:2:0': 'shield',
      'L:3:0': 'corner',
    },
    invalidReasonByPosition: {
      'L:3:0': 'TARGET_BLOCKED',
    },
    targetKindByPosition: {
      'L:2:0': 'shield',
      'R:1:0': 'attack',
    },
    revisionToken: 'state-17',
    currentRevisionToken: 'state-17',
    partnerProjection: {
      schema: 'gameroad.partner-advice-board-projection.v1',
      active: true,
      clear: false,
      targetId: 'L:2:0',
      candidateId: 'card-17',
      presentationRole: 'partner-recommendation',
      autoExecute: false,
    },
    ...overrides,
  };
}

test('projects only canonical ids and keeps semantic channels distinct', () => {
  const out = projectBattleBoardVisualExplanation(base());
  assert.equal(out.ok, true);
  assert.deepEqual(out.channels.current, ['C:0:0']);
  assert.deepEqual(out.channels.selected, ['L:2:0']);
  assert.deepEqual(out.channels.reachable, ['L:1:0', 'L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
  assert.deepEqual(out.channels.undo, ['L:1:0']);
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.forecast, ['L:3:0']);
  assert.deepEqual(out.channels.honey, ['L:1:0', 'L:3:0']);
  assert.deepEqual(out.channels['honey-collectable'], ['L:3:0']);
  assert.deepEqual(out.channels.target, ['L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels['win-frontier'], ['R:1:0']);
  assert.deepEqual(out.channels.invalid, ['L:3:0']);
  assert.equal(out.recommendation.targetId, 'L:2:0');
  for (const ids of Object.values(out.channels)) {
    for (const id of ids) assert.ok(valid.includes(id));
  }
  assert.ok(valid.includes(out.recommendation.targetId));
});

test('preserves overlap instead of destructive precedence', () => {
  const out = projectBattleBoardVisualExplanation(base());
  assert.deepEqual(out.rolesByPosition['L:2:0'], [
    'selected',
    'reachable',
    'path',
    'threat',
    'target',
    'partner-recommendation',
  ]);
  assert.deepEqual(out.rolesByPosition['L:3:0'], [
    'threat',
    'forecast',
    'honey',
    'honey-collectable',
    'invalid',
  ]);
  assert.deepEqual(out.rolesByPosition['R:1:0'], [
    'reachable',
    'target',
    'win-frontier',
  ]);
});

test('projects caller-supplied board topology without parsing position ids', () => {
  const out = projectBattleBoardVisualExplanation(base());
  assert.deepEqual(out.annotations.positionKindByPosition, {
    'C:0:0': 'central',
    'L:1:0': 'road',
    'L:2:0': 'shield',
    'L:3:0': 'corner',
  });
  assert.equal(out.authorityByRole['position-kind'], 'rules-derived');

  const noKinds = projectBattleBoardVisualExplanation(base({ positionKindByPosition: null }));
  assert.deepEqual(noKinds.annotations.positionKindByPosition, {});
});

test('rejects invalid or unmapped board topology metadata', () => {
  for (const positionKindByPosition of [
    { 'L:1:0': 'not-a-kind' },
    { 'NOT:A:POSITION': 'road' },
    ['road'],
  ]) {
    const out = projectBattleBoardVisualExplanation(base({ positionKindByPosition }));
    assert.equal(out.ok, false);
    assert.deepEqual(out.annotations.positionKindByPosition, {});
  }
});

test('keeps honey presence distinct from currently collectable honey', () => {
  const out = projectBattleBoardVisualExplanation(base({
    honeyPositionIds: ['L:3:0', 'L:1:0'],
    honeyCollectablePositionIds: ['L:3:0'],
  }));
  assert.deepEqual(out.channels.honey, ['L:1:0', 'L:3:0']);
  assert.deepEqual(out.channels['honey-collectable'], ['L:3:0']);
  assert.equal(out.authorityByRole['honey-collectable'], 'rules-derived');
});

test('projects one-step undo and victory frontier as rules-derived roles only', () => {
  const out = projectBattleBoardVisualExplanation(base({
    undoPositionId: 'L:1:0',
    winFrontierPositionIds: ['R:1:0', 'R:1:0'],
  }));
  assert.deepEqual(out.channels.undo, ['L:1:0']);
  assert.deepEqual(out.channels['win-frontier'], ['R:1:0']);
  assert.equal(out.authorityByRole.undo, 'rules-derived');
  assert.equal(out.authorityByRole['win-frontier'], 'rules-derived');
});

test('invalid reasons annotate only already-invalid positions', () => {
  const out = projectBattleBoardVisualExplanation(base({
    invalidPositionIds: ['L:3:0'],
    invalidReasonByPosition: { 'L:3:0': 'TARGET_BLOCKED' },
  }));
  assert.deepEqual(out.annotations.invalidReasonByPosition, { 'L:3:0': 'TARGET_BLOCKED' });
  assert.equal(out.authorityByRole['invalid-reason'], 'rules-derived');

  const dangling = projectBattleBoardVisualExplanation(base({
    invalidPositionIds: [],
    invalidReasonByPosition: { 'L:3:0': 'TARGET_BLOCKED' },
  }));
  assert.equal(dangling.ok, false);
  assert.equal(dangling.reason, 'INVALID_REASON_WITHOUT_INVALID_ROLE');
  assert.deepEqual(dangling.annotations.invalidReasonByPosition, {});
});

test('classifies only already-targeted positions by target kind', () => {
  const out = projectBattleBoardVisualExplanation(base({
    targetPositionIds: ['L:2:0', 'R:1:0'],
    targetKindByPosition: {
      'L:2:0': 'shield',
      'R:1:0': 'attack',
    },
  }));
  assert.deepEqual(out.annotations.targetKindByPosition, {
    'L:2:0': 'shield',
    'R:1:0': 'attack',
  });

  const lane = projectBattleBoardVisualExplanation(base({
    targetPositionIds: ['L:3:0'],
    targetKindByPosition: { 'L:3:0': 'lane' },
  }));
  assert.deepEqual(lane.annotations.targetKindByPosition, { 'L:3:0': 'lane' });

  for (const targetKindByPosition of [
    { 'L:1:0': 'attack' },
    { 'L:2:0': 'not-a-target-kind' },
    { 'NOT:A:POSITION': 'attack' },
  ]) {
    const failed = projectBattleBoardVisualExplanation(base({ targetKindByPosition }));
    assert.equal(failed.ok, false);
    assert.deepEqual(failed.annotations.targetKindByPosition, {});
  }
});

test('partner recommendation never becomes selected state, path, or rules target', () => {
  const out = projectBattleBoardVisualExplanation(base({
    selectedPositionId: 'L:1:0',
    pathPositionIds: ['C:0:0', 'L:1:0'],
    targetPositionIds: ['L:3:0'],
    targetKindByPosition: { 'L:3:0': 'attack' },
    partnerProjection: {
      ...base().partnerProjection,
      targetId: 'R:1:0',
    },
  }));
  assert.deepEqual(out.channels.selected, ['L:1:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0']);
  assert.deepEqual(out.channels.target, ['L:3:0']);
  assert.equal(out.recommendation.targetId, 'R:1:0');
  assert.equal(out.authorityByRole.selected, 'rules-derived');
  assert.equal(out.authorityByRole.target, 'rules-derived');
  assert.equal(out.authorityByRole['partner-recommendation'], 'partner-heuristic');
});

test('invalid rules-derived id fails the whole rules projection closed', () => {
  const out = projectBattleBoardVisualExplanation(base({
    reachablePositionIds: ['L:1:0', 'NOT:A:POSITION'],
  }));
  assert.equal(out.ok, false);
  assert.equal(out.clear, true);
  assert.equal(out.reason, 'UNKNOWN_POSITION_ID');
  assert.deepEqual(out.channels.reachable, []);
  assert.deepEqual(out.channels.honey, []);
  assert.deepEqual(out.channels.target, []);
  assert.deepEqual(out.annotations.positionKindByPosition, {});
  assert.equal(out.recommendation.active, false);
});

test('honey target and invalid channels are projections only and canonicalized', () => {
  const out = projectBattleBoardVisualExplanation(base({
    honeyPositionIds: ['L:3:0', 'L:1:0', 'L:3:0'],
    targetPositionIds: ['R:1:0', 'L:2:0', 'R:1:0'],
    invalidPositionIds: ['L:3:0', 'L:3:0'],
  }));
  assert.equal(out.ok, true);
  assert.deepEqual(out.channels.honey, ['L:1:0', 'L:3:0']);
  assert.deepEqual(out.channels.target, ['L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.invalid, ['L:3:0']);
  assert.equal(out.authorityByRole.honey, 'rules-derived');
  assert.equal(out.authorityByRole.target, 'rules-derived');
  assert.equal(out.authorityByRole.invalid, 'rules-derived');
});

test('unknown partner target clears only recommendation', () => {
  const out = projectBattleBoardVisualExplanation(base({
    partnerProjection: {
      ...base().partnerProjection,
      targetId: 'NOT:A:POSITION',
    },
  }));
  assert.equal(out.ok, true);
  assert.deepEqual(out.channels.selected, ['L:2:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
  assert.deepEqual(out.channels.target, ['L:2:0', 'R:1:0']);
  assert.equal(out.recommendation.active, false);
  assert.equal(out.recommendation.clearReason, 'RECOMMENDATION_TARGET_UNMAPPED');
});

test('inactive or malformed advice clears recommendation only', () => {
  for (const partnerProjection of [
    null,
    { schema: 'wrong', active: true, clear: false, targetId: 'L:2:0', presentationRole: 'partner-recommendation', autoExecute: false },
    { ...base().partnerProjection, active: false, clear: true },
    { ...base().partnerProjection, autoExecute: true },
    { ...base().partnerProjection, presentationRole: 'selected' },
  ]) {
    const out = projectBattleBoardVisualExplanation(base({ partnerProjection }));
    assert.equal(out.ok, true);
    assert.deepEqual(out.channels.current, ['C:0:0']);
    assert.deepEqual(out.channels.honey, ['L:1:0', 'L:3:0']);
    assert.equal(out.recommendation.active, false);
  }
});

test('stale board revision clears all presentation state', () => {
  const out = projectBattleBoardVisualExplanation(base({ currentRevisionToken: 'state-18' }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'STALE_BOARD_STATE');
  assert.deepEqual(out.channels.current, []);
  assert.deepEqual(out.channels.path, []);
  assert.deepEqual(out.channels.undo, []);
  assert.deepEqual(out.channels.honey, []);
  assert.deepEqual(out.channels['honey-collectable'], []);
  assert.deepEqual(out.channels.target, []);
  assert.deepEqual(out.channels['win-frontier'], []);
  assert.deepEqual(out.channels.invalid, []);
  assert.deepEqual(out.annotations.positionKindByPosition, {});
  assert.deepEqual(out.annotations.invalidReasonByPosition, {});
  assert.deepEqual(out.annotations.targetKindByPosition, {});
  assert.equal(out.recommendation.active, false);
});

test('dedupes set-like channels deterministically while preserving path order', () => {
  const out = projectBattleBoardVisualExplanation(base({
    reachablePositionIds: ['R:1:0', 'L:1:0', 'R:1:0', 'L:2:0'],
    threatPositionIds: ['L:3:0', 'L:2:0', 'L:3:0'],
    pathPositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:2:0'],
    honeyCollectablePositionIds: ['L:3:0', 'L:3:0'],
    winFrontierPositionIds: ['R:1:0', 'R:1:0'],
  }));
  assert.deepEqual(out.channels.reachable, ['L:1:0', 'L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
  assert.deepEqual(out.channels['honey-collectable'], ['L:3:0']);
  assert.deepEqual(out.channels['win-frontier'], ['R:1:0']);
});

test('does not bake visual skin tokens or infer topology into semantic output', () => {
  const out = projectBattleBoardVisualExplanation(base());
  const text = JSON.stringify(out);
  for (const forbidden of ['className', 'style', 'background', 'borderColor', 'fontFamily', 'px', '#fff', '#000']) {
    assert.equal(text.includes(forbidden), false, `forbidden presentation skin token: ${forbidden}`);
  }
  assert.equal(out.annotations.positionKindByPosition['R:1:0'], undefined);
});

test('empty canonical position set fails closed', () => {
  const out = projectBattleBoardVisualExplanation(base({ validPositionIds: [] }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'NO_VALID_POSITIONS');
  assert.deepEqual(out.annotations.positionKindByPosition, {});
});
