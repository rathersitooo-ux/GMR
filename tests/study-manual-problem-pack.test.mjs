import test from 'node:test';
import assert from 'node:assert/strict';

import { createAnswerHand, gradeStudyAnswer } from '../browser/study-problem-pack-core.mjs';
import { STUDY_MANUAL_PROBLEM_PACK } from '../browser/study-manual-problem-pack.mjs';

test('manual Study pack is a bounded GAMEROAD-authored 10-question smoke pack', () => {
  assert.equal(STUDY_MANUAL_PROBLEM_PACK.questions.length, 10);
  assert.equal(STUDY_MANUAL_PROBLEM_PACK.schoolYear, 'manual');
  assert.equal(STUDY_MANUAL_PROBLEM_PACK.grade, 'unspecified');
  assert.equal(STUDY_MANUAL_PROBLEM_PACK.source.provenance, 'gameroad_authored');
  assert.equal(STUDY_MANUAL_PROBLEM_PACK.source.rightsScope, 'gameroad_owned');
});

test('manual pack covers choice, input, and sequence without making four-choice universal', () => {
  const modes = new Set(STUDY_MANUAL_PROBLEM_PACK.questions.map(question => question.answerMode));
  assert.deepEqual([...modes].sort(), ['choice', 'input', 'sequence']);
});

test('every manual question retains source scope and at least one authored hint', () => {
  for (const question of STUDY_MANUAL_PROBLEM_PACK.questions) {
    assert.equal(question.source.provenance, 'gameroad_authored');
    assert.equal(question.source.rightsScope, 'gameroad_owned');
    assert.ok(question.hints.length >= 1);
    assert.ok(createAnswerHand(question).length >= 1);
  }
});

test('manual multi-slot smoke question proves top-to-bottom throw-order grading', () => {
  const question = STUDY_MANUAL_PROBLEM_PACK.questions.find(item => item.questionId === 'study.manual.q03');
  assert.ok(question);
  const hand = createAnswerHand(question);
  const correct = gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: question.questionId,
    throws: [
      { cardId: hand[1].cardId, value: '5' },
      { cardId: hand[0].cardId, value: '9' },
    ],
  });
  assert.equal(correct.result, 'VERIFIED_CORRECT');
  assert.deepEqual(correct.slotResults.map(slot => slot.position), [1, 2]);
});
