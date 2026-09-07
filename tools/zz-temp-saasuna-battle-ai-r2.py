from pathlib import Path
import subprocess

TARGET = Path('browser/partner-advice-runtime-mount.mjs')
TEST = Path('tests/partner-battle-ai-contextual-reaction.test.mjs')
EXPECTED_BLOB = '7f057a2d89b566b27350f0c65fa6809e1895e455'

actual = subprocess.check_output(['git', 'hash-object', str(TARGET)], text=True).strip()
if actual != EXPECTED_BLOB:
    raise SystemExit(f'partner advice blob mismatch: {actual}')

text = TARGET.read_text(encoding='utf-8')

import_marker = "import { readBattleR75SelfHudDom } from './partner-battle-event-log-projection.mjs';\n"
import_insert = "import { runSaasunaConversationTurn } from './partner-conversation-core.mjs';\nimport { createSaasunaEdgeProvider } from './board-facility-runtime-mount.mjs';\n"
if import_insert not in text:
    if text.count(import_marker) != 1:
        raise SystemExit('import marker mismatch')
    text = text.replace(import_marker, import_marker + import_insert, 1)

chat_marker = "const CHAT_PRESENTATION_SCHEMA = 'gameroad.partner-advice-chat-presentation.v1';"
helper = r'''function saasunaBattleAiReactionPrompt(cardName) {
  return `【ゲーム内の確定情報】プレイヤーがバトルカード「${cardName}」を使用し、その使用は確定しました。サースナーとして短く自然に一言だけ反応してください。同じ内容を言い直さず、勝敗・相手の手札・未確定の戦況は推測しないでください。`;
}

export function createSaasunaBattleAiCharacterReactionControl({
  provider = null,
  runConversationTurn = runSaasunaConversationTurn,
  resolveUtterance = resolveApprovedPartnerBattleCharacterUtterance,
} = {}) {
  if (provider !== null && (typeof provider !== 'object' || typeof provider.sendMessage !== 'function')) {
    throw new TypeError('provider must expose sendMessage or be null');
  }
  if (typeof runConversationTurn !== 'function') throw new TypeError('runConversationTurn must be a function');
  if (typeof resolveUtterance !== 'function') throw new TypeError('resolveUtterance must be a function');

  const consumed = new Set();
  const pending = new Set();
  const fallback = createPartnerBattleCharacterReactionControl({ resolveUtterance });

  const aiReceipt = (partnerId, input, turn) => {
    const descriptor = approvedPartnerDialogueDescriptor(partnerId);
    const text = exactPresentationToken(turn?.utterance);
    if (
      partnerId !== SAASUNA_PARTNER_ID ||
      !descriptor ||
      turn?.ok !== true ||
      turn?.responseOrigin !== 'provider_candidate' ||
      turn?.partnerId !== partnerId ||
      turn?.dialogueVersion !== descriptor.dialogueVersion ||
      turn?.sourceId !== descriptor.sourceId ||
      !text
    ) {
      return null;
    }
    return Object.freeze({
      schema: CHARACTER_REACTION_SCHEMA,
      eventFingerprint: input.fingerprint,
      triggerId: CHARACTER_REACTION_TRIGGER_ID,
      cardName: input.cardName,
      partnerId,
      partnerText: text,
      sourceId: turn.sourceId,
      dialogueVersion: turn.dialogueVersion,
      speechAct: descriptor.battleSpeechAct,
      responseOrigin: 'provider_candidate',
      canonStatus: 'ephemeral_candidate',
      presentationOnly: true,
      gameplayAuthorityMutated: false,
      automaticCanonMutationAllowed: false,
      automaticRelationshipMutationAllowed: false,
      automaticGameMutationAllowed: false,
      exactlyOncePerConfirmedEvent: true,
    });
  };

  return Object.freeze({
    prime(resolution) {
      const input = confirmedCardReactionInput(resolution);
      if (!input) return false;
      consumed.add(input.fingerprint);
      fallback.prime(resolution);
      return true;
    },
    request({ partnerId, resolution, onResolved } = {}) {
      const id = exactPresentationToken(partnerId);
      const input = confirmedCardReactionInput(resolution);
      if (
        id !== SAASUNA_PARTNER_ID ||
        !input ||
        consumed.has(input.fingerprint) ||
        pending.has(input.fingerprint) ||
        typeof onResolved !== 'function'
      ) {
        return false;
      }
      pending.add(input.fingerprint);

      void (async () => {
        let receipt = null;
        try {
          if (provider) {
            const turn = await runConversationTurn({
              partnerId: id,
              sessionId: 'battle-character-reaction',
              turnId: input.fingerprint,
              userMessage: saasunaBattleAiReactionPrompt(input.cardName),
            }, { provider });
            receipt = aiReceipt(id, input, turn);
          }
        } catch {
          receipt = null;
        }

        if (!receipt) {
          receipt = fallback.consume({ partnerId: id, resolution });
        } else {
          fallback.prime(resolution);
        }
        consumed.add(input.fingerprint);
        pending.delete(input.fingerprint);
        try { onResolved(receipt); } catch {}
      })();
      return true;
    },
    status() {
      return Object.freeze({
        schema: CHARACTER_REACTION_SCHEMA,
        consumedEventFingerprints: Object.freeze([...consumed]),
        pendingEventFingerprints: Object.freeze([...pending]),
        providerAvailable: provider !== null,
        presentationOnly: true,
        gameplayAuthorityMutated: false,
        autoExecute: false,
      });
    },
  });
}

'''
if helper not in text:
    if text.count(chat_marker) != 1:
        raise SystemExit('chat marker mismatch')
    text = text.replace(chat_marker, helper + chat_marker, 1)

