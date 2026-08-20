const TURN_SCHEMA = 'gameroad.multi-agent-match-follow.turn.v1';
const INTENT_SCHEMA = 'gameroad.multi-agent-match-follow.intent.v1';
const OBSERVER_SCHEMA = 'gameroad.multi-agent-match-follow.observer.v1';
const EXECUTOR_SCHEMA = 'gameroad.multi-agent-match-follow.executor-result.v1';
const OPENAI_CLI_SCHEMA = 'gameroad.multi-agent-match-follow.openai-cli-result.v1';
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';
const OPENAI_CHOICE_SCHEMA_NAME = 'gameroad_agent_legal_action_choice';
const PLAYER_COUNT = 4;

function token(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field}-invalid`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new TypeError(`${field}-invalid`);
  return normalized;
}
function credential(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new TypeError(`${field}-invalid`);
  return value.trim();
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
  for (const [key, child] of Object.entries(value)) out[key] = cloneJson(child, `${field}.${key}`);
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
    return { actionId, kind: action.kind == null ? null : token(action.kind, `actionKind:${playerId}:${index}`), publicLabel: action.publicLabel == null ? null : token(action.publicLabel, `actionLabel:${playerId}:${index}`) };
  });
}
function contextIdentity(input) {
  return { matchId: token(input.matchId, 'matchId'), stateVersion: token(input.stateVersion, 'stateVersion'), eventCursor: token(input.eventCursor, 'eventCursor') };
}
export function createFourAgentTurn(input) {
  if (!isPlainObject(input)) throw new TypeError('turn-input-invalid');
  const identity = contextIdentity(input);
  if (!Array.isArray(input.players) || input.players.length !== PLAYER_COUNT) throw new TypeError(`players-must-equal-${PLAYER_COUNT}`);
  const playerIds = new Set();
  const players = input.players.map((player, index) => {
    if (!isPlainObject(player)) throw new TypeError(`player-invalid:${index}`);
    const playerId = token(player.playerId, `playerId:${index}`);
    if (playerIds.has(playerId)) throw new TypeError(`playerId-duplicate:${playerId}`);
    playerIds.add(playerId);
    return { playerId, authorizedProjection: cloneJson(player.authorizedProjection, `authorizedProjection:${playerId}`), legalActions: normalizeLegalActions(player.legalActions, playerId) };
  });
  return deepFreeze({ schema: TURN_SCHEMA, ...identity, authority: { matchState: 'CALLER_MATCH_AUTHORITY', stateVersion: 'CALLER_OPAQUE_IDENTITY', legality: 'CALLER_SUPPLIED_LEGAL_ACTIONS', resolution: 'CALLER_MATCH_AUTHORITY', storage: 'NONE', automaticMutationAllowed: false }, players, submissions: [], complete: false, missingPlayerIds: players.map((player) => player.playerId) });
}
export function createAgentPacket(turn, playerId) {
  validateTurn(turn);
  const normalizedPlayerId = token(playerId, 'playerId');
  const player = turn.players.find((item) => item.playerId === normalizedPlayerId);
  if (!player) throw new TypeError(`player-not-in-turn:${normalizedPlayerId}`);
  return deepFreeze({ schema: 'gameroad.multi-agent-match-follow.agent-packet.v1', matchId: turn.matchId, stateVersion: turn.stateVersion, eventCursor: turn.eventCursor, playerId: player.playerId, authorizedProjection: cloneJson(player.authorizedProjection), legalActions: player.legalActions.map((action) => ({ ...action })), instruction: 'SELECT_EXACTLY_ONE_CALLER_LEGAL_ACTION_ID_OR_ABSTAIN' });
}
export function createPublicObserverPacket(input) {
  if (!isPlainObject(input)) throw new TypeError('observer-input-invalid');
  const identity = contextIdentity(input);
  return deepFreeze({ schema: OBSERVER_SCHEMA, ...identity, publicProjection: cloneJson(input.publicProjection, 'publicProjection'), authority: { source: 'CALLER_AUTHORIZED_PUBLIC_PROJECTION', storage: 'NONE', mayRevealPlayerPrivateProjection: false, automaticMutationAllowed: false } });
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
  return { schema: INTENT_SCHEMA, intentId: token(intent.intentId, 'intentId'), matchId: token(intent.matchId, 'intent-matchId'), stateVersion: token(intent.stateVersion, 'intent-stateVersion'), eventCursor: token(intent.eventCursor, 'intent-eventCursor'), playerId: token(intent.playerId, 'intent-playerId'), actionId, abstain: intent.abstain === true };
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
  if (intent.actionId !== null && !player.legalActions.some((action) => action.actionId === intent.actionId)) throw new TypeError('intent-action-not-legal');
  const sameIntentId = turn.submissions.find((item) => item.intentId === intent.intentId);
  if (sameIntentId) {
    if (JSON.stringify(sameIntentId) !== JSON.stringify(intent)) throw new TypeError('intentId-conflicting-duplicate');
    return turn;
  }
  if (turn.submissions.some((item) => item.playerId === intent.playerId)) throw new TypeError('player-already-submitted');
  const submissions = [...turn.submissions, intent].sort((left, right) => left.playerId.localeCompare(right.playerId));
  const submitted = new Set(submissions.map((item) => item.playerId));
  const missingPlayerIds = turn.players.map((item) => item.playerId).filter((id) => !submitted.has(id));
  return deepFreeze({ ...turn, submissions, complete: missingPlayerIds.length === 0, missingPlayerIds });
}
export function buildAuthoritySubmissionBatch(turn) {
  validateTurn(turn);
  if (!turn.complete) throw new TypeError('turn-incomplete');
  return deepFreeze({ schema: 'gameroad.multi-agent-match-follow.authority-batch.v1', matchId: turn.matchId, stateVersion: turn.stateVersion, eventCursor: turn.eventCursor, intents: turn.submissions.map((intent) => ({ playerId: intent.playerId, actionId: intent.actionId, abstain: intent.abstain, intentId: intent.intentId })), resolutionRequestedFrom: 'CALLER_MATCH_AUTHORITY', containsResolution: false, automaticMutationAllowed: false });
}
function validateWorkers(turn, workers) {
  if (!isPlainObject(workers)) throw new TypeError('workers-invalid');
  const expected = turn.players.map((player) => player.playerId).sort();
  const actual = Object.keys(workers).sort();
  if (actual.length !== expected.length || actual.some((playerId, index) => playerId !== expected[index])) throw new TypeError('workers-must-match-turn-players-exactly');
  for (const playerId of expected) if (typeof workers[playerId] !== 'function') throw new TypeError(`worker-invalid:${playerId}`);
}
function executorFailure(playerId, status, reason) { return deepFreeze({ playerId, status, reason }); }
function safeIntentFailureReason(error) {
  if (!(error instanceof TypeError)) return 'INTENT_REJECTED';
  const allowed = new Set(['intent-invalid', 'intent-actionId-invalid', 'intentId-invalid', 'intent-matchId-invalid', 'intent-stateVersion-invalid', 'intent-eventCursor-invalid', 'intent-playerId-invalid', 'intent-stale-match', 'intent-stale-stateVersion', 'intent-stale-eventCursor', 'intent-player-not-in-turn', 'intent-must-select-action-xor-abstain', 'intent-action-not-legal', 'intentId-conflicting-duplicate', 'player-already-submitted']);
  return allowed.has(error.message) ? error.message : 'INTENT_REJECTED';
}
export async function runFourAgentWorkers(turn, workers) {
  validateTurn(turn);
  if (turn.submissions.length !== 0) throw new TypeError('executor-turn-must-be-unsubmitted');
  validateWorkers(turn, workers);
  const settled = await Promise.all(turn.players.map(async (player) => {
    const packet = createAgentPacket(turn, player.playerId);
    try { return { playerId: player.playerId, fulfilled: true, rawIntent: await workers[player.playerId](packet) }; }
    catch { return { playerId: player.playerId, fulfilled: false, rawIntent: null }; }
  }));
  let nextTurn = turn;
  const results = [];
  for (const entry of settled) {
    if (!entry.fulfilled) { results.push(executorFailure(entry.playerId, 'WORKER_FAILED', 'WORKER_REJECTED_OR_THROWN')); continue; }
    if (isPlainObject(entry.rawIntent) && typeof entry.rawIntent.playerId === 'string' && entry.rawIntent.playerId.trim() !== entry.playerId) { results.push(executorFailure(entry.playerId, 'WORKER_PLAYER_MISMATCH', 'WORKER_RETURNED_OTHER_PLAYER')); continue; }
    try { nextTurn = submitAgentIntent(nextTurn, entry.rawIntent); results.push(deepFreeze({ playerId: entry.playerId, status: 'ACCEPTED', reason: null })); }
    catch (error) { results.push(executorFailure(entry.playerId, 'INVALID_INTENT', safeIntentFailureReason(error))); }
  }
  return deepFreeze({ schema: EXECUTOR_SCHEMA, turn: nextTurn, results, authorityBatch: nextTurn.complete ? buildAuthoritySubmissionBatch(nextTurn) : null, automaticRetryAllowed: false, automaticTimeoutMoveAllowed: false, providerAuthority: 'NONE', resolutionAuthority: 'CALLER_MATCH_AUTHORITY' });
}
function validateAgentPacket(packet) {
  if (!isPlainObject(packet) || packet.schema !== 'gameroad.multi-agent-match-follow.agent-packet.v1') throw new TypeError('agent-packet-invalid');
  contextIdentity(packet);
  const playerId = token(packet.playerId, 'agent-packet-playerId');
  cloneJson(packet.authorizedProjection, 'agent-packet-authorizedProjection');
  return { playerId, legalActions: normalizeLegalActions(packet.legalActions, playerId) };
}
function extractOpenAIOutputText(payload) {
  if (!isPlainObject(payload)) throw new TypeError('openai-response-invalid');
  if (payload.status !== 'completed') throw new TypeError('openai-response-not-completed');
  if (!Array.isArray(payload.output)) throw new TypeError('openai-response-output-invalid');
  const texts = [];
  for (const item of payload.output) {
    if (!isPlainObject(item) || item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isPlainObject(content)) continue;
      if (content.type === 'refusal') throw new TypeError('openai-response-refusal');
      if (content.type === 'output_text' && typeof content.text === 'string' && content.text.trim() !== '') texts.push(content.text);
    }
  }
  if (texts.length !== 1) throw new TypeError('openai-response-output-text-invalid');
  return texts[0];
}
function normalizeProviderChoice(value) {
  if (!isPlainObject(value)) throw new TypeError('openai-choice-invalid');
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['abstain', 'actionId', 'intentId'])) throw new TypeError('openai-choice-fields-invalid');
  const intentId = token(value.intentId, 'openai-choice-intentId');
  const actionId = value.actionId == null ? null : token(value.actionId, 'openai-choice-actionId');
  if (typeof value.abstain !== 'boolean') throw new TypeError('openai-choice-abstain-invalid');
  if (value.abstain === (actionId !== null)) throw new TypeError('openai-choice-xor-invalid');
  return { intentId, actionId, abstain: value.abstain };
}
function openAIChoiceSchema() {
  return { type: 'object', additionalProperties: false, properties: { intentId: { type: 'string', minLength: 1, maxLength: 160 }, actionId: { type: ['string', 'null'] }, abstain: { type: 'boolean' } }, required: ['intentId', 'actionId', 'abstain'] };
}
export function createOpenAIResponsesAgentWorker({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  const normalizedApiKey = credential(apiKey, 'openai-apiKey');
  const normalizedModel = token(model, 'openai-model');
  if (typeof fetchImpl !== 'function') throw new TypeError('openai-fetch-invalid');
  return async function openAIResponsesAgentWorker(packet) {
    const { playerId, legalActions } = validateAgentPacket(packet);
    const providerInput = { instruction: 'Choose exactly one caller-supplied legal actionId, or abstain. Never invent match identity, legality, or game resolution.', authorizedProjection: cloneJson(packet.authorizedProjection, 'provider-authorizedProjection'), legalActions: legalActions.map((action) => ({ ...action })) };
    let response;
    try { response = await fetchImpl(OPENAI_RESPONSES_ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${normalizedApiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: normalizedModel, input: JSON.stringify(providerInput), text: { format: { type: 'json_schema', name: OPENAI_CHOICE_SCHEMA_NAME, strict: true, schema: openAIChoiceSchema() } } }) }); }
    catch { throw new TypeError('openai-response-request-failed'); }
    if (!response || response.ok !== true || typeof response.json !== 'function') throw new TypeError('openai-response-http-failed');
    let payload;
    try { payload = await response.json(); } catch { throw new TypeError('openai-response-json-invalid'); }
    const outputText = extractOpenAIOutputText(payload);
    let rawChoice;
    try { rawChoice = JSON.parse(outputText); } catch { throw new TypeError('openai-choice-json-invalid'); }
    const choice = normalizeProviderChoice(rawChoice);
    return deepFreeze({ intentId: choice.intentId, matchId: packet.matchId, stateVersion: packet.stateVersion, eventCursor: packet.eventCursor, playerId, actionId: choice.actionId, abstain: choice.abstain });
  };
}
function parseCliInput(inputText) {
  if (typeof inputText !== 'string' || inputText.trim() === '') throw new TypeError('openai-cli-input-invalid');
  try { return JSON.parse(inputText); } catch { throw new TypeError('openai-cli-json-invalid'); }
}
export async function runOpenAIFourAgentCli({ inputText, env = {}, fetchImpl = globalThis.fetch } = {}) {
  if (!isPlainObject(env)) throw new TypeError('openai-cli-env-invalid');
  const turn = createFourAgentTurn(parseCliInput(inputText));
  const apiKey = credential(env.OPENAI_API_KEY, 'openai-cli-apiKey');
  const model = token(env.OPENAI_MODEL, 'openai-cli-model');
  const workers = Object.fromEntries(turn.players.map((player, index) => {
    const providerWorker = createOpenAIResponsesAgentWorker({ apiKey, model, fetchImpl });
    return [player.playerId, async (packet) => {
      const providerIntent = await providerWorker(packet);
      return deepFreeze({ ...providerIntent, intentId: `cli-intent-${index + 1}` });
    }];
  }));
  const result = await runFourAgentWorkers(turn, workers);
  return deepFreeze({ schema: OPENAI_CLI_SCHEMA, matchId: turn.matchId, stateVersion: turn.stateVersion, eventCursor: turn.eventCursor, results: result.results.map((entry) => ({ ...entry })), missingPlayerIds: [...result.turn.missingPlayerIds], authorityBatch: result.authorityBatch == null ? null : cloneJson(result.authorityBatch, 'cli-authorityBatch'), automaticRetryAllowed: false, automaticTimeoutMoveAllowed: false, providerAuthority: 'NONE', resolutionAuthority: 'CALLER_MATCH_AUTHORITY' });
}
async function readStdin(stream) {
  let text = '';
  for await (const chunk of stream) text += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  return text;
}
function isDirectInvocation() {
  if (typeof process === 'undefined' || !process.argv?.[1]) return false;
  try {
    const modulePath = decodeURIComponent(new URL(import.meta.url).pathname);
    const argvPath = process.argv[1].replaceAll('\\', '/');
    return modulePath === argvPath || modulePath === `/${argvPath}`;
  } catch { return false; }
}
if (isDirectInvocation()) {
  try {
    const inputText = await readStdin(process.stdin);
    const result = await runOpenAIFourAgentCli({ inputText, env: process.env });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify({ schema: 'gameroad.multi-agent-match-follow.openai-cli-error.v1', error: 'CLI_FAILED' })}\n`);
    process.exitCode = 1;
  }
}
export const MULTI_AGENT_MATCH_FOLLOW_CONTRACT = deepFreeze({
  playerCount: PLAYER_COUNT,
  schemas: { turn: TURN_SCHEMA, intent: INTENT_SCHEMA, observer: OBSERVER_SCHEMA, executor: EXECUTOR_SCHEMA, openAICommand: OPENAI_CLI_SCHEMA },
  storageAuthority: 'NONE', legalityAuthority: 'CALLER_SUPPLIED_LEGAL_ACTIONS', stateVersionAuthority: 'CALLER_OPAQUE_IDENTITY', resolutionAuthority: 'CALLER_MATCH_AUTHORITY', workerProviderAuthority: 'NONE', timeoutPolicy: 'NO_AUTOMOVE', workerRetryPolicy: 'CALLER_CONTROLLED_NO_AUTORETRY', privateDataPolicy: 'PER_PLAYER_CALLER_AUTHORIZED_PROJECTION_ONLY', observerPolicy: 'CALLER_AUTHORIZED_PUBLIC_PROJECTION_ONLY',
  openAIResponsesAdapter: { endpoint: OPENAI_RESPONSES_ENDPOINT, credentialStorageAuthority: 'NONE', modelAuthority: 'CALLER_SUPPLIED', authorityIdentitySource: 'AGENT_PACKET_CALLER_FIELDS', structuredOutputFields: ['intentId', 'actionId', 'abstain'], automaticRetryAllowed: false, automaticTimeoutAllowed: false },
  openAIFourAgentCli: { inputAuthority: 'CALLER_SUPPLIED_TURN_JSON', credentialSource: 'OPENAI_API_KEY_ENV_ONLY', modelSource: 'OPENAI_MODEL_ENV_ONLY', providerIntentIdAuthority: 'DISCARDED_AND_REBOUND_TO_CLI_SLOT', outputPrivateProjectionAllowed: false, credentialStorageAuthority: 'NONE', stateVersionGenerationAuthority: 'NONE', legalActionGenerationAuthority: 'NONE', resolutionAuthority: 'CALLER_MATCH_AUTHORITY' },
});