export const BATTLE_REPLAY_SELF_CHOICE_REGISTRATION = Object.freeze({
  schema: 'gameroad.battle-replay-self-choice-registration.v1',
  replaySchema: 'GAMEROAD_BATTLE_REPLAY_V1',
  sourceAuthority: 'accepted_replay_public_event_only',
  identityPolicy: 'match_event_player_index_bundle',
  evaluationAuthority: 'USER_EXPLICIT_ONLY',
  autoRegister: false,
  objectiveCorrectness: false,
  collectiveWrite: false,
  gameplayWrite: false,
});

const REPLAY_SCHEMA = BATTLE_REPLAY_SELF_CHOICE_REGISTRATION.replaySchema;
const VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function token(value, max = 192) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

function exactVersions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const current = token(value[key], 192);
    if (!current) return null;
    out[key] = current;
  }
  return out;
}

function publicCardIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 16) return null;
  const ids = [];
  for (const card of value) {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return null;
    const cardId = token(card.cardId, 160);
    if (!cardId) return null;
    ids.push(cardId);
  }
  return ids;
}

function terminalIndex(events) {
  const indexes = [];
  for (let index = 0; index < events.length; index += 1) {
    if (events[index]?.kind === 'match_ended') indexes.push(index);
  }
  if (indexes.length === 0) return { ok: true, index: null };
  if (indexes.length !== 1 || indexes[0] !== events.length - 1) return { ok: false, index: null };
  return { ok: true, index: indexes[0] };
}

function reject(reason) {
  return deepFreeze({
    ok: false,
    schema: BATTLE_REPLAY_SELF_CHOICE_REGISTRATION.schema,
    reason,
    choices: [],
    containsPrivate: false,
    autoRegister: false,
    objectiveCorrectness: false,
    collectiveWrite: false,
    gameplayWrite: false,
  });
}

/**
 * Projects only the authenticated viewer's own accepted public Battle choice bundles.
 *
 * The function never creates a second replay/event record. A choice identity is derived
 * from the already-accepted replay event plus the stable player-array index inside that
 * event. The registrationRef is deliberately limited to the four fields needed by the
 * current GOOD/MISPLAY registration contract. Evaluation, persistence, anonymous
 * aggregation and Partner confirmation remain downstream responsibilities.
 */
export function projectReplaySelfChoiceRegistration({ replayRead, viewer } = {}) {
  if (!replayRead || typeof replayRead !== 'object' || Array.isArray(replayRead)) {
    return reject('REPLAY_REQUIRED');
  }
  if (replayRead.ok !== true || replayRead.status !== 'ready' || replayRead.schema !== REPLAY_SCHEMA) {
    return reject('REPLAY_NOT_READY');
  }
  const matchId = token(replayRead.matchId, 160);
  const versions = exactVersions(replayRead.versions);
  if (!matchId || !versions || !Array.isArray(replayRead.events)) return reject('REPLAY_IDENTITY_INVALID');

  const viewerId = viewer?.authenticated === true ? token(viewer?.id, 160) : null;
  if (!viewerId) return reject('AUTHENTICATED_VIEWER_REQUIRED');

  const terminal = terminalIndex(replayRead.events);
  if (!terminal.ok) return reject('MATCH_END_ORDER_INVALID');
  const matchEnded = terminal.index !== null;
  const choices = [];

  for (let index = 0; index < replayRead.events.length; index += 1) {
    const event = replayRead.events[index];
    if (!event || typeof event !== 'object' || Array.isArray(event)) return reject('EVENT_INVALID');
    const sequence = positiveInteger(event.sequence);
    const kind = token(event.kind, 64);
    if (sequence === null || sequence !== index + 1 || !kind) return reject('EVENT_IDENTITY_INVALID');
    if (kind !== 'battle_resolution') continue;

    const publicData = event.publicData;
    if (!publicData || typeof publicData !== 'object' || Array.isArray(publicData) || !Array.isArray(publicData.players)) {
      return reject('BATTLE_RESOLUTION_PUBLIC_DATA_INVALID');
    }
    const ownMatches = [];
    for (let playerIndex = 0; playerIndex < publicData.players.length; playerIndex += 1) {
      const player = publicData.players[playerIndex];
      if (!player || typeof player !== 'object' || Array.isArray(player)) return reject('BATTLE_PLAYER_INVALID');
      const playerId = token(player.id, 160);
      if (!playerId) return reject('BATTLE_PLAYER_ID_INVALID');
      if (playerId === viewerId) ownMatches.push({ playerIndex, player });
    }
    if (ownMatches.length > 1) return reject('OWN_CHOICE_AMBIGUOUS');
    if (ownMatches.length === 0) continue;

    const { playerIndex, player } = ownMatches[0];
    const cardIds = publicCardIds(player.cards);
    if (!cardIds) return reject('OWN_CHOICE_CARDS_INVALID');
    const eventId = `${matchId}:${sequence}`;
    const choiceId = `${eventId}:player:${playerIndex}`;
    const round = positiveInteger(publicData.round);
    const mode = token(publicData.mode, 32);
    if (round === null || !mode) return reject('OWN_CHOICE_CONTEXT_INVALID');

    choices.push(deepFreeze({
      eventSequence: sequence,
      playerIndex,
      registrationRef: {
        matchId,
        choiceId,
        eventId,
        rulesVersion: versions.rules,
      },
      display: {
        round,
        mode,
        cardIds,
      },
      pendingEligible: true,
      registrable: matchEnded,
      registrationState: matchEnded ? 'POST_MATCH_READY' : 'PENDING_MATCH_END',
      evaluation: null,
      bestMove: null,
      correctAnswer: null,
      containsPrivate: false,
    }));
  }

  return deepFreeze({
    ok: true,
    schema: BATTLE_REPLAY_SELF_CHOICE_REGISTRATION.schema,
    sourceSchema: REPLAY_SCHEMA,
    matchId,
    rulesVersion: versions.rules,
    matchEnded,
    choices,
    containsPrivate: false,
    autoRegister: false,
    objectiveCorrectness: false,
    collectiveWrite: false,
    gameplayWrite: false,
  });
}
