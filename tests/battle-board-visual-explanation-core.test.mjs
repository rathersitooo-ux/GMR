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
    threatPositionIds: ['L:2:0', 'L:3:0'],
    forecastPositionIds: ['L:3:0'],
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
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.forecast, ['L:3:0']);
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
    'partner-recommendation',
  ]);
});

test('partner recommendation never becomes selected state or path', () => {
  const out = projectBattleBoardVisualExplanation(base({
    selectedPositionId: 'L:1:0',
    pathPositionIds: ['C:0:0', 'L:1:0'],
    partnerProjection: {
      ...base().partnerProjection,
      targetId: 'R:1:0',
    },
  }));
  assert.deepEqual(out.channels.selected, ['L:1:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0']);
  assert.equal(out.recommendation.targetId, 'R:1:0');
  assert.equal(out.authorityByRole.selected, 'rules-derived');
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
  assert.equal(out.recommendation.active, false);
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
    assert.equal(out.recommendation.active, false);
  }
});

test('stale board revision clears all presentation state', () => {
  const out = projectBattleBoardVisualExplanation(base({ currentRevisionToken: 'state-18' }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'STALE_BOARD_STATE');
  assert.deepEqual(out.channels.current, []);
  assert.deepEqual(out.channels.path, []);
  assert.equal(out.recommendation.active, false);
});

test('dedupes set-like channels deterministically while preserving path order', () => {
  const out = projectBattleBoardVisualExplanation(base({
    reachablePositionIds: ['R:1:0', 'L:1:0', 'R:1:0', 'L:2:0'],
    threatPositionIds: ['L:3:0', 'L:2:0', 'L:3:0'],
    pathPositionIds: ['C:0:0', 'L:1:0', 'L:2:0', 'L:2:0'],
  }));
  assert.deepEqual(out.channels.reachable, ['L:1:0', 'L:2:0', 'R:1:0']);
  assert.deepEqual(out.channels.threat, ['L:2:0', 'L:3:0']);
  assert.deepEqual(out.channels.path, ['C:0:0', 'L:1:0', 'L:2:0']);
});

test('does not bake visual skin tokens into semantic output', () => {
  const out = projectBattleBoardVisualExplanation(base());
  const text = JSON.stringify(out);
  for (const forbidden of ['className', 'style', 'background', 'borderColor', 'fontFamily', 'px', '#fff', '#000']) {
    assert.equal(text.includes(forbidden), false, `forbidden presentation skin token: ${forbidden}`);
  }
});

test('empty canonical position set fails closed', () => {
  const out = projectBattleBoardVisualExplanation(base({ validPositionIds: [] }));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'NO_VALID_POSITIONS');
});
