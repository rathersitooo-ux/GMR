import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  STUDY_MANUAL_SMOKE_ACTION_POLICY,
  createStudyPanelOutsideDismissHandler,
  createStudyRunConsumerController,
} from '../browser/study-run-runtime-mount.mjs';
import { STUDY_MANUAL_PROBLEM_PACK } from '../browser/study-manual-problem-pack.mjs';

const singleQuestionPack = (index) => ({
  ...STUDY_MANUAL_PROBLEM_PACK,
  packId: `study.runtime.test.${index}`,
  questions: [STUDY_MANUAL_PROBLEM_PACK.questions[index]],
});

test('Study runtime starts from the problem pack and never creates defeat or loss state', () => {
  let nowMs = 1000;
  const controller = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => 'study.runtime.session.1',
  });
  const started = controller.start();
  assert.equal(started.question.questionId, 'study.manual.q01');
  assert.equal(started.question.answerHand.length, 4);
  assert.equal(started.hasDefeatState, false);
  assert.equal(started.hasLossState, false);
  assert.equal(started.balanceAuthority, 'PROVISIONAL_SMOKE_ONLY');
});

test('correct answer issues the selected Study action with bounded provisional timing', () => {
  let nowMs = 0;
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(0),
    now: () => nowMs,
    createSessionId: () => 'study.runtime.session.correct',
  });
  let view = controller.start();
  const correct = view.question.answerHand.find((card) => card.candidateId === 'c');
  controller.setActionKind('counter');
  controller.throwAnswer(correct.cardId);
  nowMs = 4000;
  view = controller.resolve();
  assert.equal(view.resolution.grade.result, 'VERIFIED_CORRECT');
  assert.equal(view.resolution.action.issued, true);
  assert.equal(view.resolution.action.actionKind, 'counter');
  assert.equal(view.resolution.action.timeMultiplier, 1.25);
  assert.equal(STUDY_MANUAL_SMOKE_ACTION_POLICY.authority, 'PROVISIONAL_SMOKE_ONLY');
});

test('wrong answer is neutral game-action absence, not a loss branch', () => {
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(0),
    now: () => 100,
    createSessionId: () => 'study.runtime.session.wrong',
  });
  const view = controller.start();
  const wrong = view.question.answerHand.find((card) => card.candidateId === 'a');
  controller.throwAnswer(wrong.cardId);
  const resolved = controller.resolve();
  assert.equal(resolved.resolution.grade.result, 'WRONG');
  assert.equal(resolved.resolution.action.issued, false);
  assert.equal(resolved.hasDefeatState, false);
  assert.equal(resolved.hasLossState, false);
});

test('multiple input cards fill answer slots strictly in throw order', () => {
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(2),
    now: () => 500,
    createSessionId: () => 'study.runtime.session.multi',
  });
  const view = controller.start();
  const [firstCard, secondCard] = view.question.answerHand;
  controller.throwAnswer(secondCard.cardId, '5');
  controller.throwAnswer(firstCard.cardId, '9');
  const resolved = controller.resolve();
  assert.equal(resolved.resolution.grade.result, 'VERIFIED_CORRECT');
  assert.deepEqual(resolved.throws.map((item) => item.position), [1, 2]);
});

test('controller requires every answer slot before resolving and can undo the latest throw', () => {
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(2),
    now: () => 500,
    createSessionId: () => 'study.runtime.session.undo',
  });
  let view = controller.start();
  controller.throwAnswer(view.question.answerHand[0].cardId, '5');
  assert.throws(() => controller.resolve(), /ALL_SLOTS_REQUIRED/);
  view = controller.undoLastThrow();
  assert.equal(view.throws.length, 0);
  assert.equal(view.canResolve, false);
});

test('hint truth comes from the pack and clearly remains economy-unapplied', () => {
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(0),
    createSessionId: () => 'study.runtime.session.hint',
  });
  controller.start();
  const view = controller.revealHint(0);
  assert.equal(view.hint.truthAuthority, 'problem_pack');
  assert.equal(view.hint.economyApplied, false);
});

