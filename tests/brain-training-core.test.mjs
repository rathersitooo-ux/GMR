import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAIN_TRAINING_COGNITIVE_AXES,
  BRAIN_TRAINING_SCHEMA_VERSION,
  answerBrainTrainingItem,
  createBrainTrainingSession,
  getNextBrainTrainingItem,
  normalizeBrainTrainingExerciseBank,
  skipBrainTrainingItem,
  summarizeBrainTrainingSession,
} from '../browser/brain-training-core.mjs';

function makeExercise(overrides = {}) {
  return {
    id: 'brain.item.001',
    subject: 'math_logic',
    cognitiveAxis: 'compute',
    prompt: '3 + 4 = ?',
    options: [
      { id: 'a', label: '7' },
      { id: 'b', label: '8' },
    ],
    correctOptionId: 'a',
    source: {
      sourceId: 'curriculum.math.001',
      sourceVersion: 'v1',
      provenance: 'formal_source',
    },
    ...overrides,
  };
}

function bank() {
  return [
    makeExercise(),
    makeExercise({
      id: 'brain.item.002',
      subject: 'natural_science',
      cognitiveAxis: 'identify',
      prompt: 'Which is an insect?',
      options: [
        { id: 'a', label: 'beetle' },
        { id: 'b', label: 'spider' },
      ],
      correctOptionId: 'a',
      source: {
        sourceId: 'curriculum.insect.001',
        sourceVersion: 'v3',
        provenance: 'formal_source',
      },
    }),
  ];
}

test('reuses exactly the five shared cognitive axes', () => {
  assert.deepEqual(BRAIN_TRAINING_COGNITIVE_AXES, ['identify', 'memorize', 'analyze', 'compute', 'visualize']);
});

test('accepts shared broad learning subjects and rejects an independent Brain-only taxonomy', () => {
  const normalized = normalizeBrainTrainingExerciseBank([
    makeExercise({ subject: 'life_science' }),
    makeExercise({ id: 'brain.item.099', subject: 'language_communication' }),
  ]);
  assert.equal(normalized[0].subject, 'life_science');
  assert.equal(normalized[1].subject, 'language_communication');
  assert.throws(() => normalizeBrainTrainingExerciseBank([makeExercise({ subject: 'programming' })]), /subject unsupported/);
});

test('rejects unsupported cognitive axes and unknown exercise fields', () => {
  assert.throws(() => normalizeBrainTrainingExerciseBank([makeExercise({ cognitiveAxis: 'general_intelligence' })]), /unsupported/);
  assert.throws(() => normalizeBrainTrainingExerciseBank([makeExercise({ userText: 'private' })]), /userText is not allowed/);
});

test('requires versioned source identity and a valid answer option', () => {
  assert.throws(() => normalizeBrainTrainingExerciseBank([makeExercise({ source: { sourceId: 'x', provenance: 'formal_source' } })]), /sourceVersion/);
  assert.throws(() => normalizeBrainTrainingExerciseBank([makeExercise({ correctOptionId: 'z' })]), /missing from options/);
});

test('session preserves caller-curated order instead of adding an internal scheduler', () => {
  const session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  assert.deepEqual(session.items.map((item) => item.exerciseId), ['brain.item.001', 'brain.item.002']);
});

test('session invents no day key, reset rule, quota or item selector', () => {
  const session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const serialized = JSON.stringify(session).toLowerCase();
  for (const forbidden of ['daykey', 'reset', 'quota', 'subjectorder', 'itemlimit']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('public session omits correct answer keys', () => {
  const session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  assert.equal('correctOptionId' in session.items[0], false);
});

test('answer marks correct or incorrect using the source bank without retaining the selected answer', () => {
  const initial = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const correct = answerBrainTrainingItem(initial, bank(), { itemId: 'brain.item.001', optionId: 'a' });
  assert.equal(correct.items[0].status, 'answered');
  assert.equal(correct.items[0].outcome, 'correct');
  assert.equal('selectedOptionId' in correct.items[0], false);

  const initial2 = createBrainTrainingSession({ sessionKey: 'daily.session.2', exercises: bank() });
  const incorrect = answerBrainTrainingItem(initial2, bank(), { itemId: 'brain.item.001', optionId: 'b' });
  assert.equal(incorrect.items[0].outcome, 'incorrect');
});

test('skip is separate from failure and does not count as attempted', () => {
  const initial = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const skipped = skipBrainTrainingItem(initial, { itemId: 'brain.item.001' });
  const summary = summarizeBrainTrainingSession(skipped);
  assert.equal(skipped.items[0].outcome, 'skipped');
  assert.equal(summary.attempted, 0);
  assert.equal(summary.skipped, 1);
});

test('settled items are idempotent on repeated answer or skip', () => {
  const initial = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const answered = answerBrainTrainingItem(initial, bank(), { itemId: 'brain.item.001', optionId: 'a' });
  assert.strictEqual(answerBrainTrainingItem(answered, bank(), { itemId: 'brain.item.001', optionId: 'b' }), answered);
  assert.strictEqual(skipBrainTrainingItem(answered, { itemId: 'brain.item.001' }), answered);
});

test('answer fails closed if the exercise source/version no longer matches the session', () => {
  const initial = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const changed = bank();
  changed[0] = makeExercise({ source: { sourceId: 'curriculum.math.001', sourceVersion: 'v2', provenance: 'formal_source' } });
  assert.throws(() => answerBrainTrainingItem(initial, changed, { itemId: 'brain.item.001', optionId: 'a' }), /does not match session identity/);
});

test('next item returns only pending items', () => {
  const initial = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const answered = answerBrainTrainingItem(initial, bank(), { itemId: 'brain.item.001', optionId: 'a' });
  assert.equal(getNextBrainTrainingItem(answered).exerciseId, 'brain.item.002');
});

test('summary is bounded to direct practice counts', () => {
  let session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  session = answerBrainTrainingItem(session, bank(), { itemId: 'brain.item.001', optionId: 'a' });
  session = skipBrainTrainingItem(session, { itemId: 'brain.item.002' });
  assert.deepEqual(summarizeBrainTrainingSession(session), {
    itemCount: 2,
    attempted: 1,
    correct: 1,
    incorrect: 0,
    skipped: 1,
    pending: 0,
    meaningfulParticipation: true,
  });
});

test('core emits no reward, relationship, battle, learning-effect, IQ or Brain Age authority', () => {
  const session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  const payload = JSON.stringify({ session, summary: summarizeBrainTrainingSession(session) }).toLowerCase();
  for (const forbidden of ['reward', 'relationship', 'battlepower', 'learningoutcome', 'iqchange', 'brainage', 'fartransfer']) {
    assert.equal(payload.includes(forbidden), false, forbidden);
  }
});

test('normalization and session creation do not mutate caller data', () => {
  const raw = bank();
  const before = structuredClone(raw);
  normalizeBrainTrainingExerciseBank(raw);
  createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: raw });
  assert.deepEqual(raw, before);
});

test('session stays a tiny practice state rather than a second Daily state machine', () => {
  const session = createBrainTrainingSession({ sessionKey: 'daily.session.1', exercises: bank() });
  assert.equal(session.schemaVersion, BRAIN_TRAINING_SCHEMA_VERSION);
  assert.deepEqual(Object.keys(session).sort(), ['items', 'schemaVersion', 'sessionKey']);
});
