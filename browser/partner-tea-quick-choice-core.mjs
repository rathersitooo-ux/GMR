import { runSaasunaConversationTurn } from './partner-conversation-core.mjs';
import { SAASUNA_PARTNER_ID } from './partner-saasuna-conversation-source.mjs';

const CORE_ID = 'gameroad.partner-tea-quick-choice.v1';

const CHOICES = Object.freeze([
  Object.freeze({ id: 'study', label: '勉強する' }),
  Object.freeze({ id: 'consult', label: '相談する' }),
]);

const CHOICE_IDS = new Set(CHOICES.map((choice) => choice.id));
const CHOICE_BY_ID = new Map(CHOICES.map((choice) => [choice.id, choice]));

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function exactToken(value, max = 160) {
  if (typeof value !== 'string' || !value || value.length > max || value.trim() !== value) return null;
  return value;
}

function fail(reason) {
  return freezeDeep({
    ok: false,
    coreId: CORE_ID,
    reason,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
    rawFreeTextAccepted: false,
  });
}

function boundary(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'INPUT_REQUIRED' };
  const partnerId = exactToken(input.partnerId);
  const sessionId = exactToken(input.sessionId);
  if (!partnerId) return { error: 'PARTNER_REQUIRED' };
  if (partnerId !== SAASUNA_PARTNER_ID) return { error: 'PARTNER_NOT_SAASUNA' };
  if (!sessionId) return { error: 'SESSION_REQUIRED' };
  return { partnerId, sessionId };
}

export function openTeaQuickChoice(input = {}) {
  const checked = boundary(input);
  if (checked.error) return fail(checked.error);

  return freezeDeep({
    ok: true,
    coreId: CORE_ID,
    partnerId: checked.partnerId,
    sessionId: checked.sessionId,
    presentation: 'quick_choice',
    choices: CHOICES.map((choice) => ({ ...choice })),
    freeTalkRoute: 'separate',
    rawFreeTextAccepted: false,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export function selectTeaQuickChoice(input = {}) {
  const checked = boundary(input);
  if (checked.error) return fail(checked.error);
  if ('freeText' in input || 'userMessage' in input) return fail('RAW_FREE_TEXT_NOT_ACCEPTED');

  const choiceId = exactToken(input.choiceId, 32);
  if (!choiceId || !CHOICE_IDS.has(choiceId)) return fail('CHOICE_INVALID');

  return freezeDeep({
    ok: true,
    coreId: CORE_ID,
    kind: 'tea_quick_choice_intent',
    partnerId: checked.partnerId,
    sessionId: checked.sessionId,
    choiceId,
    intent: choiceId,
    downstreamUseSite: 'partner-conversation',
    freeTalkRoute: 'separate',
    rawFreeTextAccepted: false,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export async function runTeaQuickChoiceTurn(input = {}, deps = {}) {
  const intent = selectTeaQuickChoice(input);
  if (!intent.ok) return intent;

  const turnId = exactToken(input.turnId);
  if (!turnId) return fail('TURN_REQUIRED');

  const choice = CHOICE_BY_ID.get(intent.choiceId);
  const turn = await runSaasunaConversationTurn({
    partnerId: intent.partnerId,
    sessionId: intent.sessionId,
    turnId,
    userMessage: choice.label,
    collectiveContext: deps.collectiveContext ?? null,
  }, { provider: deps.provider ?? null });

  if (!turn.ok) return fail('CONVERSATION_TURN_FAILED');

  return freezeDeep({
    ok: true,
    coreId: CORE_ID,
    kind: 'tea_quick_choice_turn',
    partnerId: intent.partnerId,
    sessionId: intent.sessionId,
    turnId,
    choiceId: intent.choiceId,
    intent: intent.intent,
    downstreamUseSite: intent.downstreamUseSite,
    turn,
    rawFreeTextAccepted: false,
    relationshipMutationAllowed: false,
    rewardMutationAllowed: false,
    saveMutationAllowed: false,
  });
}

export const PARTNER_TEA_QUICK_CHOICE_CORE_ID = CORE_ID;
export const PARTNER_TEA_QUICK_CHOICES = CHOICES;
