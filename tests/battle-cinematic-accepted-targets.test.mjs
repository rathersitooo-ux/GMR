import test from 'node:test';
import assert from 'node:assert/strict';
import { selectBattleCinematicAcceptedActors as select } from '../browser/battle-cinematic-accepted-targets.mjs';

function snapshot(ids = ['P2']) {
  return {
    presentationOnly: true, gameplayAuthority: false, gameStateWrite: false,
    screenMode: 'BATTLE_PHASE', battlePhasePresentationMode: 'FULLSCREEN_ANIMATION',
    phase: 'attack', eventId: 'accepted-1',
    focus: { causeId: 'P1', targetIds: ids },
    lanes: ['P1','P2','P3','P4'].map((id) => ({
      id, label: id, role: id === 'P1' ? 'source' : ids.includes(id) ? 'target' : 'idle'
    }))
  };
}

test('single accepted target remains single', () => {
  const x = select(snapshot());
  assert.deepEqual(x.orderedTargetIds, ['P2']);
  assert.equal(x.multiTarget, false);
});

test('two or three accepted targets retain exact event order', () => {
  for (const ids of [['P3','P2'], ['P4','P2','P3']]) {
    const x = select(snapshot(ids));
    assert.deepEqual(x.targets.map(v=>v.id), ids);
    assert.deepEqual(x.orderedTargetIds, ids);
  }
});

test('not based on seat order, inferred target or damaged state', () => {
  const wrong = snapshot(['P2','P3']);
  wrong.focus.targetIds = ['P2','P4'];
  assert.equal(select(wrong), null);
  wrong.focus.targetIds = ['P2','P2'];
  assert.equal(select(wrong), null);
  delete wrong.focus.targetIds;
  assert.equal(select(wrong), null);
});

test('source mismatch, extra game authority and plan state rejected', () => {
  const wrong = snapshot();
  wrong.focus.causeId = 'P4';
  assert.equal(select(wrong), null);
  const other = snapshot();
  other.gameStateWrite = true;
  assert.equal(select(other), null);
  other.gameStateWrite = false;
  other.phase = 'plan';
  assert.equal(select(other), null);
});

test('read-only frozen accepted four-person model', () => {
  const m = snapshot(['P4','P3']);
  Object.freeze(m.focus.targetIds);Object.freeze(m.focus);
  for (const lane of m.lanes) Object.freeze(lane);
  Object.freeze(m.lanes);Object.freeze(m);
  const x = select(m);
  assert.deepEqual(x.orderedTargetIds, ['P4','P3']);
  assert.ok(Object.isFrozen(x.targets));
});
