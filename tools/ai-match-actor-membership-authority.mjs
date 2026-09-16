import { storedMatchTicketStatus } from '../deploy/cloudflare/relay/src/match-store.mjs';

export const AI_MATCH_ACTOR_MEMBERSHIP_SCHEMA = 'gameroad.ai-match-actor-membership-authority.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function exactToken(value, max = 128) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max) return null;
  return token;
}

function reject(reason) {
  return deepFreeze({
    ok: false,
    reason,
    membership: null,
    containsPrivate: false,
    gameplayAuthoritative: false,
    roleVerified: false,
    decisionSequenceVerified: false,
    stateVersionVerified: false,
    aiConsumerReady: false,
  });
}

function normalizeMatchSeats(match) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) return null;
  const matchId = exactToken(match.matchId, 128);
  if (!matchId || !Array.isArray(match.seats) || match.seats.length !== 4) return null;
  if (!Array.isArray(match.aiSeats)) return null;

  const aiSeatSet = new Set();
  for (const slot of match.aiSeats) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 4 || aiSeatSet.has(slot)) return null;
    aiSeatSet.add(slot);
  }

  const aiIds = new Set();
  const seats = match.seats.map((raw, slot) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.slot !== slot) return null;
    const kind = raw.kind === 'AI' ? 'AI' : raw.kind === 'HUMAN' ? 'HUMAN' : null;
    if (!kind) return null;

    if (kind === 'AI') {
      const aiId = exactToken(raw.aiId, 96);
      if (!aiId || aiIds.has(aiId) || !aiSeatSet.has(slot)) return null;
      aiIds.add(aiId);
      return { slot, kind, aiId, team: raw.team ?? null };
    }

    if (aiSeatSet.has(slot)) return null;
    return { slot, kind, aiId: null, team: raw.team ?? null };
  });
  if (seats.some((seat) => seat === null)) return null;
  if (seats.filter((seat) => seat.kind === 'AI').length !== aiSeatSet.size) return null;

  const format = exactToken(match.format, 32);
  if (!format) return null;

  let teamShapeVerified = false;
  if (format === 'TEAM2V2') {
    const counts = new Map();
    for (const seat of seats) {
      if (!Number.isSafeInteger(seat.team) || seat.team < 0) return null;
      counts.set(seat.team, (counts.get(seat.team) ?? 0) + 1);
    }
    if (counts.size !== 2 || [...counts.values()].some((count) => count !== 2)) return null;
    teamShapeVerified = true;
  } else if (format === 'FREE4P') {
    if (seats.some((seat) => seat.team !== null)) return null;
  } else {
    return null;
  }

  return { matchId, format, seats, teamShapeVerified };
}

/**
 * Resolves only the authority that already exists in the current server match store.
 * Authentication is performed by storedMatchTicketStatus using the real ticket secret;
 * callers cannot supply verification booleans. This function proves that a named AI
 * actor is a frozen member of that authenticated match and, for TEAM2V2, which server
 * team it occupies. It intentionally does not invent gameplay role, decision sequence,
 * stateVersion, legality, reward, training labels, or execution authority.
 */
export async function resolveAiMatchActorMembershipAuthority({
  storage,
  ticketId,
  secret,
  actorRef,
} = {}) {
  const canonicalActorRef = exactToken(actorRef, 96);
  if (!canonicalActorRef) return reject('AI_ACTOR_REF_INVALID');

  const status = await storedMatchTicketStatus(storage, { ticketId, secret });
  if (status?.ok !== true) return reject('MATCH_SESSION_AUTH_REQUIRED');
  if (status.ticket?.status !== 'MATCHED' || !status.match) return reject('MATCHED_SESSION_REQUIRED');

  const normalized = normalizeMatchSeats(status.match);
  if (!normalized) return reject('MATCH_AI_SEAT_RECORD_INVALID');
  if (status.ticket.matchId !== normalized.matchId) return reject('MATCH_IDENTITY_MISMATCH');

  const actorSeat = normalized.seats.find(
    (seat) => seat.kind === 'AI' && seat.aiId === canonicalActorRef,
  );
  if (!actorSeat) return reject('AI_ACTOR_NOT_IN_MATCH');

  const teamVerified = normalized.format === 'TEAM2V2' && normalized.teamShapeVerified;
  return deepFreeze({
    ok: true,
    reason: null,
    schema: AI_MATCH_ACTOR_MEMBERSHIP_SCHEMA,
    membership: {
      matchId: normalized.matchId,
      actorType: 'AI',
      actorRef: canonicalActorRef,
      slot: actorSeat.slot,
      team: teamVerified ? actorSeat.team : null,
      format: normalized.format,
    },
    authority: {
      authenticatedMatchSession: true,
      matchIdentityVerified: true,
      aiActorMembershipVerified: true,
      seatVerified: true,
      teamVerified,
      gameplayRoleVerified: false,
      decisionSequenceVerified: false,
      stateVersionVerified: false,
    },
    unresolved: {
      roleId: null,
      decisionSequence: null,
      stateVersion: null,
    },
    requesterIdentityIncluded: false,
    ticketIdIncluded: false,
    secretIncluded: false,
    containsPrivate: false,
    gameplayAuthoritative: false,
    legalityAuthoritative: false,
    rewardAttached: false,
    trainingEligible: false,
    bestMoveProven: false,
    autoExecute: false,
    aiConsumerReady: false,
  });
}

export const AI_MATCH_ACTOR_MEMBERSHIP_CONTRACT = deepFreeze({
  schema: AI_MATCH_ACTOR_MEMBERSHIP_SCHEMA,
  authenticationAuthority: 'deploy/cloudflare/relay/src/match-store.mjs#storedMatchTicketStatus',
  membershipAuthority: 'CURRENT_SERVER_MATCH_RECORD_AI_SEATS',
  teamAuthority: 'CURRENT_SERVER_MATCH_RECORD_TEAM2V2_ONLY',
  roleAuthority: 'NONE',
  decisionSequenceAuthority: 'NONE',
  stateVersionAuthority: 'NONE',
  gameplayAuthority: false,
  legalityAuthority: false,
  rewardAttached: false,
  trainingEligible: false,
  bestMoveProven: false,
  autoExecute: false,
});
