import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STUDY_PROBLEM_PACK_CORE,
  advanceStudySession,
  createAnswerHand,
  createStudySession,
  deriveVerifiedStudyAction,
  getCurrentStudyQuestion,
  getStudyHint,
  gradeStudyAnswer,
  normalizeStudyProblemPack,
  resolveCurrentStudyQuestion,
} from '../browser/study-problem-pack-core.mjs';
import { STUDY_MANUAL_PROBLEM_PACK } from '../browser/study-manual-problem-pack.mjs';

const ACTION_POLICY = Object.freeze({
  difficultyPower: Object.freeze({
    manual_basic: 10,
    manual_multi: 12,
    manual_sequence: 12,
    manual_order: 14,
    manual_pattern: 12,
  }),
  maxTimeMultiplier: 1.25,
  timeBands: Object.freeze([
    Object.freeze({ maxMs: 5000, multiplier: 1.25 }),
    Object.freeze({ maxMs: 15000, multiplier: 1.1 }),
    Object.freeze({ maxMs: null, multiplier: 1 }),
  ]),
});

test('normalizes the authored manual pack without promoting it to a final curriculum scale', () => {
  const pack = normalizeStudyProblemPack(STUDY_MANUAL_PROBLEM_PACK);
  assert.equal(pack.schemaVersion, STUDY_PROBLEM_PACK_CORE.packSchema);
  assert.equal(pack.questions.length, 10);
  assert.equal(pack.schoolYear, 'manual');
  assert.equal(pack.grade, 'unspecified');
});

test('public question and answer hand do not expose accepted answers', () => {
  const session = createStudySession({ sessionId: 'study.session.1', pack: STUDY_MANUAL_PROBLEM_PACK, startedAtMs: 100 });
  const question = getCurrentStudyQuestion(session, STUDY_MANUAL_PROBLEM_PACK);
  assert.equal(question.questionId, 'study.manual.q01');
  assert.equal(question.answerHand.length, 4);
  assert.equal(JSON.stringify(question).includes('acceptedAnswers'), false);
  assert.equal(JSON.stringify(question).includes('12'), true);
});

test('choice cards use their pack-bound value and cannot inject arbitrary answer text', () => {
  const hand = createAnswerHand(STUDY_MANUAL_PROBLEM_PACK.questions[0]);
  const correct = hand.find(card => card.candidateId === 'c');
  const grade = gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: 'study.manual.q01',
    throws: [{ cardId: correct.cardId }],
  });
  assert.equal(grade.result, 'VERIFIED_CORRECT');
  assert.throws(() => gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: 'study.manual.q01',
    throws: [{ cardId: correct.cardId, value: '13' }],
  }), /value is not allowed/);
});

test('multiple input slots are graded strictly by throw order from the top slot downward', () => {
  const question = STUDY_MANUAL_PROBLEM_PACK.questions[2];
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

  const reversedValues = gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: question.questionId,
    throws: [
      { cardId: hand[0].cardId, value: '9' },
      { cardId: hand[1].cardId, value: '5' },
    ],
  });
  assert.equal(reversedValues.result, 'WRONG');
});

test('sequence candidate cards are also assigned to answer slots in throw order', () => {
  const question = STUDY_MANUAL_PROBLEM_PACK.questions[3];
  const hand = createAnswerHand(question);
  const byId = new Map(hand.map(card => [card.candidateId, card]));
  const grade = gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: question.questionId,
    throws: [
      { cardId: byId.get('two').cardId },
      { cardId: byId.get('five').cardId },
      { cardId: byId.get('eight').cardId },
    ],
  });
  assert.equal(grade.result, 'VERIFIED_CORRECT');
});

