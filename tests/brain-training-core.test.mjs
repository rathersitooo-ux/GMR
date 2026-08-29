import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COGNITIVE_CATEGORIES,
  LEARNING_OUTCOME,
  createBrainTrainingSession,
  evaluateBrainTrainingAttempt,
  normalizeBrainTrainingItem,
  summarizeBrainTrainingAttempts,
} from '../browser/brain-training-core.mjs';

function makeItem(overrides = {}) {
  return {
    id: 'compute.add.1',
    version: 'v1',
    category: COGNITIVE_CATEGORIES.COMPUTE,
    difficulty: 2,
    source: {
      id: 'bank.math.basic',
      version: '2026-08-29',
      provenance: 'server_verified',
    },
    prompt: { lhs: 2, rhs: 3 },
    answer: { type: 'exact', value: 5 },
    tags: ['math', 'addition'],
    ...overrides,
  };
}

test('all five cognitive categories are accepted', () => {
  for (const category of Object.values(COGNITIVE_CATEGORIES)) {
    const item = normalizeBrainTrainingItem(makeItem({ id: `item.${category}`, category }));
    assert.equal(item.category, category);
  }
});

test('unsupported cognitive category fails closed', () => {
  assert.throws(() => normalizeBrainTrainingItem(makeItem({ category: 'general_intelligence' })), /unsupported cognitive category/);
});

test('source id, version and provenance are required', () => {
  for (const field of ['id', 'version', 'provenance']) {
    const source = { ...makeItem().source };
    delete source[field];
    assert.throws(() => normalizeBrainTrainingItem(makeItem({ source })), new RegExp(`source\\.${field}`));
  }
});

test('difficulty must stay within bounded 1..10 integer range', () => {
  assert.equal(normalizeBrainTrainingItem(makeItem({ difficulty: 1 })).difficulty, 1);
  assert.equal(normalizeBrainTrainingItem(makeItem({ difficulty: 10 })).difficulty, 10);
  for (const difficulty of [0, 11, 2.5, NaN]) {
    assert.throws(() => normalizeBrainTrainingItem(makeItem({ difficulty })), /difficulty/);
  }
});

test('exact answer evaluation is deterministic', () => {
  const item = normalizeBrainTrainingItem(makeItem());
  assert.equal(evaluateBrainTrainingAttempt(item, 5).correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 4).correct, false);
});

test('one_of answer evaluation accepts only listed values', () => {
  const item = normalizeBrainTrainingItem(makeItem({
    answer: { type: 'one_of', values: ['A', 'a'] },
  }));
  assert.equal(evaluateBrainTrainingAttempt(item, 'A').correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 'a').correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 'B').correct, false);
});

test('numeric_range evaluation accepts inclusive finite range only', () => {
  const item = normalizeBrainTrainingItem(makeItem({
    answer: { type: 'numeric_range', min: 9.5, max: 10.5 },
  }));
  assert.equal(evaluateBrainTrainingAttempt(item, 9.5).correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 10).correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 10.5).correct, true);
  assert.equal(evaluateBrainTrainingAttempt(item, 11).correct, false);
  assert.equal(evaluateBrainTrainingAttempt(item, '10').correct, false);
});

test('attempt output never echoes the submitted answer', () => {
  const secretLikeAnswer = 'private-user-input-should-not-be-echoed';
  const item = normalizeBrainTrainingItem(makeItem({
    answer: { type: 'exact', value: secretLikeAnswer },
  }));
  const result = evaluateBrainTrainingAttempt(item, secretLikeAnswer, { responseMs: 321 });
  assert.equal(result.correct, true);
  assert.equal(JSON.stringify(result).includes(secretLikeAnswer), false);
  assert.equal(result.responseMs, 321);
});

test('session selection is deterministic for the same selection key', () => {
  const items = Array.from({ length: 12 }, (_, index) => makeItem({
    id: `compute.${index}`,
    version: `v${index + 1}`,
  }));
  const a = createBrainTrainingSession({ sessionKey: 'day-authority-1', items, limit: 5, selectionKey: 'seed-A' });
  const b = createBrainTrainingSession({ sessionKey: 'day-authority-1', items, limit: 5, selectionKey: 'seed-A' });
  assert.deepEqual(a.items.map((item) => item.id), b.items.map((item) => item.id));
});

test('session de-duplicates item IDs before selection', () => {
  const items = [
    makeItem({ id: 'dup', version: 'v1' }),
    makeItem({ id: 'dup', version: 'v2' }),
    makeItem({ id: 'unique', version: 'v1' }),
  ];
  const session = createBrainTrainingSession({ sessionKey: 's', items, limit: 10 });
  assert.deepEqual([...new Set(session.items.map((item) => item.id))].sort(), ['dup', 'unique']);
  assert.equal(session.items.length, 2);
});

