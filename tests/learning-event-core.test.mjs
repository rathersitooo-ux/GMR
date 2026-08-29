import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COGNITIVE_CATEGORY_CODES,
  LEARNING_EVENT_RESULTS,
  LEARNING_SUBJECTS,
  normalizeLearningEvent,
} from '../browser/learning-event-core.mjs';

function makeEvent(overrides = {}) {
  return {
    eventId: 'event.dino.001',
    sessionKey: 'daily.2026-08-29.a',
    activityId: 'dino.evidence.choice',
    subject: LEARNING_SUBJECTS.NATURAL_SCIENCE,
    cognitiveCategories: ['identify', 'analyze'],
    decisionCode: 'evidence.compare',
    outcomeCode: 'choice.supported',
    result: 'correct',
    evidenceRefs: [{
      id: 'dino.claim.spino.tail',
      version: '2026-08-29',
      provenance: 'source.registry',
      role: 'used',
    }],
    ...overrides,
  };
}

test('all declared learning subjects are accepted', () => {
  for (const subject of Object.values(LEARNING_SUBJECTS)) {
    const event = normalizeLearningEvent(makeEvent({ subject, eventId: `event.${subject}` }));
    assert.equal(event.subject, subject);
  }
});

test('all five cognitive category codes are accepted', () => {
  const event = normalizeLearningEvent(makeEvent({ cognitiveCategories: COGNITIVE_CATEGORY_CODES }));
  assert.deepEqual(event.cognitiveCategories, COGNITIVE_CATEGORY_CODES);
});

test('cognitive categories de-duplicate without reordering first occurrence', () => {
  const event = normalizeLearningEvent(makeEvent({
    cognitiveCategories: ['analyze', 'identify', 'analyze', 'visualize'],
  }));
  assert.deepEqual(event.cognitiveCategories, ['analyze', 'identify', 'visualize']);
});

test('at least one supported cognitive category is required', () => {
  assert.throws(() => normalizeLearningEvent(makeEvent({ cognitiveCategories: [] })), /at least one supported category/);
  assert.throws(() => normalizeLearningEvent(makeEvent({ cognitiveCategories: ['general_intelligence'] })), /unsupported cognitive category/);
});

test('only declared result codes are accepted', () => {
  for (const result of LEARNING_EVENT_RESULTS) {
    assert.equal(normalizeLearningEvent(makeEvent({ result })).result, result);
  }
  assert.throws(() => normalizeLearningEvent(makeEvent({ result: 'improved' })), /unsupported learning event result/);
});

test('unsupported subject fails closed', () => {
  assert.throws(() => normalizeLearningEvent(makeEvent({ subject: 'medical_skill' })), /unsupported learning subject/);
});

test('unknown top-level fields fail closed instead of becoming raw telemetry', () => {
  for (const forbiddenField of ['rawText', 'dialogue', 'answer', 'userId', 'email', 'name', 'reward', 'relationship']) {
    assert.throws(
      () => normalizeLearningEvent(makeEvent({ [forbiddenField]: 'should-not-enter-envelope' })),
      new RegExp(`event\\.${forbiddenField} is not allowed`),
    );
  }
});

test('all identifier-like values are bounded code tokens, not whitespace or email-shaped text', () => {
  assert.throws(() => normalizeLearningEvent(makeEvent({ decisionCode: 'free form sentence' })), /bounded code identifier/);
  assert.throws(() => normalizeLearningEvent(makeEvent({ sessionKey: 'person@example.com' })), /bounded code identifier/);
  assert.throws(() => normalizeLearningEvent(makeEvent({ activityId: `a${'x'.repeat(96)}` })), /bounded code identifier/);
});

test('at least one versioned evidence reference is required', () => {
  assert.throws(() => normalizeLearningEvent(makeEvent({ evidenceRefs: [] })), /at least one versioned evidence reference/);
  assert.throws(() => normalizeLearningEvent(makeEvent({ evidenceRefs: undefined })), /at least one versioned evidence reference/);
});

test('evidence reference requires id, version, provenance and supported role', () => {
  const base = makeEvent().evidenceRefs[0];
  for (const field of ['id', 'version', 'provenance', 'role']) {
    const ref = { ...base };
    delete ref[field];
    assert.throws(() => normalizeLearningEvent(makeEvent({ evidenceRefs: [ref] })), new RegExp(`evidenceRefs\\[0\\]\\.${field}`));
  }
  assert.throws(
    () => normalizeLearningEvent(makeEvent({ evidenceRefs: [{ ...base, role: 'authority' }] })),
    /role is unsupported/,
  );
});

test('unknown evidence fields fail closed', () => {
  const ref = { ...makeEvent().evidenceRefs[0], quote: 'raw source quote' };
  assert.throws(() => normalizeLearningEvent(makeEvent({ evidenceRefs: [ref] })), /quote is not allowed/);
});

test('duplicate evidence references are rejected', () => {
  const ref = makeEvent().evidenceRefs[0];
  assert.throws(() => normalizeLearningEvent(makeEvent({ evidenceRefs: [ref, { ...ref }] })), /duplicate evidenceRefs/);
});

test('same evidence identity may appear with distinct roles when semantically distinct', () => {
  const ref = makeEvent().evidenceRefs[0];
  const event = normalizeLearningEvent(makeEvent({
    evidenceRefs: [ref, { ...ref, role: 'corrective' }],
  }));
  assert.equal(event.evidenceRefs.length, 2);
});

test('normalized event preserves coded identity and provenance but makes no learning or real-skill claim', () => {
  const event = normalizeLearningEvent(makeEvent());
  assert.equal(event.schemaVersion, 'learning-event-v1');
  assert.equal(event.eventId, 'event.dino.001');
  assert.equal(event.activityId, 'dino.evidence.choice');
  assert.equal(event.evidenceRefs[0].version, '2026-08-29');
  assert.equal(event.evidenceRefs[0].provenance, 'source.registry');
  assert.equal(event.learningOutcome, 'UNMEASURED');
  assert.equal(event.realSkillOutcome, 'UNMEASURED');
  assert.equal(event.privacyBoundary, 'CODED_FIELDS_ONLY');
});

test('normalized products expose no gameplay, relationship, reward or educational-effect authority fields', () => {
  const event = normalizeLearningEvent(makeEvent());
  const serialized = JSON.stringify(event).toLowerCase();
  for (const forbidden of [
    'battlepower', 'rewardamount', 'relationshipdelta', 'iqscore', 'brainage',
    'gradeimprovement', 'fartransfer', 'learned:true', 'realskill:true',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('normalization never mutates input objects or arrays', () => {
  const raw = makeEvent();
  raw.cognitiveCategories = ['identify', 'identify', 'analyze'];
  const before = structuredClone(raw);
  normalizeLearningEvent(raw);
  assert.deepEqual(raw, before);
});

test('normalized envelope and nested arrays/evidence refs are frozen', () => {
  const event = normalizeLearningEvent(makeEvent());
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.cognitiveCategories), true);
  assert.equal(Object.isFrozen(event.evidenceRefs), true);
  assert.equal(Object.isFrozen(event.evidenceRefs[0]), true);
});

test('event input must be an object and required code fields cannot be omitted', () => {
  assert.throws(() => normalizeLearningEvent([]), /event must be an object/);
  assert.throws(() => normalizeLearningEvent({}), /subject must be a bounded code identifier/);
  assert.throws(() => normalizeLearningEvent(makeEvent({ eventId: undefined })), /eventId must be a bounded code identifier/);
});
