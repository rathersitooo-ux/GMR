const REPLAY_SCHEMA = 'GAMEROAD_BATTLE_REPLAY_V1';
const REQUIRED_VERSION_KEYS = Object.freeze(['rules', 'content', 'state']);

function cloneJson(value) {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (text === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(text);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeVersions(versions) {
  if (!versions || typeof versions !== 'object' || Array.isArray(versions)) {
    throw new TypeError('VERSIONS_REQUIRED');
  }
  const out = {};
  for (const key of REQUIRED_VERSION_KEYS) {
    if (!nonEmptyString(versions[key])) throw new TypeError(`VERSION_REQUIRED:${key}`);
    out[key] = versions[key];
  }
  return deepFreeze(out);
}

function sameVersions(left, right) {
  return REQUIRED_VERSION_KEYS.every(key => left?.[key] === right?.[key]);
}

function normalizePrivateByViewer(privateByViewer) {
  if (privateByViewer == null) return {};
  if (typeof privateByViewer !== 'object' || Array.isArray(privateByViewer)) {
    throw new TypeError('PRIVATE_BY_VIEWER_INVALID');
  }
  const out = {};
  for (const [viewerId, payload] of Object.entries(privateByViewer)) {
    if (!nonEmptyString(viewerId)) throw new TypeError('VIEWER_ID_INVALID');
    out[viewerId] = cloneJson(payload);
  }
  return out;
}

function frozenLog(raw) {
  return deepFreeze(cloneJson(raw));
}

export function createReplayLog({ matchId, versions }) {
  if (!nonEmptyString(matchId)) throw new TypeError('MATCH_ID_REQUIRED');
  return frozenLog({
    schema: REPLAY_SCHEMA,
    matchId,
    versions: normalizeVersions(versions),
    events: []
  });
}

export function appendAcceptedEvent(log, {
  kind,
  publicData = null,
  privateByViewer = null,
  authorityOnly = null
}) {
  const validation = validateReplayLog(log);
  if (!validation.ok) throw new TypeError(`LOG_INVALID:${validation.reason}`);
  if (!nonEmptyString(kind)) throw new TypeError('EVENT_KIND_REQUIRED');

  const event = {
    schema: REPLAY_SCHEMA,
    matchId: log.matchId,
    sequence: log.events.length + 1,
    versions: cloneJson(log.versions),
    kind,
    publicData: cloneJson(publicData),
    privateByViewer: normalizePrivateByViewer(privateByViewer),
    authorityOnly: cloneJson(authorityOnly)
  };

  return frozenLog({
    ...cloneJson(log),
    events: [...cloneJson(log.events), event]
  });
}

export function validateReplayLog(log) {
  if (!log || typeof log !== 'object' || Array.isArray(log)) {
    return { ok: false, status: 'unavailable', reason: 'LOG_INVALID' };
  }
  if (log.schema !== REPLAY_SCHEMA) {
    return { ok: false, status: 'unavailable', reason: 'SCHEMA_UNKNOWN' };
  }
  if (!nonEmptyString(log.matchId)) {
    return { ok: false, status: 'unavailable', reason: 'MATCH_ID_INVALID' };
  }

  let normalizedVersions;
  try {
    normalizedVersions = normalizeVersions(log.versions);
  } catch {
    return { ok: false, status: 'unavailable', reason: 'VERSION_INVALID' };
  }

  if (!Array.isArray(log.events)) {
    return { ok: false, status: 'unavailable', reason: 'EVENTS_INVALID' };
  }

  const seen = new Set();
  for (let index = 0; index < log.events.length; index += 1) {
    const event = log.events[index];
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      return { ok: false, status: 'partial', reason: 'EVENT_CORRUPT', index };
    }
    if (event.schema !== REPLAY_SCHEMA || event.matchId !== log.matchId) {
      return { ok: false, status: 'partial', reason: 'EVENT_IDENTITY_MISMATCH', index };
    }
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_INVALID', index };
    }
    if (seen.has(event.sequence)) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_DUPLICATE', index };
    }
    seen.add(event.sequence);
    if (event.sequence !== index + 1) {
      return { ok: false, status: 'partial', reason: 'SEQUENCE_GAP_OR_REORDER', index };
    }
    if (!sameVersions(event.versions, normalizedVersions)) {
      return { ok: false, status: 'partial', reason: 'EVENT_VERSION_MISMATCH', index };
    }
    if (!nonEmptyString(event.kind)) {
      return { ok: false, status: 'partial', reason: 'EVENT_KIND_INVALID', index };
    }
    if (event.privateByViewer != null &&
        (typeof event.privateByViewer !== 'object' || Array.isArray(event.privateByViewer))) {
      return { ok: false, status: 'partial', reason: 'PRIVATE_BY_VIEWER_INVALID', index };
    }
  }

  return { ok: true, status: 'ready' };
}