test('session category filtering keeps only requested cognitive categories', () => {
  const items = [
    makeItem({ id: 'compute', category: COGNITIVE_CATEGORIES.COMPUTE }),
    makeItem({ id: 'memory', category: COGNITIVE_CATEGORIES.MEMORIZE }),
    makeItem({ id: 'visual', category: COGNITIVE_CATEGORIES.VISUALIZE }),
  ];
  const session = createBrainTrainingSession({
    sessionKey: 's',
    items,
    categories: [COGNITIVE_CATEGORIES.MEMORIZE, COGNITIVE_CATEGORIES.VISUALIZE],
    limit: 5,
  });
  assert.deepEqual(new Set(session.items.map((item) => item.category)), new Set(['memorize', 'visualize']));
});

test('external sessionKey is required and no reset schedule is invented', () => {
  assert.throws(() => createBrainTrainingSession({ items: [makeItem()] }), /sessionKey/);
  const session = createBrainTrainingSession({ sessionKey: 'authority-supplied-session', items: [makeItem()] });
  assert.equal(session.sessionKey, 'authority-supplied-session');
  const serialized = JSON.stringify(session);
  assert.equal(serialized.includes('resetAt'), false);
  assert.equal(serialized.includes('resetTime'), false);
});

test('summary counts practice attempts by category without claiming learning', () => {
  const compute = normalizeBrainTrainingItem(makeItem({ id: 'c' }));
  const memory = normalizeBrainTrainingItem(makeItem({
    id: 'm',
    category: COGNITIVE_CATEGORIES.MEMORIZE,
    answer: { type: 'exact', value: 'x' },
  }));
  const summary = summarizeBrainTrainingAttempts([
    evaluateBrainTrainingAttempt(compute, 5),
    evaluateBrainTrainingAttempt(compute, 4),
    evaluateBrainTrainingAttempt(memory, 'x'),
  ]);
  assert.equal(summary.attemptCount, 3);
  assert.equal(summary.correctCount, 2);
  assert.equal(summary.practiceAccuracy, 2 / 3);
  assert.deepEqual(summary.byCategory.compute, { attempts: 2, correct: 1 });
  assert.deepEqual(summary.byCategory.memorize, { attempts: 1, correct: 1 });
  assert.equal(summary.practicePerformanceOnly, true);
  assert.equal(summary.learningOutcome, LEARNING_OUTCOME.UNMEASURED);
});

test('attempt and session explicitly keep learning outcomes unmeasured', () => {
  const item = normalizeBrainTrainingItem(makeItem());
  const attempt = evaluateBrainTrainingAttempt(item, 5);
  const session = createBrainTrainingSession({ sessionKey: 's', items: [item] });
  assert.equal(attempt.learningOutcome, 'UNMEASURED');
  assert.equal(session.learningOutcome, 'UNMEASURED');
  assert.equal(attempt.practicePerformanceOnly, true);
});

test('serialized core products contain no gameplay or educational-effect authority fields', () => {
  const item = normalizeBrainTrainingItem(makeItem());
  const attempt = evaluateBrainTrainingAttempt(item, 5);
  const session = createBrainTrainingSession({ sessionKey: 's', items: [item] });
  const summary = summarizeBrainTrainingAttempts([attempt]);
  const serialized = JSON.stringify({ item, attempt, session, summary }).toLowerCase();
  for (const forbidden of [
    'reward',
    'relationship',
    'battlepower',
    'resetat',
    'resettime',
    'brainage',
    'fartransfer',
    'iqscore',
    'gradeimprovement',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('input items and arrays are never mutated', () => {
  const raw = makeItem({ tags: ['math', 'math', 'addition'] });
  const rawBefore = structuredClone(raw);
  const items = [raw];
  const itemsBefore = structuredClone(items);
  const normalized = normalizeBrainTrainingItem(raw);
  createBrainTrainingSession({ sessionKey: 's', items });
  assert.deepEqual(raw, rawBefore);
  assert.deepEqual(items, itemsBefore);
  assert.deepEqual(normalized.tags, ['math', 'addition']);
});

test('invalid answer specifications fail closed', () => {
  assert.throws(() => normalizeBrainTrainingItem(makeItem({ answer: { type: 'unknown' } })), /answer\.type/);
  assert.throws(() => normalizeBrainTrainingItem(makeItem({ answer: { type: 'one_of', values: [] } })), /one_of/);
  assert.throws(() => normalizeBrainTrainingItem(makeItem({ answer: { type: 'numeric_range', min: 2, max: 1 } })), /numeric_range/);
});

test('invalid responseMs fails closed', () => {
  const item = normalizeBrainTrainingItem(makeItem());
  for (const responseMs of [-1, NaN, Infinity, 'bad']) {
    assert.throws(() => evaluateBrainTrainingAttempt(item, 5, { responseMs }), /responseMs/);
  }
});