old_setup = "  const characterReaction = createPartnerBattleCharacterReactionControl();\n  characterReaction.prime(readBattleR75SelfHudDom(doc)?.resolution);"
new_setup = "  const characterReaction = createPartnerBattleCharacterReactionControl();\n  const saasunaAiReaction = createSaasunaBattleAiCharacterReactionControl({ provider: createSaasunaEdgeProvider(win) });\n  const initialCharacterResolution = readBattleR75SelfHudDom(doc)?.resolution;\n  characterReaction.prime(initialCharacterResolution);\n  saasunaAiReaction.prime(initialCharacterResolution);"
if new_setup not in text:
    if text.count(old_setup) != 1:
        raise SystemExit('setup marker mismatch')
    text = text.replace(old_setup, new_setup, 1)

old_render = "    const nextReaction = characterReaction.consume({ partnerId: current?.partnerId, resolution: confirmedSelf?.resolution });\n    if (nextReaction) lastCharacterReaction = nextReaction;"
new_render = r'''    if (current?.partnerId === SAASUNA_PARTNER_ID) {
      saasunaAiReaction.request({
        partnerId: current.partnerId,
        resolution: confirmedSelf?.resolution,
        onResolved(nextReaction) {
          const latestResolution = readBattleR75SelfHudDom(doc)?.resolution;
          const latestInput = confirmedCardReactionInput(latestResolution);
          if (
            nextReaction &&
            currentAdvicePartnerId(win) === SAASUNA_PARTNER_ID &&
            latestInput?.fingerprint === nextReaction.eventFingerprint
          ) {
            lastCharacterReaction = nextReaction;
          }
          queueMicrotask(render);
        },
      });
    } else {
      const nextReaction = characterReaction.consume({ partnerId: current?.partnerId, resolution: confirmedSelf?.resolution });
      if (nextReaction) lastCharacterReaction = nextReaction;
    }'''
if new_render not in text:
    if text.count(old_render) != 1:
        raise SystemExit('render marker mismatch')
    text = text.replace(old_render, new_render, 1)

old_return = "  return Object.freeze({ root, render, tutorialReplay, tutorialExperience, characterReaction });"
new_return = "  return Object.freeze({ root, render, tutorialReplay, tutorialExperience, characterReaction, saasunaAiReaction });"
if new_return not in text:
    if text.count(old_return) != 1:
        raise SystemExit('return marker mismatch')
    text = text.replace(old_return, new_return, 1)

TARGET.write_text(text, encoding='utf-8')

TEST.write_text(r'''import test from 'node:test';
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
''', encoding='utf-8')

print('patched Saasuna battle AI contextual reaction R2')