test('completion is a neutral complete state and restart starts a fresh session', () => {
  let id = 0;
  const controller = createStudyRunConsumerController({
    pack: singleQuestionPack(0),
    createSessionId: () => `study.runtime.session.restart.${++id}`,
  });
  let view = controller.start();
  controller.throwAnswer(view.question.answerHand.find((card) => card.candidateId === 'c').cardId);
  controller.resolve();
  view = controller.advance();
  assert.equal(view.status, 'complete');
  assert.equal(view.hasDefeatState, false);
  view = controller.restart();
  assert.equal(view.status, 'active');
  assert.equal(view.session.sessionId, 'study.runtime.session.restart.2');
});

test('outside dismissal closes only a visible panel and preserves inside interaction', () => {
  const inside = {};
  const outside = {};
  let dismissed = 0;
  const panel = { hidden: false, contains: (target) => target === inside };
  const dismiss = createStudyPanelOutsideDismissHandler({ panel, onDismiss: () => { dismissed += 1; } });
  assert.equal(dismiss({ target: inside }), false);
  assert.equal(dismiss({ target: outside }), true);
  assert.equal(dismissed, 1);
  panel.hidden = true;
  assert.equal(dismiss({ target: outside }), false);
});

test('Study runtime source marks provisional balance and does not contain defeat/loss UI wording', () => {
  const source = fs.readFileSync(new URL('../browser/study-run-runtime-mount.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('PROVISIONAL_SMOKE_ONLY'));
  assert.ok(source.includes('手動動作確認用の試作値'));
  assert.equal(source.includes('敗北'), false);
  assert.equal(source.includes('負け'), false);
});


test('Study resume checkpoint restores the same run without resetting elapsed-time advantage', () => {
  let nowMs = 1000;
  const first = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => 'study.runtime.session.resume',
  });
  let view = first.start();
  first.setActionKind('counter');
  const checkpoint = first.exportResumeCheckpoint();
  assert.equal(checkpoint.persistenceAuthority, 'CALLER');
  assert.equal(checkpoint.storageBackendCreated, false);
  assert.equal(JSON.stringify(checkpoint).includes('acceptedAnswers'), false);

  nowMs = 7000;
  const resumed = createStudyRunConsumerController({
    now: () => nowMs,
    createSessionId: () => { throw new Error('new session id must not be requested while resuming'); },
    resumeCheckpoint: checkpoint,
  });
  view = resumed.getSnapshot();
  assert.equal(view.session.sessionId, 'study.runtime.session.resume');
  assert.equal(view.question.questionId, 'study.manual.q01');
  assert.equal(view.actionKind, 'counter');
  const correct = view.question.answerHand.find(card => card.candidateId === 'c');
  resumed.throwAnswer(correct.cardId);
  view = resumed.resolve();
  assert.equal(view.resolution.action.actionKind, 'counter');
  assert.equal(view.resolution.action.timeMultiplier, 1.1);
});

test('Study resume checkpoint is refused mid-answer and rejects pack-version drift', () => {
  const controller = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.resume.reject',
  });
  const view = controller.start();
  const card = view.question.answerHand[0];
  controller.throwAnswer(card.cardId);
  assert.throws(() => controller.exportResumeCheckpoint(), /REQUIRES_STABLE_BOUNDARY/);

  const clean = createStudyRunConsumerController({
    now: () => 1000,
    createSessionId: () => 'study.runtime.session.resume.clean',
  });
  clean.start();
  const checkpoint = clean.exportResumeCheckpoint();
  const driftedPack = { ...STUDY_MANUAL_PROBLEM_PACK, contentVersion: 'v2.unknown' };
  assert.throws(
    () => createStudyRunConsumerController({ pack: driftedPack, resumeCheckpoint: checkpoint }),
    /does not match session/,
  );
});
