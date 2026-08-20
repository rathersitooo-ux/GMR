const TURN_SCHEMA = 'gameroad.multi-agent-match-follow.turn.v1';
const INTENT_SCHEMA = 'gameroad.multi-agent-match-follow.intent.v1';
const OBSERVER_SCHEMA = 'gameroad.multi-agent-match-follow.observer.v1';
const PLAYER_COUNT = 4;

function token(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field}-invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new TypeError(`${field}-invalid`);
  return normalized;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneJson(value, field = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${field}-non-json-number`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => cloneJson(item, `${field}[${index}]`));
  if (!isPlainObject(value)) throw new TypeError(`${field}-non-json-value`);
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = cloneJson(child, `${field}.${key}`);
  }
  return out;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeLegalActions(actions, playerId) {
  if (!Array.isArray(actions)) throw new TypeError(`legalActions-invalid:${playerId}`);
  const seen = new Set();
  return actions.map((action, index) => {
    if (!isPlainObject(action)) throw new TypeError(`legalAction-invalid:${playerId}:${index}`);
    const actionId = token(action.actionId, `actionId:${playerId}:${index}`);
    if (seen.has(actionId)) throw new TypeError(`legalAction-duplicate:${playerId}:${actionId}`);
    seen.add(actionId);
    return {
      actionId,
      kind: action.kind == null ? null : token(action.kind, `actionKind:${playerId}:${index}`),
      publicLabel: action.publicLabel == null ? null : token(action.publicLabel, `actionLabel:${playerId}:${index}`),
    };
  });
}

function contextIdentity(input) {
  return {
    matchId: token(input.matchId, 'matchId'),
    stateVersion: token(input.stateVersion, 'stateVersion'),
    eventCursor: token(input.eventCursor, 'eventCursor'),
  };
}

export function createFourAgentTurn(input) {
  if (!isPlainObject(input)) throw new TypeError('turn-input-invalid');
  const identity = contextIdentity(input);
  if (!Array.isArray(input.players) || input.players.length !== PLAYER_COUNT) {
    throw new TypeError(`players-must-equal-${PLAYER_COUNT}`);
  }

  const playerIds = new Set();
  const players = input.players.map((player, index) => {
    if (!isPlainObject(player)) throw new TypeError(`player-invalid:${index}`);
    const playerId = token(player.playerId, `playerId:${index}`);
    if (playerIds.has(playerId)) throw new TypeError(`playerId-duplicate:${playerId}`);
    playerIds.add(playerId);
    return {
      playerId,
      authorizedProjection: cloneJson(player.authorizedProjection, `authorizedProjection:${playerId}`),
      legalActions: normalizeLegalActions(player.legalActions, playerId),
    };
  });

  return deepFreeze({
    schema: TURN_SCHEMA,
    ...identity,
    authority: {
      matchState: 'CALLER_MATCH_AUTHORITY',
      stateVersion: 'CALLER_OPAQUE_IDENTITY',
      legality: 'CALLER_SUPPLIED_LEGAL_ACTIONS',
      resolution: 'CALLER_MATCH_AUTHORITY',
      storage: 'NONE',
      automaticMutationAllowed: false,
    },
    players,
    submissions: [],
    complete: false,
    missingPlayerIds: players.map((player) => player.playerId),
  });
}

export function createAgentPacket(turn, playerId) {
  validateTurn(turn);
  const normalizedPlayerId = token(playerId, 'playerId');
  const player = turn.players.find((item) => item.playerId === normalizedPlayerId);
  if (!player) throw new TypeError(`player-not-in-turn:${normalizedPlayerId}`);
  return deepFreeze({
    schema: 'gameroad.multi-agent-match-follow.agent-packet.v1',
    matchId: turn.matchId,
    stateVersion: turn.stateVersion,
    eventCursor: turn.eventCursor,
    playerId: player.playerId,
    authorizedProjection: cloneJson(player.authorizedProjection),
    legalActions: player.legalActions.map((action) => ({ ...action })),
    instruction: 'SELECT_EXACTLY_ONE_CALLER_LEGAL_ACTION_ID_OR_ABSTAIN',
  });
}

export function createPublicObserverPacket(input) {
  if (!isPlainObject(input)) throw new TypeError('observer-input-invalid');
  const identity = contextIdentity(input);
  return deepFreeze({
    schema: OBSERVER_SCHEMA,
    ...identity,
    publicProjection: cloneJson(input.publicProjection, 'publicProjection'),
    authority: {
      source: 'CALLER_AUTHORIZED_PUBLIC_PROJECTION',
      storage: 'NONE',
      mayRevealPlayerPrivateProjection: false,
      automaticMutationAllowed: false,
    },
  });
}

function validateTurn(turn) {
  if (!isPlainObject(turn) || turn.schema !== TURN_SCHEMA) throw new TypeError('turn-invalid');
  contextIdentity(turn);
  if (!Array.isArray(turn.players) || turn.players.length !== PLAYER_COUNT) throw new TypeError('turn-players-invalid');
  if (!Array.isArray(turn.submissions)) throw new TypeError('turn-submissions-invalid');
}

function normalizeIntent(intent) {
  if (!isPlainObject(intent)) throw new TypeError('intent-invalid');
  const actionId = intent.actionId == null ? null : token(intent.actionId, 'intent-actionId');
  return {
    schema: INTENT_SCHEMA,
    intentId: token(intent.intentId, 'intentId'),
    matchId: token(intent.matchId, 'intent-matchId'),
    stateVersion: token(intent.stateVersion, 'intent-stateVersion'),
    eventCursor: token(intent.eventCursor, 'intent-eventCursor'),
    playerId: token(intent.playerId, 'intent-playerId'),
    actionId,
    abstain: intent.abstain === true,
  };
}

export function submitAgentIntent(turn, rawIntent) {
  validateTurn(turn);
  const intent = normalizeIntent(rawIntent);
  if (intent.matchId !== turn.matchId) throw new TypeError('intent-stale-match');
  if (intent.stateVersion !== turn.stateVersion) throw new TypeError('intent-stale-stateVersion');
  if (intent.eventCursor !== turn.eventCursor) throw new TypeError('intent-stale-eventCursor');

  const player = turn.players.find((item) => item.playerId === intent.playerId);
  if (!player) throw new TypeError('intent-player-not-in-turn');
  if (intent.abstain === (intent.actionId !== null)) throw new TypeError('intent-must-select-action-xor-abstain');
  if (intent.actionId !== null && !player.legalActions.some((action) => action.actionId === intent.actionId)) {
    throw new TypeError('intent-action-not-legal');
  }

  const sameIntentId = turn.submissions.find((item) => item.intentId === intent.intentId);
  if (sameIntentId) {
    const same = JSON.stringify(sameIntentId) === JSON.stringify(intent);
    if (!same) throw new TypeError('intentId-conflicting-duplicate');
    return turn;
  }
  if (turn.submissions.some((item) => item.playerId === intent.playerId)) {
    throw new TypeError('player-already-submitted');
  }

  const submissions = [...turn.submissions, intent]
    .sort((left, right) => left.playerId.localeCompare(right.playerId));
  const submitted = new Set(submissions.map((item) => item.playerId));
  const missingPlayerIds = turn.players
    .map((item) => item.playerId)
    .filter((id) => !submitted.has(id));

  return deepFreeze({
    ...turn,
    submissions,
    complete: missingPlayerIds.length === 0,
    missingPlayerIds,
  });
}

export function buildAuthoritySubmissionBatch(turn) {
  validateTurn(turn);
  if (!turn.complete) throw new TypeError('turn-incomplete');
  return deepFreeze({
    schema: 'gameroad.multi-agent-match-follow.authority-batch.v1',
    matchId: turn.matchId,
    stateVersion: turn.stateVersion,
    eventCursor: turn.eventCursor,
    intents: turn.submissions.map((intent) => ({
      playerId: intent.playerId,
      actionId: intent.actionId,
      abstain: intent.abstain,
      intentId: intent.intentId,
    })),
    resolutionRequestedFrom: 'CALLER_MATCH_AUTHORITY',
    containsResolution: false,
    automaticMutationAllowed: false,
  });
}

export const MULTI_AGENT_MATCH_FOLLOW_CONTRACT = deepFreeze({
  playerCount: PLAYER_COUNT,
  schemas: { turn: TURN_SCHEMA, intent: INTENT_SCHEMA, observer: OBSERVER_SCHEMA },
  storageAuthority: 'NONE',
  legalityAuthority: 'CALLER_SUPPLIED_LEGAL_ACTIONS',
  stateVersionAuthority: 'CALLER_OPAQUE_IDENTITY',
  resolutionAuthority: 'CALLER_MATCH_AUTHORITY',
  timeoutPolicy: 'NO_AUTOMOVE',
  privateDataPolicy: 'PER_PLAYER_CALLER_AUTHORIZED_PROJECTION_ONLY',
  observerPolicy: 'CALLER_AUTHORIZED_PUBLIC_PROJECTION_ONLY',
});
