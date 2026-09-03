import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSaasunaConversationSource,
  selectSaasunaBattleUtterance,
  SAASUNA_PARTNER_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_DIALOGUE_SOURCE_ID,
  SAASUNA_BATTLE_SPEECH_ACT,
} from '../browser/partner-saasuna-conversation-source.mjs';

function currentInput(overrides = {}) {
  return {
    partnerId: SAASUNA_PARTNER_ID,
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    speechAct: SAASUNA_BATTLE_SPEECH_ACT,
    ...overrides,
  };
}

const FORBIDDEN_NON_WINNING_TRIGGER_IDS = Object.freeze([
  'game_result_non_first',
  'attack_side_loss',
  'attack_side_loss_opponent_royal_nonlethal',
  'attack_side_loss_opponent_max_lane_unchanged_2p',
  'defense_side_nonlethal_loss',
]);

test('current source exposes only formally connected allowed battle trigger ids', () => {
  const source = getSaasunaConversationSource();
  assert.ok(source);
  assert.deepEqual(source.approvedBattleTriggerIds, [
    'battle_start',
    'initial_hand_intro',
    'duplicate_numbers',
    'honey_gained',
    'first_turn_start',
    'load_submit',
    'battle_card_submit',
    'load_reveal',
    'royal_reveal',
    'effect_activation',
    'delegate_normal',
    'game_result_first',
    'attack_side_win',
    'defense_side_win',
  ]);
  for (const triggerId of FORBIDDEN_NON_WINNING_TRIGGER_IDS) {
    assert.equal(source.approvedBattleTriggerIds.includes(triggerId), false);
  }
  assert.equal(source.approvedBattleTriggerIds.includes('battle_phase'), false);
  assert.equal(source.approvedBattleTriggerIds.includes('near_lost'), false);
  assert.equal(source.unresolvedDialogueEnabled, false);
});

test('selector fails closed unless partner, version, source and character speech act all match', () => {
  assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId: 'battle_start' })).text,
    'ご主人様が心配する事はございません、全て片付けてしまいます');
  assert.equal(selectSaasunaBattleUtterance(currentInput({ partnerId: 'partner.other', triggerId: 'battle_start' })), null);
  assert.equal(selectSaasunaBattleUtterance(currentInput({ dialogueVersion: 'stale', triggerId: 'battle_start' })), null);
  assert.equal(selectSaasunaBattleUtterance(currentInput({ sourceId: 'stale', triggerId: 'battle_start' })), null);
  assert.equal(selectSaasunaBattleUtterance(currentInput({ speechAct: 'diagnostic', triggerId: 'battle_start' })), null);
  assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId: 'battle_phase' })), null);
});

test('forbidden non-winning result classifications have no approved utterance', () => {
  for (const triggerId of FORBIDDEN_NON_WINNING_TRIGGER_IDS) {
    assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId })), null);
  }
});

test('approved card-name templates require explicit public field and never leak unresolved placeholders', () => {
  assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId: 'load_reveal' })), null);
  assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId: 'effect_activation', fields: { cardName: ' ' } })), null);
  assert.equal(
    selectSaasunaBattleUtterance(currentInput({ triggerId: 'load_reveal', fields: { cardName: 'J♠' } })).text,
    'ロード！J♠',
  );
  assert.equal(
    selectSaasunaBattleUtterance(currentInput({ triggerId: 'effect_activation', fields: { cardName: '大氷結' } })).text,
    '大氷結の効果発動！',
  );
});

test('first-place synonym selection is deterministic and cannot invent a third line', () => {
  const allowed = new Set(['これにて終演', 'ふう…戦略通り']);
  const first = selectSaasunaBattleUtterance(currentInput({ triggerId: 'game_result_first', seed: 'match-42' }));
  const again = selectSaasunaBattleUtterance(currentInput({ triggerId: 'game_result_first', seed: 'match-42' }));
  assert.ok(allowed.has(first.text));
  assert.equal(first.text, again.text);
  assert.equal(first.automaticCanonMutationAllowed, false);
  assert.equal(first.automaticGameMutationAllowed, false);
});

test('remaining connected combat lines remain exact approved source text', () => {
  const expected = new Map([
    ['delegate_normal', 'かしこまりました'],
    ['attack_side_win', 'お見通しだよ'],
    ['defense_side_win', 'あら、運がお悪い'],
  ]);
  for (const [triggerId, text] of expected) {
    assert.equal(selectSaasunaBattleUtterance(currentInput({ triggerId })).text, text);
  }
});
