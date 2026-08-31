export const SECRET_COMMIT_REVEAL_ROUND_SCHEMA = 'gameroad.secret-commit-reveal-round.v1';

function fail(message) {
  throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireRoundId(roundId) {
  if (typeof roundId !== 'string' || roundId.length === 0) fail('roundId must be a non-empty string');
  return roundId;
}

function requireRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0) fail('revision must be a non-negative safe integer');
  return revision;
}

function requireParticipantId(participantId) {
  if (typeof participantId !== 'string' || participantId.length === 0) {
    fail('participantId must be a non-empty string');
  }
  return participantId;
}

function requireCommitment(commitment) {
  if (typeof commitment !== 'string' || commitment.length === 0) {
    fail('commitment must be a non-empty opaque string');
  }
  return commitment;
}

function normalizeParticipantIds(participantIds) {
  if (!Array.isArray(participantIds)) fail('participantIds must be an array');
  if (participantIds.length < 2 || participantIds.length > 4) {
    fail('participantIds must contain between 2 and 4 participants');
  }
  const normalized = participantIds.map(requireParticipantId).sort(compareText);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index] === normalized[index - 1]) {
      fail(`duplicate participantId: ${normalized[index]}`);
    }
  }
  return normalized;
}

function freezeCommitments(commitments) {
  return Object.freeze(commitments.map((entry) => Object.freeze({
    participantId: entry.participantId,
    commitment: entry.commitment,
  })));
}

function makeRound({ roundId, revision, participantIds, commitments, closed }) {
  return Object.freeze({
    schema: SECRET_COMMIT_REVEAL_ROUND_SCHEMA,
    roundId,
    revision,
    participantIds: Object.freeze([...participantIds]),
    commitments: freezeCommitments(commitments),
    closed,
  });
}

function normalizeRound(round) {
  if (!round || typeof round !== 'object' || Array.isArray(round)) {
    fail('secret commit/reveal round must be an object');
  }
  if (round.schema !== SECRET_COMMIT_REVEAL_ROUND_SCHEMA) {
    fail('unsupported secret commit/reveal round schema');
  }

  const roundId = requireRoundId(round.roundId);
  const revision = requireRevision(round.revision);
  const participantIds = normalizeParticipantIds(round.participantIds);
  if (JSON.stringify(participantIds) !== JSON.stringify(round.participantIds)) {
    fail('participantIds must use canonical sorted order');
  }
  if (!Array.isArray(round.commitments)) fail('round.commitments must be an array');
  if (typeof round.closed !== 'boolean') fail('round.closed must be boolean');

  const expected = new Set(participantIds);
  const seen = new Set();
  const commitments = [];
  for (const entry of round.commitments) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('commitment entry must be an object');
    }
    const participantId = requireParticipantId(entry.participantId);
    const commitment = requireCommitment(entry.commitment);
    if (!expected.has(participantId)) {
      fail(`commitment supplied for nonparticipant: ${participantId}`);
    }
    if (seen.has(participantId)) {
      fail(`duplicate commitment for participantId: ${participantId}`);
    }
    seen.add(participantId);
    commitments.push({ participantId, commitment });
  }
  commitments.sort((left, right) => compareText(left.participantId, right.participantId));
  if (JSON.stringify(commitments) !== JSON.stringify(round.commitments)) {
    fail('commitments must use canonical participant order');
  }
  if (commitments.length > participantIds.length) fail('too many commitments');
  if (round.closed && commitments.length !== participantIds.length) {
    fail('closed secret commit/reveal round must retain every participant commitment');
  }

  return { roundId, revision, participantIds, commitments, closed: round.closed };
}

function requireRevealEnvelope(reveal) {
  if (!reveal || typeof reveal !== 'object' || Array.isArray(reveal)) {
    fail('reveal must be an object');
  }
  return {
    roundId: requireRoundId(reveal.roundId),
    revision: requireRevision(reveal.revision),
    participantId: requireParticipantId(reveal.participantId),
    payload: reveal.payload,
  };
}

function requireRevealVerifier(verifyReveal) {
  if (typeof verifyReveal !== 'function') fail('verifyReveal must be a function');
  return verifyReveal;
}

function requireVerificationVerdict(verdict, participantId) {
  if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict) || verdict.ok !== true) {
    fail(`reveal verification failed for participantId: ${participantId}`);
  }
  return verdict;
}

