const SCHEMA = 'gameroad.battle-current-action-context-presentation.v1';
const AUTHORITY_BOUNDARY = 'caller_authoritative_public_state';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value, code) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(code);
  return value.trim();
}

function optionalString(value, code) {
  if (value == null) return null;
  return nonEmptyString(value, code);
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new TypeError('BATTLE_CURRENT_ACTION_CONTEXT_PARTICIPANTS_REQUIRED');
  }
  const rows = participants.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('BATTLE_CURRENT_ACTION_CONTEXT_PARTICIPANT_INVALID');
    }
    return {
      id: nonEmptyString(raw.id, 'BATTLE_CURRENT_ACTION_CONTEXT_PARTICIPANT_ID_INVALID'),
      label: optionalString(raw.label, 'BATTLE_CURRENT_ACTION_CONTEXT_PARTICIPANT_LABEL_INVALID') ?? `P${index + 1}`
    };
  });
  if (new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new TypeError('BATTLE_CURRENT_ACTION_CONTEXT_PARTICIPANT_IDS_NOT_UNIQUE');
  }
  return rows;
}

function requireKnownParticipant(participantsById, participantId, code) {
  const id = nonEmptyString(participantId, code);
  const participant = participantsById.get(id);
  if (!participant) throw new TypeError(`${code}_UNKNOWN:${id}`);
  return participant;
}

function displayLine(kind, label, text) {
  return deepFreeze({
    kind,
    label,
    text,
    display: `${label}：${text}`
  });
}

/**
 * Projects already-authoritative public Battle facts into compact player-facing
 * context. This module does not decide whose turn it is, whether an action is
 * legal, why the game is waiting, or what hidden state exists. The caller must
 * supply those facts after its own authoritative/public-information checks.
 */
export function projectBattleCurrentActionContext({
  authorityBoundary,
  participants,
  viewerParticipantId,
  inputOwnerParticipantId = null,
  currentAction = null,
  waitReason = null
} = {}) {
  if (authorityBoundary !== AUTHORITY_BOUNDARY) {
    throw new TypeError('BATTLE_CURRENT_ACTION_CONTEXT_PUBLIC_AUTHORITY_REQUIRED');
  }

  const normalizedParticipants = normalizeParticipants(participants);
  const participantsById = new Map(normalizedParticipants.map(row => [row.id, row]));
  const viewer = requireKnownParticipant(
    participantsById,
    viewerParticipantId,
    'BATTLE_CURRENT_ACTION_CONTEXT_VIEWER_INVALID'
  );
  const inputOwner = inputOwnerParticipantId == null
    ? null
    : requireKnownParticipant(
        participantsById,
        inputOwnerParticipantId,
        'BATTLE_CURRENT_ACTION_CONTEXT_INPUT_OWNER_INVALID'
      );

  const normalizedCurrentAction = optionalString(
    currentAction,
    'BATTLE_CURRENT_ACTION_CONTEXT_CURRENT_ACTION_INVALID'
  );
  const normalizedWaitReason = optionalString(
    waitReason,
    'BATTLE_CURRENT_ACTION_CONTEXT_WAIT_REASON_INVALID'
  );

  const ownerRelation = inputOwner == null
    ? 'UNRESOLVED'
    : inputOwner.id === viewer.id
      ? 'SELF'
      : 'OTHER';
  const waitingFor = ownerRelation === 'OTHER'
    ? deepFreeze({ participantId: inputOwner.id, label: inputOwner.label })
    : null;

  const lines = [];
  if (normalizedCurrentAction) {
    lines.push(displayLine('current_action', '今', normalizedCurrentAction));
  }
  if (waitingFor) {
    lines.push(displayLine('waiting_for', '待ち', waitingFor.label));
  }
  if (normalizedWaitReason) {
    lines.push(displayLine('reason', '理由', normalizedWaitReason));
  }

  const output = {
    schema: SCHEMA,
    presentationOnly: true,
    authorityBoundary: AUTHORITY_BOUNDARY,
    gameplayAuthority: false,
    controlAuthority: false,
    legalityAuthority: false,
    targetAuthority: false,
    turnAuthority: false,
    waitReasonAuthority: false,
    secretExpansion: false,
    gameStateWrite: false,
    viewer: { participantId: viewer.id, label: viewer.label },
    inputOwner: inputOwner
      ? { participantId: inputOwner.id, label: inputOwner.label }
      : null,
    ownerRelation,
    viewerOwnsInput: ownerRelation === 'SELF',
    waitingFor,
    currentAction: normalizedCurrentAction,
    waitReason: normalizedWaitReason,
    lines,
    text: lines.map(line => line.display).join(' / '),
    visible: lines.length > 0
  };
  return deepFreeze(output);
}

export function isBattleCurrentActionContextPresentation(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.schema === SCHEMA
      && value.presentationOnly === true
      && value.authorityBoundary === AUTHORITY_BOUNDARY
      && value.gameplayAuthority === false
      && value.controlAuthority === false
      && value.legalityAuthority === false
      && value.targetAuthority === false
      && value.turnAuthority === false
      && value.waitReasonAuthority === false
      && value.secretExpansion === false
      && value.gameStateWrite === false
      && ['SELF', 'OTHER', 'UNRESOLVED'].includes(value.ownerRelation)
      && Array.isArray(value.lines)
      && typeof value.visible === 'boolean'
  );
}

export const BATTLE_CURRENT_ACTION_CONTEXT_PRESENTATION = deepFreeze({
  schema: SCHEMA,
  authorityBoundary: AUTHORITY_BOUNDARY,
  presentationOnly: true,
  inputOwnerAuthority: 'CALLER',
  currentActionAuthority: 'CALLER',
  waitReasonAuthority: 'CALLER',
  participantIdentityAuthority: 'CALLER',
  computesControlOwner: false,
  computesTurnOwner: false,
  computesLegality: false,
  computesTarget: false,
  computesWaitReason: false,
  expandsSecrets: false,
  writesGameState: false,
  displayLabels: Object.freeze({
    currentAction: '今',
    waitingFor: '待ち',
    reason: '理由'
  })
});
