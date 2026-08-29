import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BRAIN_TRAINING_COGNITIVE_AXES,
  createBrainTrainingSession,
  normalizeBrainTrainingExerciseBank,
} from '../browser/brain-training-core.mjs';
import { LEARNING_SUBJECTS } from '../browser/learning-event-core.mjs';
import {
  BRAIN_TRAINING_EXERCISE_BANK,
  BRAIN_TRAINING_EXERCISE_BANK_VERSION,
  getBrainTrainingExerciseBank,
} from '../browser/brain-training-exercise-bank.mjs';

const EXPECTED_SOURCE = Object.freeze({
  sourceId: 'gameroad_brain_training_authored',
  sourceVersion: 'v1.20260830',
  provenance: 'gameroad_authored',
});

test('exports one normalized source-versioned v1 bank', () => {
  assert.equal(BRAIN_TRAINING_EXERCISE_BANK_VERSION, 'gameroad.brain-training-bank.v1');
  assert.equal(getBrainTrainingExerciseBank(), BRAIN_TRAINING_EXERCISE_BANK);
  assert.equal(BRAIN_TRAINING_EXERCISE_BANK.length, 12);
  assert.deepEqual(
    normalizeBrainTrainingExerciseBank(BRAIN_TRAINING_EXERCISE_BANK),
    BRAIN_TRAINING_EXERCISE_BANK,
  );
});

test('covers every shared cognitive axis without inventing a Brain-only taxonomy', () => {
  const actual = [...new Set(BRAIN_TRAINING_EXERCISE_BANK.map((item) => item.cognitiveAxis))].sort();
  assert.deepEqual(actual, [...BRAIN_TRAINING_COGNITIVE_AXES].sort());
});

test('covers the existing six broad learning subjects only', () => {
  const allowed = Object.values(LEARNING_SUBJECTS);
  const actual = [...new Set(BRAIN_TRAINING_EXERCISE_BANK.map((item) => item.subject))].sort();
  assert.deepEqual(actual, [...allowed].sort());
});

test('every exercise has a unique id, valid answer option, and the same authored source identity', () => {
  const ids = new Set();
  for (const exercise of BRAIN_TRAINING_EXERCISE_BANK) {
    assert.equal(ids.has(exercise.id), false);
    ids.add(exercise.id);
    assert.equal(exercise.options.some((option) => option.id === exercise.correctOptionId), true);
    assert.deepEqual(exercise.source, EXPECTED_SOURCE);
  }
});

test('public session keeps source identity but does not expose answer keys', () => {
  const session = createBrainTrainingSession({
    sessionKey: 'bank_contract_test',
    exercises: BRAIN_TRAINING_EXERCISE_BANK,
  });

  assert.equal(session.items.length, BRAIN_TRAINING_EXERCISE_BANK.length);
  for (const item of session.items) {
    assert.equal(Object.hasOwn(item, 'correctOptionId'), false);
    assert.deepEqual(item.source, EXPECTED_SOURCE);
  }
});

test('bank adds no reward, streak, reset, IQ, Brain Age, or learning-effect authority', () => {
  const serialized = JSON.stringify(BRAIN_TRAINING_EXERCISE_BANK).toLowerCase();
  for (const forbidden of [
    'reward',
    'streak',
    'reset',
    'brain_age',
    'brain age',
    'iq',
    'learning_effect',
    'learning effect',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden authority token: ${forbidden}`);
  }
});

test('exercise content is GAMEROAD-authored rather than copied from the external reference product', () => {
  const serialized = JSON.stringify(BRAIN_TRAINING_EXERCISE_BANK).toLowerCase();
  assert.equal(serialized.includes('nintendo'), false);
  assert.equal(serialized.includes('big brain academy'), false);
});
