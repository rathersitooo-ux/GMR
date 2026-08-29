import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openTeaQuickChoice,
  selectTeaQuickChoice,
  runTeaQuickChoiceTurn,
  PARTNER_TEA_QUICK_CHOICES,
} from '../browser/partner-tea-quick-choice-core.mjs';
import { SAASUNA_PARTNER_ID } from '../browser/partner-saasuna-conversation-source.mjs';

const base = (overrides = {}) => ({
  partnerId: SAASUNA_PARTNER_ID,
  sessionId: 'tea-session-1',
  ...overrides,
});

test('opens Saasuna Tea as two-button quick choice without partner picker', () => {
  const output = openTeaQuickChoice(base());
  assert.equal(output.ok, true);
  assert.deepEqual(output.choices, [
    { id: 'study', label: '勉強する' },
    { id: 'consult', label: '相談する' },
  ]);
  assert.equal(output.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(output.freeTalkRoute, 'separate');
  assert.equal(output.rawFreeTextAccepted, false);
});

test('does not invent or auto-select another partner', () => {
  assert.equal(openTeaQuickChoice({ sessionId: 'tea-session-1' }).reason, 'PARTNER_REQUIRED');
  assert.equal(openTeaQuickChoice(base({ partnerId: 'partner.someone-else' })).reason, 'PARTNER_NOT_SAASUNA');
});

test('study button emits only a structured downstream intent', () => {
  const output = selectTeaQuickChoice(base({ choiceId: 'study' }));
  assert.equal(output.ok, true);
  assert.equal(output.kind, 'tea_quick_choice_intent');
  assert.equal(output.intent, 'study');
  assert.equal(output.downstreamUseSite, 'partner-conversation');
  assert.equal('userMessage' in output, false);
});

test('consult button emits only a structured downstream intent', () => {
  const output = selectTeaQuickChoice(base({ choiceId: 'consult' }));
  assert.equal(output.ok, true);
  assert.equal(output.intent, 'consult');
  assert.equal(output.partnerId, SAASUNA_PARTNER_ID);
  assert.equal(output.sessionId, 'tea-session-1');
});

test('unknown choice and inline free text fail closed', () => {
  assert.equal(selectTeaQuickChoice(base({ choiceId: 'other' })).reason, 'CHOICE_INVALID');
  assert.equal(selectTeaQuickChoice(base({ choiceId: 'study', freeText: '秘密の相談' })).reason, 'RAW_FREE_TEXT_NOT_ACCEPTED');
  assert.equal(selectTeaQuickChoice(base({ choiceId: 'consult', userMessage: '直接入力' })).reason, 'RAW_FREE_TEXT_NOT_ACCEPTED');
});

test('Tea quick choice has no relationship, reward, or save mutation authority', () => {
  for (const output of [openTeaQuickChoice(base()), selectTeaQuickChoice(base({ choiceId: 'study' }))]) {
    assert.equal(output.relationshipMutationAllowed, false);
    assert.equal(output.rewardMutationAllowed, false);
    assert.equal(output.saveMutationAllowed, false);
  }
});

test('published choices and outputs are immutable and deterministic', () => {
  const first = openTeaQuickChoice(base());
  const second = openTeaQuickChoice(base());
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.choices), true);
  assert.equal(Object.isFrozen(PARTNER_TEA_QUICK_CHOICES), true);
});

test('study quick choice executes through existing Saasuna Conversation Core using only the fixed button label', async () => {
  let seen = null;
  const output = await runTeaQuickChoiceTurn(base({ choiceId: 'study', turnId: 'tea-turn-1' }), {
    provider: {
      async sendMessage(request) {
        seen = request;
        return {
          kind: 'utterance_candidate',
          partnerId: request.partnerId,
          dialogueVersion: request.dialogueVersion,
          sourceId: request.sourceId,
          text: '勉強を始めましょう。',
        };
      },
    },
  });
  assert.equal(output.ok, true);
  assert.equal(output.kind, 'tea_quick_choice_turn');
  assert.equal(output.choiceId, 'study');
  assert.equal(seen.userMessage, '勉強する');
  assert.equal(output.turn.responseOrigin, 'provider_candidate');
  assert.equal(output.turn.utterance, '勉強を始めましょう。');
  assert.equal(output.relationshipMutationAllowed, false);
  assert.equal(output.rewardMutationAllowed, false);
  assert.equal(output.saveMutationAllowed, false);
  assert.equal('userMessage' in output, false);
});

test('consult quick choice uses existing approved fallback when provider is absent', async () => {
  const output = await runTeaQuickChoiceTurn(base({ choiceId: 'consult', turnId: 'tea-turn-2' }));
  assert.equal(output.ok, true);
  assert.equal(output.choiceId, 'consult');
  assert.equal(output.turn.responseOrigin, 'approved_fallback');
  assert.equal(output.turn.partnerId, SAASUNA_PARTNER_ID);
});

test('Tea execution still rejects free text and requires an explicit turn boundary', async () => {
  const raw = await runTeaQuickChoiceTurn(base({ choiceId: 'study', turnId: 'tea-turn-3', freeText: '秘密' }));
  assert.equal(raw.ok, false);
  assert.equal(raw.reason, 'RAW_FREE_TEXT_NOT_ACCEPTED');

  const noTurn = await runTeaQuickChoiceTurn(base({ choiceId: 'study' }));
  assert.equal(noTurn.ok, false);
  assert.equal(noTurn.reason, 'TURN_REQUIRED');
});
