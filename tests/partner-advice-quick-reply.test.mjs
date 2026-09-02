import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPartnerAdviceQuickReplyControl,
  PARTNER_ADVICE_DELEGATE_REPLY_TEXT,
} from '../browser/partner-advice-runtime-mount.mjs';

function saasunaControl(overrides = {}) {
  return createPartnerAdviceQuickReplyControl({
    getPartnerId: () => 'partner.saasuna',
    ...overrides,
  });
}

test('approved quick reply commits Saasuna acknowledgement exactly once without gameplay execution or 2v2 ping', () => {
  const control = saasunaControl();
  assert.equal(control.arm({ replyId: 'reply-1', text: PARTNER_ADVICE_DELEGATE_REPLY_TEXT }), true);
  const receipt = control.commit('reply-1');
  assert.deepEqual(receipt, {
    schema: 'gameroad.partner-advice-quick-reply.v1',
    replyId: 'reply-1',
    playerText: 'まかせた！',
    partnerId: 'partner.saasuna',
    speechAct: 'character_utterance',
    partnerUtterance: 'かしこまりました',
    sourceId: 'SOURCE-DIALOGUE-SAASUNA-20260810',
    dialogueVersion: 'saasuna.dialogue.current.r1.20260810',
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    exactlyOnce: true,
  });
  assert.equal(control.commit('reply-1'), null);
  assert.equal(control.arm({ replyId: 'reply-1', text: 'まかせた！' }), false);
});

test('cancel removes pending reply with no character utterance or execution side effect', () => {
  const control = saasunaControl();
  assert.equal(control.arm({ replyId: 'reply-cancel', text: 'まかせた！' }), true);
  assert.equal(control.cancel('reply-cancel'), true);
  assert.equal(control.commit('reply-cancel'), null);
  assert.deepEqual(control.status(), {
    schema: 'gameroad.partner-advice-quick-reply.v1',
    pendingReplyId: null,
    pendingText: null,
    committedReplyIds: [],
    autoExecute: false,
    emits2v2Ping: false,
  });
});

test('non-approved text and non-Saasuna identity fail closed', () => {
  const wrongText = saasunaControl();
  assert.equal(wrongText.arm({ replyId: 'reply-2', text: '任せた！' }), false);

  const wrongPartner = createPartnerAdviceQuickReplyControl({ getPartnerId: () => 'partner.other' });
  assert.equal(wrongPartner.arm({ replyId: 'reply-3', text: 'まかせた！' }), true);
  assert.equal(wrongPartner.commit('reply-3'), null);
  assert.equal(wrongPartner.status().pendingReplyId, 'reply-3');
});

test('stale dialogue version or source never emits a character line and keeps the reply unconsumed', () => {
  for (const control of [
    saasunaControl({ getDialogueVersion: () => 'stale' }),
    saasunaControl({ getSourceId: () => 'stale' }),
  ]) {
    assert.equal(control.arm({ replyId: 'reply-stale', text: 'まかせた！' }), true);
    assert.equal(control.commit('reply-stale'), null);
    assert.equal(control.status().pendingReplyId, 'reply-stale');
    assert.deepEqual(control.status().committedReplyIds, []);
  }
});