test('partial, wrong, and correct are distinct without creating a defeat/loss state', () => {
  const question = STUDY_MANUAL_PROBLEM_PACK.questions[2];
  const hand = createAnswerHand(question);
  const partial = gradeStudyAnswer({
    pack: STUDY_MANUAL_PROBLEM_PACK,
    questionId: question.questionId,
    throws: [{ cardId: hand[0].cardId, value: '5' }],
  });
  assert.equal(partial.result, 'PARTIAL');
  assert.equal(STUDY_PROBLEM_PACK_CORE.results.includes('LOSS'), false);
  assert.equal(STUDY_PROBLEM_PACK_CORE.results.includes('DEFEAT'), false);
});

test('correctness gates game action and speed bonus is bounded by caller-owned policy', () => {
  const correctGrade = Object.freeze({ result: 'VERIFIED_CORRECT' });
  const fast = deriveVerifiedStudyAction({
    grade: correctGrade,
    difficulty: 'manual_basic',
    elapsedMs: 1000,
    actionKind: 'attack',
    actionPolicy: ACTION_POLICY,
  });
  assert.equal(fast.issued, true);
  assert.equal(fast.power, 12.5);
  assert.equal(fast.timeMultiplier, 1.25);
  assert.equal(fast.boundedTimeBonus, true);

  const slow = deriveVerifiedStudyAction({
    grade: correctGrade,
    difficulty: 'manual_basic',
    elapsedMs: 999999,
    actionKind: 'counter',
    actionPolicy: ACTION_POLICY,
  });
  assert.equal(slow.power, 10);

  const wrong = deriveVerifiedStudyAction({
    grade: { result: 'WRONG' },
    difficulty: 'manual_basic',
    elapsedMs: 100,
    actionKind: 'attack',
    actionPolicy: ACTION_POLICY,
  });
  assert.equal(wrong.issued, false);
  assert.equal(wrong.reason, 'CORRECT_ACTION_NOT_ISSUED');
});

test('action policy has no hidden default multiplier or difficulty power', () => {
  assert.throws(() => deriveVerifiedStudyAction({
    grade: { result: 'VERIFIED_CORRECT' },
    difficulty: 'manual_basic',
    elapsedMs: 1000,
    actionKind: 'attack',
  }), /actionPolicy/);
});

test('session resolves then advances, and completing the pack is neutral rather than win/loss', () => {
  let session = createStudySession({ sessionId: 'study.session.loop', pack: STUDY_MANUAL_PROBLEM_PACK });
  const first = getCurrentStudyQuestion(session, STUDY_MANUAL_PROBLEM_PACK);
  const correctCard = first.answerHand.find(card => card.candidateId === 'c');
  const resolution = resolveCurrentStudyQuestion(session, STUDY_MANUAL_PROBLEM_PACK, {
    throws: [{ cardId: correctCard.cardId }],
    elapsedMs: 4000,
    actionKind: 'attack',
    actionPolicy: ACTION_POLICY,
  });
  assert.equal(resolution.grade.result, 'VERIFIED_CORRECT');
  assert.equal(resolution.action.issued, true);
  session = advanceStudySession(resolution.session, STUDY_MANUAL_PROBLEM_PACK);
  assert.equal(session.questionIndex, 1);
  assert.equal(session.status, 'active');
  assert.equal(Object.hasOwn(session, 'won'), false);
  assert.equal(Object.hasOwn(session, 'lost'), false);
});

test('hints come from the pack and apply no economy until the caller supplies the unresolved economy owner', () => {
  const hint = getStudyHint(STUDY_MANUAL_PROBLEM_PACK, { questionId: 'study.manual.q01', hintIndex: 0 });
  assert.equal(hint.truthAuthority, 'problem_pack');
  assert.equal(hint.economyApplied, false);
  assert.match(hint.hint, /7/);
});

test('session refuses a different pack content version on resume', () => {
  const session = createStudySession({ sessionId: 'study.session.version', pack: STUDY_MANUAL_PROBLEM_PACK });
  const drifted = { ...STUDY_MANUAL_PROBLEM_PACK, contentVersion: 'v2.unknown' };
  assert.throws(() => getCurrentStudyQuestion(session, drifted), /does not match session/);
});
