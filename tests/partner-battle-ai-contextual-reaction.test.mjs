import test from 'node:test';
import assert from 'node:assert/strict';

import { createSaasunaBattleAiCharacterReactionControl } from '../browser/partner-advice-runtime-mount.mjs';
import {
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
} from '../browser/partner-saasuna-conversation-source.mjs';

function resolution(fingerprint = 'battle-event-1', label = '7♠') {
  return { fingerprint, cards: [{ label }] };
}

function fixedResolver({ partnerId, triggerId, fields }) {
  return {
    partnerId,
    triggerId,
    text: `固定反応:${fields.cardName}`,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    speechAct: 'character_utterance',
    sourceState: 'approved_current',
  };
}

function request(control, input) {
  return new Promise((resolve, reject) => {
    const accepted = control.request({ ...input, onResolved: resolve });
    if (!accepted) reject(new Error('request rejected'));
  });
}

test('confirmed Saasuna card event uses provider candidate as presentation-only reaction', async () => {
  let calls = 0;
  const provider = {
    async sendMessage(request) {
      calls += 1;
      assert.match(request.userMessage, /7♠/);
      assert.match(request.userMessage, /勝敗.*推測しない/);
      return {
        kind: 'utterance_candidate',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        text: 'ふふ、そこを切りましたか。',
      };
    },
  };
  const control = createSaasunaBattleAiCharacterReactionControl({ provider, resolveUtterance: fixedResolver });
  const receipt = await request(control, { partnerId: SAASUNA_PARTNER_ID, resolution: resolution() });
  assert.equal(calls, 1);
  assert.equal(receipt.partnerText, 'ふふ、そこを切りましたか。');
  assert.equal(receipt.responseOrigin, 'provider_candidate');
  assert.equal(receipt.canonStatus, 'ephemeral_candidate');
  assert.equal(receipt.presentationOnly, true);
  assert.equal(receipt.gameplayAuthorityMutated, false);
  assert.equal(receipt.automaticCanonMutationAllowed, false);
  assert.equal(receipt.automaticRelationshipMutationAllowed, false);
  assert.equal(receipt.automaticGameMutationAllowed, false);
});

test('provider failure falls back to existing approved battle reaction, not generic AI fallback', async () => {
  const provider = { async sendMessage() { throw new Error('provider down'); } };
  const control = createSaasunaBattleAiCharacterReactionControl({ provider, resolveUtterance: fixedResolver });
  const receipt = await request(control, { partnerId: SAASUNA_PARTNER_ID, resolution: resolution('battle-event-2', 'Q♥') });
  assert.equal(receipt.partnerText, '固定反応:Q♥');
  assert.equal(receipt.triggerId, 'battle_card_submit');
  assert.equal(receipt.presentationOnly, true);
});

test('same confirmed event is attempted only once even while provider is pending', async () => {
  let release;
  let calls = 0;
  const provider = {
    async sendMessage(request) {
      calls += 1;
      await new Promise((resolve) => { release = resolve; });
      return {
        kind: 'utterance_candidate',
        partnerId: request.partnerId,
        dialogueVersion: request.dialogueVersion,
        sourceId: request.sourceId,
        text: '一度だけです。',
      };
    },
  };
  const control = createSaasunaBattleAiCharacterReactionControl({ provider, resolveUtterance: fixedResolver });
  const first = new Promise((resolve) => {
    assert.equal(control.request({ partnerId: SAASUNA_PARTNER_ID, resolution: resolution('same-event'), onResolved: resolve }), true);
  });
  assert.equal(control.request({ partnerId: SAASUNA_PARTNER_ID, resolution: resolution('same-event'), onResolved() {} }), false);
  release();
  await first;
  assert.equal(control.request({ partnerId: SAASUNA_PARTNER_ID, resolution: resolution('same-event'), onResolved() {} }), false);
  assert.equal(calls, 1);
});

test('primed reconnect event is not replayed and other partners do not enter Saasuna AI lane', () => {
  let calls = 0;
  const provider = { async sendMessage() { calls += 1; return null; } };
  const control = createSaasunaBattleAiCharacterReactionControl({ provider, resolveUtterance: fixedResolver });
  assert.equal(control.prime(resolution('already-settled')), true);
  assert.equal(control.request({ partnerId: SAASUNA_PARTNER_ID, resolution: resolution('already-settled'), onResolved() {} }), false);
  assert.equal(control.request({ partnerId: 'partner.other', resolution: resolution('new-other'), onResolved() {} }), false);
  assert.equal(calls, 0);
});