function versionSupported(version, supported) {
  if (!supported) return false;
  if (supported instanceof Set) return supported.has(version);
  if (Array.isArray(supported)) return supported.includes(version);
  return supported === version;
}

function versionsSupported(versions, supportedVersions) {
  if (!supportedVersions || typeof supportedVersions !== 'object') return false;
  return REQUIRED_VERSION_KEYS.every(key =>
    versionSupported(versions[key], supportedVersions[key])
  );
}

function projectEvent(event, viewer) {
  const projected = {
    sequence: event.sequence,
    kind: event.kind,
    publicData: cloneJson(event.publicData)
  };

  const authenticated = viewer?.authenticated === true;
  const viewerId = authenticated && nonEmptyString(viewer?.id) ? viewer.id : null;
  if (viewerId && Object.prototype.hasOwnProperty.call(event.privateByViewer || {}, viewerId)) {
    projected.privateData = cloneJson(event.privateByViewer[viewerId]);
  }

  return deepFreeze(projected);
}

export function readReplay(log, { viewer = null, supportedVersions = null } = {}) {
  const validation = validateReplayLog(log);
  if (!validation.ok) return deepFreeze(validation);

  if (!versionsSupported(log.versions, supportedVersions)) {
    return deepFreeze({ ok: false, status: 'unavailable', reason: 'VERSION_UNSUPPORTED' });
  }

  return deepFreeze({
    ok: true,
    status: 'ready',
    schema: REPLAY_SCHEMA,
    matchId: log.matchId,
    versions: cloneJson(log.versions),
    events: log.events.map(event => projectEvent(event, viewer))
  });
}

const DIRECTOR_CANDIDATE_SCHEMA = 'GAMEROAD_REPLAY_SHOT_CANDIDATE_V1';
const DIRECTOR_STATE_SCHEMA = 'GAMEROAD_REPLAY_BROADCAST_DIRECTOR_STATE_V1';
const DIRECTOR_DECISION_SCHEMA = 'GAMEROAD_REPLAY_DIRECTOR_DECISION_V1';
const DIRECTOR_POSITIVE_TERMS = Object.freeze([
  'mandatoryConsequence',
  'urgency',
  'dramaDelta',
  'rarity',
  'continuity',
  'readiness'
]);
const DIRECTOR_PENALTY_TERMS = Object.freeze(['repeat', 'cutThrash', 'load']);
const DIRECTOR_SCORE_TERMS = Object.freeze([
  ...DIRECTOR_POSITIVE_TERMS,
  ...DIRECTOR_PENALTY_TERMS
]);

