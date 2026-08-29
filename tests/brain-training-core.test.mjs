import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAIN_TRAINING_COGNITIVE_AXES,
  BRAIN_TRAINING_SUBJECTS,
  DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER,
  answerBrainTrainingItem,
  createBrainTrainingLearningEvent,
  createBrainTrainingSession,
  getNextBrainTrainingItem,
  normalizeBrainTrainingExerciseBank,
  skipBrainTrainingItem,
  summarizeBrainTrainingSession,
} from '../browser/brain-training-core.mjs';

function defaultLearningSubject(subject) {
  if (subject === 'programming_english' || subject === 'japanese_literature' || subject === 'bug_reporting') {
    return 'language_communication';
  }
  return 'math_logic';
}

function exercise({
  id,
  subject,
  learningSubject = defaultLearningSubject(subject),
  cognitiveAxis = 'analyze',
  correct = 'b',
  sourceVersion = 'v1',
}) {
  return {
    id,
    subject,
    learningSubject,
    cognitiveAxis,
    prompt: `Prompt for ${id}`,
    options: [
      { id: 'a', label: 'Option A' },
      { id: 'b', label: 'Option B' },
      { id: 'c', label: 'Option C' },
    ],
    correctOptionId: correct,
    source: {
      sourceId: `source:${id}`,
      sourceVersion,
      provenance: 'brain_bank_fixture',
    },
  };
}

const BANK = [
  exercise({ id: 'prog-1', subject: 'programming', cognitiveAxis: 'identify' }),
  exercise({ id: 'prog-2', subject: 'programming', cognitiveAxis: 'analyze', correct: 'a' }),
  exercise({ id: 'eng-1', subject: 'programming_english', cognitiveAxis: 'memorize' }),
  exercise({ id: 'jp-1', subject: 'japanese_literature', cognitiveAxis: 'analyze' }),
  exercise({ id: 'math-1', subject: 'arithmetic', cognitiveAxis: 'compute' }),
  exercise({ id: 'logic-1', subject: 'logical_thinking', cognitiveAxis: 'visualize' }),
  exercise({ id: 'bug-1', subject: 'bug_reporting', cognitiveAxis: 'analyze' }),
];

test('exports the current six-subject education surface and reuses the five shared cognitive axes', () => {
  assert.deepEqual(BRAIN_TRAINING_SUBJECTS, [
    'programming',
    'programming_english',
    'japanese_literature',
    'arithmetic',
    'logical_thinking',
    'bug_reporting',
  ]);
  assert.deepEqual(DEFAULT_BRAIN_TRAINING_SUBJECT_ORDER, BRAIN_TRAINING_SUBJECTS);
  assert.deepEqual(BRAIN_TRAINING_COGNITIVE_AXES, ['identify', 'memorize', 'analyze', 'compute', 'visualize']);
});

test('session round-robins subjects instead of exhausting the first subject', () => {
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK });
  assert.deepEqual(session.items.map((item) => item.exerciseId), [
    'prog-1', 'eng-1', 'jp-1', 'math-1', 'logic-1', 'bug-1', 'prog-2',
  ]);
});

test('explicit subject order changes selection priority without inventing a daily quota', () => {
  const session = createBrainTrainingSession({
    dayKey: '2026-08-29',
    exercises: BANK,
    subjectOrder: ['bug_reporting', 'logical_thinking'],
    itemLimit: 2,
  });
  assert.deepEqual(session.items.map((item) => item.exerciseId), ['bug-1', 'logic-1']);
  assert.equal(createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK }).items.length, BANK.length);
});

test('public session never contains answer keys', () => {
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  assert.equal(JSON.stringify(session).includes('correctOptionId'), false);
});

test('answers are graded against source-versioned bank and repeated answers are idempotent', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  session = answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'b' });
  assert.equal(session.items[0].outcome, 'correct');
  assert.strictEqual(answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'a' }), session);
});

test('incorrect and skipped are separate outcomes and skip creates no synthetic failure', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 3 });
  session = answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'a' });
  session = skipBrainTrainingItem(session, { itemId: 'eng-1' });
  const summary = summarizeBrainTrainingSession(session);
  assert.equal(summary.incorrect, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.attempted, 1);
  assert.equal(summary.pending, 1);
});

test('one answered item is meaningful participation without full clear', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 3 });
  session = answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'b' });
  const summary = summarizeBrainTrainingSession(session);
  assert.equal(summary.meaningfulParticipation, true);
  assert.equal(summary.settled, false);
  assert.equal(summary.pending, 2);
});

