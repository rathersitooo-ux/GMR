import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_PRESENTATION_CORE,
  applyCardPresentationEvent,
  createCardPresentationSession,
} from '../browser/card-presentation-core.mjs';

function event(overrides = {}) {
  return {
    sessionId: 'session-a',
    eventId: 'event-1',
    authorized: true,
    visibility: 'public',
    kind: 'scan',
    assets: {
      visual: { status: 'formal', assetId: 'formal-visual-1' },
      audio: { status: 'formal', assetId: 'formal-audio-1' },
    },
    ...overrides,
  };
}

test('accepts an already-authorized public event and produces only a display plan', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });
  const result = applyCardPresentationEvent(state, event());

  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.plan.schema, CARD_PRESENTATION_CORE.schema);
  assert.equal(result.plan.kind, 'scan');
  assert.equal(result.plan.visibility, 'public');
  assert.equal(result.plan.presentationOnly, true);
  assert.deepEqual(result.plan.visual, {
    source: 'formal',
    assetId: 'formal-visual-1',
    motion: 'allowed',
  });
  assert.deepEqual(result.plan.audio, { source: 'formal', assetId: 'formal-audio-1' });
  assert.deepEqual(result.state.seenEventIds, ['event-1']);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.plan));
});

test('fails closed for unauthorized or malformed visibility and owner scope', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });

  assert.equal(applyCardPresentationEvent(state, event({ authorized: false })).reason, 'NOT_AUTHORIZED');
  assert.equal(applyCardPresentationEvent(state, event({ visibility: 'private' })).reason, 'VISIBILITY_INVALID');
  assert.equal(applyCardPresentationEvent(state, event({ visibility: 'owner' })).reason, 'OWNER_SCOPE_NOT_AUTHORIZED');

  const owner = applyCardPresentationEvent(state, event({ visibility: 'owner', ownerAuthorized: true }));
  assert.equal(owner.accepted, true);
  assert.equal(owner.plan.visibility, 'owner');
});

test('deduplicates by session plus event identity without replaying presentation', () => {
  let state = createCardPresentationSession({ sessionId: 'session-a' });
  const first = applyCardPresentationEvent(state, event());
  state = first.state;

  const duplicate = applyCardPresentationEvent(state, event());
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.reason, 'DUPLICATE_EVENT');
  assert.equal(duplicate.plan, null);
  assert.equal(duplicate.state, state);

  const otherSession = createCardPresentationSession({ sessionId: 'session-b' });
  const acceptedElsewhere = applyCardPresentationEvent(otherSession, event({ sessionId: 'session-b' }));
  assert.equal(acceptedElsewhere.accepted, true);
  assert.equal(acceptedElsewhere.duplicate, false);
});

test('rejects stale or foreign-session and malformed events without consuming their event ids', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });

  const foreign = applyCardPresentationEvent(state, event({ sessionId: 'old-session' }));
  assert.equal(foreign.accepted, false);
  assert.equal(foreign.reason, 'SESSION_MISMATCH');
  assert.deepEqual(foreign.state.seenEventIds, []);

  assert.equal(applyCardPresentationEvent(state, null).reason, 'EVENT_INVALID');
  assert.equal(applyCardPresentationEvent(state, event({ eventId: '' })).reason, 'EVENT_ID_REQUIRED');
  assert.equal(applyCardPresentationEvent(state, event({ kind: 'damage' })).reason, 'KIND_INVALID');
  assert.throws(() => createCardPresentationSession({ sessionId: '' }), /SESSION_ID_REQUIRED/);
});

test('keeps only caller-marked formal asset ids and strips candidate or missing ids into fallback', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });
  const result = applyCardPresentationEvent(state, event({
    assets: {
      visual: { status: 'candidate', assetId: 'candidate-visual-must-not-escape' },
      audio: { status: 'missing', assetId: 'missing-audio-must-not-escape' },
    },
  }));

  assert.deepEqual(result.plan.visual, { source: 'fallback', motion: 'allowed' });
  assert.deepEqual(result.plan.audio, { source: 'silent' });
  assert.equal(JSON.stringify(result).includes('candidate-visual-must-not-escape'), false);
  assert.equal(JSON.stringify(result).includes('missing-audio-must-not-escape'), false);
});

test('reduced motion, low performance, animation off, and audio off only degrade presentation channels', () => {
  const baseState = createCardPresentationSession({ sessionId: 'session-a' });
  const baseEvent = event({ kind: 'finisher' });

  const reduced = applyCardPresentationEvent(baseState, baseEvent, { reducedMotion: true });
  assert.equal(reduced.plan.kind, 'finisher');
  assert.equal(reduced.plan.visual.motion, 'static_only');
  assert.equal(reduced.plan.audio.source, 'formal');

  const low = applyCardPresentationEvent(baseState, baseEvent, { lowPerf: true });
  assert.equal(low.plan.kind, 'finisher');
  assert.equal(low.plan.visual.motion, 'static_only');

  const noAnimation = applyCardPresentationEvent(baseState, baseEvent, { animationEnabled: false });
  assert.equal(noAnimation.plan.kind, 'finisher');
  assert.equal(noAnimation.plan.visual.motion, 'static_only');

  const silent = applyCardPresentationEvent(baseState, baseEvent, { audioEnabled: false });
  assert.equal(silent.plan.kind, 'finisher');
  assert.deepEqual(silent.plan.audio, { source: 'silent' });
  assert.equal(silent.plan.visual.source, 'formal');
});

test('never echoes gameplay mutation fields from presentation input', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });
  const result = applyCardPresentationEvent(state, event({
    damage: 999,
    mana: 999,
    target: 'P4',
    rng: 0.123,
    save: { overwrite: true },
    rank: 1,
    zone: 'secret',
    payload: { cardEffect: 'rewrite-rules', winner: 'P1' },
  }));

  const encoded = JSON.stringify(result.plan);
  for (const forbidden of ['damage', 'mana', 'target', 'rng', 'save', 'rank', 'zone', 'cardEffect', 'winner', 'payload']) {
    assert.equal(encoded.includes(forbidden), false, `plan must not expose ${forbidden}`);
  }
});

test('does not mutate caller state, event, or preference inputs', () => {
  const state = createCardPresentationSession({ sessionId: 'session-a' });
  const sourceEvent = event();
  const prefs = { reducedMotion: true, audioEnabled: false };
  const beforeEvent = structuredClone(sourceEvent);
  const beforePrefs = structuredClone(prefs);

  const result = applyCardPresentationEvent(state, sourceEvent, prefs);

  assert.deepEqual(sourceEvent, beforeEvent);
  assert.deepEqual(prefs, beforePrefs);
  assert.deepEqual(state.seenEventIds, []);
  assert.deepEqual(result.state.seenEventIds, ['event-1']);
});

test('supports only the presentation kinds owned by this isolated card-presentation task', () => {
  assert.deepEqual(CARD_PRESENTATION_CORE.presentationKinds, ['scan', 'summon', 'finisher', 'vfx', 'sfx']);

  for (const [index, kind] of CARD_PRESENTATION_CORE.presentationKinds.entries()) {
    const state = createCardPresentationSession({ sessionId: `session-${index}` });
    const result = applyCardPresentationEvent(state, event({
      sessionId: `session-${index}`,
      eventId: `event-${index}`,
      kind,
    }));
    assert.equal(result.accepted, true);
    assert.equal(result.plan.kind, kind);
  }
});
