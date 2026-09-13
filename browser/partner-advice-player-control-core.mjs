const CONTROL_SCHEMA = 'gameroad.partner-advice-player-control.v1';
const REPLY_PAIR_SCHEMA = 'gameroad.partner-advice-reply-pair.v1';

export const PARTNER_ADVICE_DELEGATE_TEXT = 'まかせた！';
export const PARTNER_ADVICE_RECLAIM_TEXT = 'まかせろ！';

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max || /[\u0000-\u001f\u007f]/.test(token)) return null;
  return token;
}

function inactiveDelegation(reason) {
  return Object.freeze({
    schema: CONTROL_SCHEMA,
    visible: false,
    reason,
    delegated: null,
    label: null,
    action: null,
    sourceId: null,
    generation: null,
    presentationOnly: true,
    autoExecute: false,
    gameplayAuthorityMutated: false,
  });
}

export function projectPartnerAdviceDelegationControl({ authority } = {}) {
  if (!authority || typeof authority !== 'object' || Array.isArray(authority)) {
    return inactiveDelegation('CURRENT_DELEGATION_AUTHORITY_REQUIRED');
  }
  const sourceId = exactToken(authority.sourceId);
  const generation = Number(authority.generation);
  if (authority.current !== true || !sourceId || !Number.isSafeInteger(generation) || generation < 0 || typeof authority.delegated !== 'boolean') {
    return inactiveDelegation('CURRENT_DELEGATION_AUTHORITY_REQUIRED');
  }

  const delegated = authority.delegated;
  const allowed = delegated ? authority.canReclaim === true : authority.canDelegate === true;
  if (!allowed) return inactiveDelegation(delegated ? 'RECLAIM_NOT_ALLOWED' : 'DELEGATION_NOT_ALLOWED');

  return Object.freeze({
    schema: CONTROL_SCHEMA,
    visible: true,
    reason: null,
    delegated,
    label: delegated ? PARTNER_ADVICE_RECLAIM_TEXT : PARTNER_ADVICE_DELEGATE_TEXT,
    action: delegated ? 'request-player-reclaim' : 'request-partner-delegation',
    sourceId,
    generation,
    presentationOnly: true,
    autoExecute: false,
    gameplayAuthorityMutated: false,
  });
}

function inactiveReplyPair(reason) {
  return Object.freeze({
    schema: REPLY_PAIR_SCHEMA,
    visible: false,
    reason,
    sourceId: null,
    dialogueVersion: null,
    conversationId: null,
    options: Object.freeze([]),
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

function approvedReplyOption(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = exactToken(value.id, 96);
  const label = exactToken(value.label, 240);
  if (!id || !label || label === PARTNER_ADVICE_DELEGATE_TEXT || label === PARTNER_ADVICE_RECLAIM_TEXT) return null;
  return Object.freeze({ id, label });
}

export function projectPartnerAdviceReplyPair({ source } = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || source.approvedCurrent !== true) {
    return inactiveReplyPair('APPROVED_CURRENT_REPLY_SOURCE_REQUIRED');
  }
  const sourceId = exactToken(source.sourceId);
  const dialogueVersion = exactToken(source.dialogueVersion, 96);
  const conversationId = exactToken(source.conversationId, 96);
  if (!sourceId || !dialogueVersion || !conversationId || !Array.isArray(source.options) || source.options.length !== 2) {
    return inactiveReplyPair('EXACT_TWO_APPROVED_REPLIES_REQUIRED');
  }
  const options = source.options.map(approvedReplyOption);
  if (options.some((option) => !option) || options[0].id === options[1].id || options[0].label === options[1].label) {
    return inactiveReplyPair('EXACT_TWO_APPROVED_REPLIES_REQUIRED');
  }

  return Object.freeze({
    schema: REPLY_PAIR_SCHEMA,
    visible: true,
    reason: null,
    sourceId,
    dialogueVersion,
    conversationId,
    options: Object.freeze(options),
    presentationOnly: true,
    autoExecute: false,
    emits2v2Ping: false,
    gameplayAuthorityMutated: false,
  });
}

export const PARTNER_ADVICE_PLAYER_CONTROL_CONTRACT = Object.freeze({
  controlSchema: CONTROL_SCHEMA,
  replyPairSchema: REPLY_PAIR_SCHEMA,
  delegationText: PARTNER_ADVICE_DELEGATE_TEXT,
  reclaimText: PARTNER_ADVICE_RECLAIM_TEXT,
});