function own(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function finiteNonNegative(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label}_INVALID`);
  }
  return value;
}

function normalizedDirectorEvent(matchId, event) {
  if (!nonEmptyString(matchId)) throw new TypeError('DIRECTOR_MATCH_ID_REQUIRED');
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('DIRECTOR_EVENT_REQUIRED');
  }
  if (own(event, 'privateData') ||
      own(event, 'authorityOnly') ||
      own(event, 'privateByViewer')) {
    throw new TypeError('DIRECTOR_EVENT_NOT_PUBLIC_ONLY');
  }
  if (!Number.isSafeInteger(event.sequence) ||
      event.sequence < 1 ||
      !nonEmptyString(event.kind) ||
      !own(event, 'publicData')) {
    throw new TypeError('DIRECTOR_EVENT_IDENTITY_INVALID');
  }
  return { matchId, sequence: event.sequence, kind: event.kind };
}

function normalizedShotEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new TypeError('DIRECTOR_EVIDENCE_REQUIRED');
  }
  if (own(evidence, 'privateData') ||
      own(evidence, 'authorityOnly') ||
      own(evidence, 'privateByViewer')) {
    throw new TypeError('DIRECTOR_EVIDENCE_NOT_PUBLIC_ONLY');
  }
  if (evidence.privacySafe !== true ||
      finiteNonNegative(evidence.privacyRisk, 'DIRECTOR_PRIVACY_RISK') !== 0) {
    throw new TypeError('DIRECTOR_PRIVACY_EVIDENCE_REJECTED');
  }
  const terms = {};
  for (const key of DIRECTOR_SCORE_TERMS) {
    terms[key] = finiteNonNegative(evidence[key], `DIRECTOR_TERM_${key}`);
  }
  return deepFreeze({
    terms,
    starvationMs: finiteNonNegative(evidence.starvationMs, 'DIRECTOR_STARVATION_MS')
  });
}

export function createReplayShotCandidate({ matchId, event, surfaceId, evidence }) {
  if (!nonEmptyString(surfaceId)) throw new TypeError('DIRECTOR_SURFACE_ID_REQUIRED');
  const source = normalizedDirectorEvent(matchId, event);
  const normalizedEvidence = normalizedShotEvidence(evidence);
  const eventId = `${source.matchId}:${source.sequence}`;
  return deepFreeze({
    schema: DIRECTOR_CANDIDATE_SCHEMA,
    candidateId: `${eventId}:${surfaceId}`,
    eventId,
    presentationOnly: true,
    surfaceId,
    source,
    terms: cloneJson(normalizedEvidence.terms),
    starvationMs: normalizedEvidence.starvationMs
  });
}

function normalizedDirectorPolicy(policy) {
  if (!policy ||
      typeof policy !== 'object' ||
      Array.isArray(policy) ||
      !policy.weights ||
      typeof policy.weights !== 'object' ||
      Array.isArray(policy.weights)) {
    throw new TypeError('DIRECTOR_POLICY_REQUIRED');
  }
  const weights = {};
  for (const key of DIRECTOR_SCORE_TERMS) {
    weights[key] = finiteNonNegative(policy.weights[key], `DIRECTOR_WEIGHT_${key}`);
  }
  return deepFreeze({
    weights,
    holdMs: finiteNonNegative(policy.holdMs, 'DIRECTOR_HOLD_MS'),
    hysteresisDelta: finiteNonNegative(
      policy.hysteresisDelta,
      'DIRECTOR_HYSTERESIS_DELTA'
    ),
    cooldownMs: finiteNonNegative(policy.cooldownMs, 'DIRECTOR_COOLDOWN_MS')
  });
}

function validateShotCandidate(candidate) {
  if (!candidate ||
      typeof candidate !== 'object' ||
      candidate.schema !== DIRECTOR_CANDIDATE_SCHEMA ||
      candidate.presentationOnly !== true ||
      !nonEmptyString(candidate.candidateId) ||
      !nonEmptyString(candidate.eventId) ||
      !nonEmptyString(candidate.surfaceId) ||
      !candidate.source ||
      typeof candidate.source !== 'object' ||
      Array.isArray(candidate.source) ||
      own(candidate, 'publicData') ||
      own(candidate, 'privateData') ||
      own(candidate, 'authorityOnly') ||
      own(candidate, 'privateByViewer')) {
    throw new TypeError('DIRECTOR_CANDIDATE_INVALID');
  }
  if (!nonEmptyString(candidate.source.matchId) ||
      !Number.isSafeInteger(candidate.source.sequence) ||
      candidate.source.sequence < 1 ||
      !nonEmptyString(candidate.source.kind)) {
    throw new TypeError('DIRECTOR_CANDIDATE_SOURCE_INVALID');
  }
  const expectedEventId = `${candidate.source.matchId}:${candidate.source.sequence}`;
  if (candidate.eventId !== expectedEventId ||
      candidate.candidateId !== `${expectedEventId}:${candidate.surfaceId}`) {
    throw new TypeError('DIRECTOR_CANDIDATE_IDENTITY_MISMATCH');
  }
  if (!candidate.terms ||
      typeof candidate.terms !== 'object' ||
      Array.isArray(candidate.terms)) {
    throw new TypeError('DIRECTOR_CANDIDATE_TERMS_INVALID');
  }
  for (const key of DIRECTOR_SCORE_TERMS) {
    finiteNonNegative(candidate.terms[key], `DIRECTOR_TERM_${key}`);
  }
  finiteNonNegative(candidate.starvationMs, 'DIRECTOR_STARVATION_MS');
  return candidate;
}

function scoreWithPolicy(candidate, policy) {
  let score = 0;
  for (const key of DIRECTOR_POSITIVE_TERMS) {
    score += candidate.terms[key] * policy.weights[key];
  }
  for (const key of DIRECTOR_PENALTY_TERMS) {
    score -= candidate.terms[key] * policy.weights[key];
  }
  return score;
}

export function scoreReplayShotCandidate(candidate, policy) {
  validateShotCandidate(candidate);
  return scoreWithPolicy(candidate, normalizedDirectorPolicy(policy));
}

export function createReplayBroadcastDirectorState() {
  return deepFreeze({
    schema: DIRECTOR_STATE_SCHEMA,
    activeCandidateId: null,
    activeSelectedAtMs: null,
    lastReleasedAtByCandidate: {},
    decisionSerial: 0
  });
}

function validateDirectorState(state) {
  if (!state ||
      typeof state !== 'object' ||
      state.schema !== DIRECTOR_STATE_SCHEMA ||
      !Number.isSafeInteger(state.decisionSerial) ||
      state.decisionSerial < 0 ||
      !state.lastReleasedAtByCandidate ||
      typeof state.lastReleasedAtByCandidate !== 'object' ||
      Array.isArray(state.lastReleasedAtByCandidate)) {
    throw new TypeError('DIRECTOR_STATE_INVALID');
  }
  if (state.activeCandidateId !== null &&
      !nonEmptyString(state.activeCandidateId)) {
    throw new TypeError('DIRECTOR_STATE_ACTIVE_INVALID');
  }
  if (state.activeCandidateId === null && state.activeSelectedAtMs !== null) {
    throw new TypeError('DIRECTOR_STATE_ACTIVE_TIME_INVALID');
  }
  if (state.activeCandidateId !== null) {
    finiteNonNegative(
      state.activeSelectedAtMs,
      'DIRECTOR_ACTIVE_SELECTED_AT_MS'
    );
  }
  for (const [id, atMs] of Object.entries(state.lastReleasedAtByCandidate)) {
    if (!nonEmptyString(id)) {
      throw new TypeError('DIRECTOR_STATE_HISTORY_ID_INVALID');
    }
    finiteNonNegative(atMs, 'DIRECTOR_STATE_HISTORY_TIME');
  }
}

function rankedShotRows(candidates, policy, state, nowMs) {
  if (!Array.isArray(candidates)) {
    throw new TypeError('DIRECTOR_CANDIDATES_REQUIRED');
  }
  const seen = new Set();
  const rows = candidates.map(candidate => {
    validateShotCandidate(candidate);
    if (seen.has(candidate.candidateId)) {
      throw new TypeError('DIRECTOR_CANDIDATE_DUPLICATE');
    }
    seen.add(candidate.candidateId);
    const releasedAt = state.lastReleasedAtByCandidate[candidate.candidateId];
    const cooldownBlocked =
      candidate.candidateId !== state.activeCandidateId &&
      releasedAt !== undefined &&
      nowMs - releasedAt < policy.cooldownMs;
    return {
      candidate,
      score: scoreWithPolicy(candidate, policy),
      cooldownBlocked
    };
  });
  return rows.sort((a, b) =>
    b.score - a.score ||
    b.candidate.starvationMs - a.candidate.starvationMs ||
    a.candidate.candidateId.localeCompare(b.candidate.candidateId)
  );
}

export function decideReplayBroadcastShot(
  state,
  { candidates, policy, nowMs }
) {
  validateDirectorState(state);
  const normalizedPolicy = normalizedDirectorPolicy(policy);
  const clock = finiteNonNegative(nowMs, 'DIRECTOR_NOW_MS');
  const rows = rankedShotRows(
    candidates,
    normalizedPolicy,
    state,
    clock
  );
  const activeRow =
    rows.find(row => row.candidate.candidateId === state.activeCandidateId) ||
    null;
  const eligible = rows.filter(row => !row.cooldownBlocked);
  let selected = activeRow;
  let reason = 'NO_CANDIDATE';
  let switchToNew = false;

  if (activeRow &&
      clock - state.activeSelectedAtMs < normalizedPolicy.holdMs) {
    reason = 'HOLD';
  } else {
    const best = eligible[0] || null;
    if (!activeRow) {
      selected = best;
      reason = best ? 'INITIAL' : 'NO_CANDIDATE';
      switchToNew = Boolean(best);
    } else if (!best ||
               best.candidate.candidateId === activeRow.candidate.candidateId) {
      selected = activeRow;
      reason = 'CONTINUE';
    } else if (best.score === activeRow.score &&
               best.candidate.starvationMs >
                 activeRow.candidate.starvationMs) {
      selected = best;
      reason = 'STARVATION_RESCUE';
      switchToNew = true;
    } else if (best.score >=
               activeRow.score + normalizedPolicy.hysteresisDelta) {
      selected = best;
      reason = 'VALUE_SWITCH';
      switchToNew = true;
    } else {
      selected = activeRow;
      reason = 'HYSTERESIS';
    }
  }

  const serial = state.decisionSerial + 1;
  const nextReleased = cloneJson(state.lastReleasedAtByCandidate);
  let nextActiveId = state.activeCandidateId;
  let nextSelectedAt = state.activeSelectedAtMs;
  const oldActiveMissing =
    state.activeCandidateId !== null && activeRow === null;

  if ((switchToNew || oldActiveMissing) &&
      state.activeCandidateId !== null) {
    nextReleased[state.activeCandidateId] = clock;
  }
  if (switchToNew && selected) {
    nextActiveId = selected.candidate.candidateId;
    nextSelectedAt = clock;
  } else if (oldActiveMissing && !selected) {
    nextActiveId = null;
    nextSelectedAt = null;
  }

  const nextState = deepFreeze({
    schema: DIRECTOR_STATE_SCHEMA,
    activeCandidateId: nextActiveId,
    activeSelectedAtMs: nextSelectedAt,
    lastReleasedAtByCandidate: nextReleased,
    decisionSerial: serial
  });
  const decision = deepFreeze({
    schema: DIRECTOR_DECISION_SCHEMA,
    serial,
    presentationOnly: true,
    atMs: clock,
    reason,
    selectedCandidateId: selected?.candidate.candidateId ?? null,
    selectedEventId: selected?.candidate.eventId ?? null,
    selectedScore: selected?.score ?? null,
    considered: rows.map(row => ({
      candidateId: row.candidate.candidateId,
      eventId: row.candidate.eventId,
      score: row.score,
      starvationMs: row.candidate.starvationMs,
      cooldownBlocked: row.cooldownBlocked
    }))
  });
  return deepFreeze({ state: nextState, decision });
}

export const BATTLE_REPLAY_CORE = Object.freeze({
  schema: REPLAY_SCHEMA,
  requiredVersionKeys: REQUIRED_VERSION_KEYS,
  director: Object.freeze({
    candidateSchema: DIRECTOR_CANDIDATE_SCHEMA,
    stateSchema: DIRECTOR_STATE_SCHEMA,
    decisionSchema: DIRECTOR_DECISION_SCHEMA,
    positiveTerms: DIRECTOR_POSITIVE_TERMS,
    penaltyTerms: DIRECTOR_PENALTY_TERMS
  })
});

const DIRECTOR_PLAYER_PROJECTION_SCHEMA = 'GAMEROAD_REPLAY_PLAYER_PRESENTATION_PROJECTION_V1';
const DIRECTOR_PLAYER_MODE_LAYOUT = Object.freeze({
  'BOARD_PRIMARY+ANIM_WIPE': Object.freeze({
    primarySurface: 'BOARD',
    wipeSurface: 'ANIMATION',
    wipeEnabled: true
  }),
  'ANIMATION_PRIMARY+BOARD_WIPE': Object.freeze({
    primarySurface: 'ANIMATION',
    wipeSurface: 'BOARD',
    wipeEnabled: true
  }),
  'BOARD_ONLY(WIPE_OFF)': Object.freeze({
    primarySurface: 'BOARD',
    wipeSurface: null,
    wipeEnabled: false
  })
});

function validateDirectorDecisionForPlayerProjection(decision) {
  if (!decision ||
      typeof decision !== 'object' ||
      Array.isArray(decision) ||
      decision.schema !== DIRECTOR_DECISION_SCHEMA ||
      decision.presentationOnly !== true ||
      !Number.isSafeInteger(decision.serial) ||
      decision.serial < 1 ||
      typeof decision.atMs !== 'number' ||
      !Number.isFinite(decision.atMs) ||
      decision.atMs < 0 ||
      !nonEmptyString(decision.reason) ||
      !Array.isArray(decision.considered)) {
    throw new TypeError('DIRECTOR_DECISION_INVALID');
  }
  if (own(decision, 'publicData') ||
      own(decision, 'privateData') ||
      own(decision, 'privateByViewer') ||
      own(decision, 'authorityOnly')) {
    throw new TypeError('DIRECTOR_DECISION_NOT_PUBLIC_ONLY');
  }

  const candidateIsNull = decision.selectedCandidateId === null;
  const eventIsNull = decision.selectedEventId === null;
  if (candidateIsNull !== eventIsNull ||
      (!candidateIsNull && !nonEmptyString(decision.selectedCandidateId)) ||
      (!eventIsNull && !nonEmptyString(decision.selectedEventId))) {
    throw new TypeError('DIRECTOR_DECISION_IDENTITY_INVALID');
  }
  if (decision.selectedScore !== null &&
      (typeof decision.selectedScore !== 'number' ||
       !Number.isFinite(decision.selectedScore))) {
    throw new TypeError('DIRECTOR_DECISION_SCORE_INVALID');
  }
  return decision;
}

export function projectReplayDirectorDecision(decision, { mode } = {}) {
  validateDirectorDecisionForPlayerProjection(decision);
  const layout = DIRECTOR_PLAYER_MODE_LAYOUT[mode];
  if (!layout) throw new TypeError('DIRECTOR_PLAYER_MODE_INVALID');

  return deepFreeze({
    schema: DIRECTOR_PLAYER_PROJECTION_SCHEMA,
    presentationOnly: true,
    mode,
    decisionSerial: decision.serial,
    atMs: decision.atMs,
    reason: decision.reason,
    selectedCandidateId: decision.selectedCandidateId,
    selectedEventId: decision.selectedEventId,
    primarySurface: layout.primarySurface,
    wipeSurface: layout.wipeSurface,
    wipeEnabled: layout.wipeEnabled
  });
}

const REPLAY_CONVEYOR_ROUTE_SCHEMA = 'GAMEROAD_REPLAY_PLAYER_CONVEYOR_ROUTE_V1';
const BATTLE_CONVEYOR_PRESENTATION_SCHEMA = 'gameroad.battle-conveyor-presentation.v2';

function validateExistingBattleConveyorPlan(plan) {
  if (!plan ||
      typeof plan !== 'object' ||
      Array.isArray(plan) ||
      plan.schema !== BATTLE_CONVEYOR_PRESENTATION_SCHEMA ||
      plan.presentationOnly !== true ||
      !Array.isArray(plan.plans) ||
      own(plan, 'privateData') ||
      own(plan, 'privateByViewer') ||
      own(plan, 'authorityOnly')) {
    throw new TypeError('REPLAY_CONVEYOR_PLAN_INVALID');
  }
  for (const item of plan.plans) {
    if (!item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        item.schema !== BATTLE_CONVEYOR_PRESENTATION_SCHEMA ||
        item.presentationOnly !== true ||
        item.authorityBoundary !== 'accepted_public_event_only' ||
        !nonEmptyString(item.eventId) ||
        own(item, 'privateData') ||
        own(item, 'privateByViewer') ||
        own(item, 'authorityOnly')) {
      throw new TypeError('REPLAY_CONVEYOR_PLAN_INVALID');
    }
  }
  return plan;
}

function roleForSurface(projection, surface) {
  if (projection.primarySurface === surface) return 'PRIMARY';
  if (projection.wipeSurface === surface) return 'WIPE';
  return 'OFF';
}

export function routeReplayPlayerProjectionToBattleConveyor(
  decision,
  conveyorPlan,
  { mode } = {}
) {
  const projection = projectReplayDirectorDecision(decision, { mode });
  const conveyor = validateExistingBattleConveyorPlan(conveyorPlan);
  const animationRole = roleForSurface(projection, 'ANIMATION');

  return deepFreeze({
    schema: REPLAY_CONVEYOR_ROUTE_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    mode: projection.mode,
    decisionSerial: projection.decisionSerial,
    selectedCandidateId: projection.selectedCandidateId,
    selectedEventId: projection.selectedEventId,
    boardRole: roleForSurface(projection, 'BOARD'),
    animationRole,
    conveyor: {
      schema: conveyor.schema,
      consumeExistingPlan: animationRole !== 'OFF'
    }
  });
}