export function createSecretCommitRevealRound({ roundId, revision, participantIds } = {}) {
  return makeRound({
    roundId: requireRoundId(roundId),
    revision: requireRevision(revision),
    participantIds: normalizeParticipantIds(participantIds),
    commitments: [],
    closed: false,
  });
}

export function getSecretCommitRevealPublicState(round) {
  const safe = normalizeRound(round);
  const allCommitted = safe.commitments.length === safe.participantIds.length;
  return Object.freeze({
    schema: SECRET_COMMIT_REVEAL_ROUND_SCHEMA,
    roundId: safe.roundId,
    revision: safe.revision,
    participantIds: Object.freeze([...safe.participantIds]),
    commitments: freezeCommitments(safe.commitments),
    committedCount: safe.commitments.length,
    expectedCount: safe.participantIds.length,
    allCommitted,
    phase: safe.closed ? 'closed' : allCommitted ? 'reveal-ready' : 'commit',
  });
}

export function commitSecretSelection(round, {
  roundId,
  revision,
  participantId,
  commitment,
} = {}) {
  const safe = normalizeRound(round);
  if (safe.closed) fail('secret commit/reveal round is already closed');
  if (requireRoundId(roundId) !== safe.roundId) fail('stale or mismatched roundId');
  if (requireRevision(revision) !== safe.revision) fail('stale or mismatched revision');

  const safeParticipantId = requireParticipantId(participantId);
  if (!safe.participantIds.includes(safeParticipantId)) {
    fail(`unknown participant: ${safeParticipantId}`);
  }
  if (safe.commitments.some((entry) => entry.participantId === safeParticipantId)) {
    fail(`duplicate commitment for participantId: ${safeParticipantId}`);
  }

  const commitments = [
    ...safe.commitments,
    { participantId: safeParticipantId, commitment: requireCommitment(commitment) },
  ].sort((left, right) => compareText(left.participantId, right.participantId));

  return makeRound({ ...safe, commitments });
}

export async function finalizeSecretCommitRevealRound(round, reveals, verifyReveal) {
  const safe = normalizeRound(round);
  if (safe.closed) fail('secret commit/reveal round is already closed');
  if (safe.commitments.length !== safe.participantIds.length) {
    fail('reveal blocked until every expected participant has committed');
  }
  if (!Array.isArray(reveals)) fail('reveals must be an array');
  if (reveals.length !== safe.participantIds.length) {
    fail('reveals must contain every expected participant exactly once');
  }
  const verifier = requireRevealVerifier(verifyReveal);

  const expected = new Set(safe.participantIds);
  const revealByParticipant = new Map();
  for (const reveal of reveals) {
    const normalized = requireRevealEnvelope(reveal);
    if (normalized.roundId !== safe.roundId) fail('stale or mismatched reveal roundId');
    if (normalized.revision !== safe.revision) fail('stale or mismatched reveal revision');
    if (!expected.has(normalized.participantId)) {
      fail(`reveal supplied for nonparticipant: ${normalized.participantId}`);
    }
    if (revealByParticipant.has(normalized.participantId)) {
      fail(`duplicate reveal for participantId: ${normalized.participantId}`);
    }
    revealByParticipant.set(normalized.participantId, normalized);
  }

  const commitmentByParticipant = new Map(
    safe.commitments.map((entry) => [entry.participantId, entry.commitment]),
  );
  const verifiedEntries = [];
  for (const participantId of safe.participantIds) {
    const reveal = revealByParticipant.get(participantId);
    if (!reveal) fail(`missing reveal for participantId: ${participantId}`);
    const verdict = requireVerificationVerdict(await verifier(Object.freeze({
      roundId: safe.roundId,
      revision: safe.revision,
      participantId,
      commitment: commitmentByParticipant.get(participantId),
      payload: reveal.payload,
    })), participantId);
    verifiedEntries.push(Object.freeze({
      participantId,
      publicValue: verdict.publicValue,
    }));
  }

  const snapshot = Object.freeze({
    roundId: safe.roundId,
    revision: safe.revision,
    participantIds: Object.freeze([...safe.participantIds]),
    entries: Object.freeze(verifiedEntries),
  });
  const closedRound = makeRound({ ...safe, closed: true });

  return Object.freeze({ round: closedRound, snapshot });
}