test('next item is first pending and becomes null when all items settle', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 2 });
  assert.equal(getNextBrainTrainingItem(session).exerciseId, 'prog-1');
  session = skipBrainTrainingItem(session, { itemId: 'prog-1' });
  assert.equal(getNextBrainTrainingItem(session).exerciseId, 'eng-1');
  session = skipBrainTrainingItem(session, { itemId: 'eng-1' });
  assert.equal(getNextBrainTrainingItem(session), null);
});

test('learning event reuses shared learning-event-v1 and contains coded fields only', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  session = answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'a' });
  const event = createBrainTrainingLearningEvent(session, {
    itemId: 'prog-1',
    eventId: 'brain:event:1',
    sessionKey: 'brain:session:2026-08-29',
  });
  assert.equal(event.schemaVersion, 'learning-event-v1');
  assert.equal(event.subject, 'math_logic');
  assert.deepEqual(event.cognitiveCategories, ['identify']);
  assert.equal(event.result, 'incorrect');
  assert.equal(event.outcomeCode, 'incorrect');
  assert.deepEqual(event.evidenceRefs, [{
    id: 'source:prog-1',
    version: 'v1',
    provenance: 'brain_bank_fixture',
    role: 'used',
  }]);
  assert.equal(event.privacyBoundary, 'CODED_FIELDS_ONLY');
  assert.equal(event.learningOutcome, 'UNMEASURED');
  assert.equal(event.realSkillOutcome, 'UNMEASURED');
  assert.equal(JSON.stringify(event).includes('Prompt for'), false);
  assert.equal(JSON.stringify(event).includes('Option A'), false);
});

test('skipped item becomes shared unscored event rather than incorrect', () => {
  let session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  session = skipBrainTrainingItem(session, { itemId: 'prog-1' });
  const event = createBrainTrainingLearningEvent(session, {
    itemId: 'prog-1',
    eventId: 'brain:event:skip1',
    sessionKey: 'brain:session:2026-08-29',
  });
  assert.equal(event.result, 'unscored');
  assert.equal(event.outcomeCode, 'skipped');
  assert.equal(event.decisionCode, 'skipped');
});

test('learning event cannot be emitted before item is settled', () => {
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  assert.throws(
    () => createBrainTrainingLearningEvent(session, {
      itemId: 'prog-1', eventId: 'brain:event:pending', sessionKey: 'brain:session:2026-08-29',
    }),
    /settled item/,
  );
});

test('source/version/provenance mismatch fails closed before grading', () => {
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  for (const sourcePatch of [
    { sourceVersion: 'v2' },
    { provenance: 'different_source' },
  ]) {
    const changed = BANK.map((item) => item.id === 'prog-1'
      ? { ...item, source: { ...item.source, ...sourcePatch } }
      : item);
    assert.throws(
      () => answerBrainTrainingItem(session, changed, { itemId: 'prog-1', optionId: 'b' }),
      /does not match session identity/,
    );
  }
});

test('content source chooses shared learning subject; unsupported metadata fails closed', () => {
  assert.throws(
    () => normalizeBrainTrainingExerciseBank([exercise({ id: 'x', subject: 'unknown_subject' })]),
    /subject unsupported/,
  );
  assert.throws(
    () => normalizeBrainTrainingExerciseBank([exercise({ id: 'x', subject: 'programming', learningSubject: 'unknown_learning' })]),
    /learningSubject unsupported/,
  );
  assert.throws(
    () => normalizeBrainTrainingExerciseBank([exercise({ id: 'x', subject: 'programming', cognitiveAxis: 'mystery' })]),
    /cognitiveAxis unsupported/,
  );
  assert.throws(() => normalizeBrainTrainingExerciseBank([BANK[0], BANK[0]]), /duplicate exercise id/);
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  assert.throws(
    () => answerBrainTrainingItem(session, BANK, { itemId: 'prog-1', optionId: 'missing' }),
    /missing from exercise/,
  );
});

test('summary refuses IQ, brain-age, academic and far-transfer claims and owns no reward/battle/relationship/reset authority', () => {
  const session = createBrainTrainingSession({ dayKey: '2026-08-29', exercises: BANK, itemLimit: 1 });
  const summary = summarizeBrainTrainingSession(session);
  assert.deepEqual(summary.claims, {
    iqChange: false,
    brainAgeChange: false,
    academicImprovement: false,
    farTransfer: false,
  });
  assert.deepEqual(summary.authority, {
    reward: false,
    relationship: false,
    battlePower: false,
    dailyReset: false,
  });
});

test('caller input is not mutated', () => {
  const bank = structuredClone(BANK);
  const before = structuredClone(bank);
  createBrainTrainingSession({ dayKey: '2026-08-29', exercises: bank, itemLimit: 4 });
  assert.deepEqual(bank, before);
});
