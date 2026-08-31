export const NEW_BASE_MATCH_PARTICIPANT_COUNT = 4;
export const NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT = 3;
export const NEW_BASE_MATCH_SHIELD_COUNT = 12;
export const NEW_BASE_MATCH_ROAD_DEPTH = 7;

const SUPPORTED_FORMATS = new Set(['FREE4P', 'TEAM2V2']);
const SUPPORTED_PLAYER_KINDS = new Set(['HUMAN', 'AI']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function canonicalString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function optionalCanonicalString(value, label) {
  if (value == null) return null;
  return canonicalString(value, label);
}

function canonicalTeamId(value, label) {
  if (typeof value === 'string') return canonicalString(value, label);
  if (Number.isSafeInteger(value)) return String(value);
  throw new TypeError(`${label} must be a canonical string or safe integer`);
}

function requireMatch(match) {
  if (!match || typeof match !== 'object' || Array.isArray(match)) {
    throw new TypeError('match must be an object');
  }
  if (!SUPPORTED_FORMATS.has(match.format)) {
    throw new TypeError('match.format must be FREE4P or TEAM2V2');
  }
  if (!Array.isArray(match.seats) || match.seats.length !== NEW_BASE_MATCH_PARTICIPANT_COUNT) {
    throw new RangeError(`match.seats must contain exactly ${NEW_BASE_MATCH_PARTICIPANT_COUNT} entries`);
  }
}

function authoritativePlayerId(seat, index) {
  if (!SUPPORTED_PLAYER_KINDS.has(seat.kind)) {
    throw new TypeError(`match.seats[${index}].kind must be HUMAN or AI`);
  }
  if (seat.kind === 'HUMAN') {
    return canonicalString(seat.clientId, `match.seats[${index}].clientId`);
  }
  return canonicalString(seat.aiId, `match.seats[${index}].aiId`);
}

export function projectNewBaseMatchParticipants(match) {
  requireMatch(match);

  const seenSlots = new Set();
  const seenPlayerIds = new Set();
  const participants = match.seats.map((seat, index) => {
    if (!seat || typeof seat !== 'object' || Array.isArray(seat)) {
      throw new TypeError(`match.seats[${index}] must be an object`);
    }
    if (!Number.isSafeInteger(seat.slot) || seat.slot < 0 || seat.slot >= NEW_BASE_MATCH_PARTICIPANT_COUNT) {
      throw new RangeError(`match.seats[${index}].slot must be an integer from 0 to 3`);
    }
    if (seenSlots.has(seat.slot)) {
      throw new RangeError(`duplicate match seat slot: ${seat.slot}`);
    }
    seenSlots.add(seat.slot);

    const playerId = authoritativePlayerId(seat, index);
    if (seenPlayerIds.has(playerId)) {
      throw new RangeError(`duplicate authoritative player id: ${playerId}`);
    }
    seenPlayerIds.add(playerId);

    let teamId = null;
    if (match.format === 'FREE4P') {
      if (seat.team != null) {
        throw new TypeError('FREE4P seats must remain teamless');
      }
    } else {
      if (seat.team == null) {
        throw new TypeError('TEAM2V2 seats require authoritative team identity');
      }
      teamId = canonicalTeamId(seat.team, `match.seats[${index}].team`);
    }

    const seatId = `SLOT:${seat.slot}`;
    return {
      slot: seat.slot,
      seatId,
      participantId: seatId,
      playerId,
      playerKind: seat.kind,
      teamId,
      shieldParticipant: {
        id: seatId,
        team: teamId,
      },
    };
  }).sort((left, right) => left.slot - right.slot);

  for (let slot = 0; slot < NEW_BASE_MATCH_PARTICIPANT_COUNT; slot += 1) {
    if (participants[slot]?.slot !== slot) {
      throw new RangeError('match seats must cover authoritative slots 0 through 3 exactly once');
    }
  }

  if (match.format === 'TEAM2V2') {
    const teamCounts = new Map();
    for (const participant of participants) {
      teamCounts.set(participant.teamId, (teamCounts.get(participant.teamId) || 0) + 1);
    }
    if (teamCounts.size !== 2 || [...teamCounts.values()].some((count) => count !== 2)) {
      throw new TypeError('TEAM2V2 requires exactly two authoritative teams of two');
    }
  }

  return deepFreeze({
    format: match.format,
    participants,
    shieldParticipants: participants.map((participant) => participant.shieldParticipant),
  });
}

function requireShieldAnchors(shieldAnchors, participantProjection) {
  if (!shieldAnchors || typeof shieldAnchors !== 'object' || Array.isArray(shieldAnchors)) {
    throw new TypeError('shieldAnchors must be an object');
  }
  const { shieldIds, shields, participants } = shieldAnchors;
  if (!Array.isArray(shieldIds) || shieldIds.length !== NEW_BASE_MATCH_SHIELD_COUNT) {
    throw new RangeError(`shieldAnchors.shieldIds must contain exactly ${NEW_BASE_MATCH_SHIELD_COUNT} entries`);
  }
  if (!Array.isArray(shields) || shields.length !== NEW_BASE_MATCH_SHIELD_COUNT) {
    throw new RangeError(`shieldAnchors.shields must contain exactly ${NEW_BASE_MATCH_SHIELD_COUNT} entries`);
  }
  if (!Array.isArray(participants) || participants.length !== NEW_BASE_MATCH_PARTICIPANT_COUNT) {
    throw new RangeError(`shieldAnchors.participants must contain exactly ${NEW_BASE_MATCH_PARTICIPANT_COUNT} entries`);
  }

  const seenShieldIds = new Set();
  const shieldsByParticipant = new Map(
    participantProjection.participants.map((participant) => [participant.participantId, []]),
  );

  const normalizedShields = shields.map((shield, index) => {
    if (!shield || typeof shield !== 'object' || Array.isArray(shield)) {
      throw new TypeError(`shieldAnchors.shields[${index}] must be an object`);
    }
    const shieldId = canonicalString(shield.shieldId, `shieldAnchors.shields[${index}].shieldId`);
    if (seenShieldIds.has(shieldId)) throw new RangeError(`duplicate Shield id: ${shieldId}`);
    seenShieldIds.add(shieldId);
    if (shieldIds[index] !== shieldId) {
      throw new TypeError(`shieldAnchors.shieldIds[${index}] must match shields[${index}].shieldId`);
    }

    if (!Number.isSafeInteger(shield.participantIndex)
        || shield.participantIndex < 0
        || shield.participantIndex >= NEW_BASE_MATCH_PARTICIPANT_COUNT) {
      throw new RangeError(`shieldAnchors.shields[${index}].participantIndex is invalid`);
    }
    if (!Number.isSafeInteger(shield.shieldIndex)
        || shield.shieldIndex < 1
        || shield.shieldIndex > NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT) {
      throw new RangeError(`shieldAnchors.shields[${index}].shieldIndex is invalid`);
    }

    const expected = participantProjection.participants[shield.participantIndex];
    if (shield.participantId !== expected.participantId) {
      throw new TypeError(`Shield ${shieldId} participant ownership mismatch`);
    }
    const shieldTeam = optionalCanonicalString(shield.team, `shieldAnchors.shields[${index}].team`);
    if (shieldTeam !== expected.teamId) {
      throw new TypeError(`Shield ${shieldId} team ownership mismatch`);
    }

    const owned = shieldsByParticipant.get(expected.participantId);
    if (owned.some((candidate) => candidate.shieldIndex === shield.shieldIndex)) {
      throw new RangeError(`duplicate Shield index for participant ${expected.participantId}`);
    }
    owned.push({ shieldId, shieldIndex: shield.shieldIndex });

    return {
      shieldId,
      shieldIndex: shield.shieldIndex,
      participantId: expected.participantId,
      seatId: expected.seatId,
      playerId: expected.playerId,
      playerKind: expected.playerKind,
      teamId: expected.teamId,
    };
  });

  for (const participant of participantProjection.participants) {
    const owned = shieldsByParticipant.get(participant.participantId);
    if (owned.length !== NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT
        || owned.map((shield) => shield.shieldIndex).sort().join(',') !== '1,2,3') {
      throw new TypeError(`participant ${participant.participantId} must own Shield indices 1,2,3 exactly once`);
    }

    const summary = participants[participant.slot];
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      throw new TypeError(`shieldAnchors.participants[${participant.slot}] must be an object`);
    }
    if (summary.participantIndex !== participant.slot
        || summary.participantId !== participant.participantId
        || optionalCanonicalString(summary.team, `shieldAnchors.participants[${participant.slot}].team`) !== participant.teamId) {
      throw new TypeError(`Shield participant summary mismatch for ${participant.participantId}`);
    }
    if (!Array.isArray(summary.shieldIds)
        || summary.shieldIds.length !== NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT) {
      throw new TypeError(`Shield participant summary requires three shieldIds for ${participant.participantId}`);
    }
    const expectedIds = owned.sort((left, right) => left.shieldIndex - right.shieldIndex).map((shield) => shield.shieldId);
    if (summary.shieldIds.some((shieldId, index) => shieldId !== expectedIds[index])) {
      throw new TypeError(`Shield participant summary IDs mismatch for ${participant.participantId}`);
    }
  }

  return normalizedShields;
}

function requireRoadColumns(roadColumns, normalizedShields) {
  if (!Array.isArray(roadColumns) || roadColumns.length !== NEW_BASE_MATCH_SHIELD_COUNT) {
    throw new RangeError(`roadColumns must contain exactly ${NEW_BASE_MATCH_SHIELD_COUNT} entries`);
  }

  const ownerByShieldId = new Map(normalizedShields.map((shield) => [shield.shieldId, shield]));
  const seenRoadShieldIds = new Set();
  const seenSlotIds = new Set();

  return roadColumns.map((column, columnIndex) => {
    if (!column || typeof column !== 'object' || Array.isArray(column)) {
      throw new TypeError(`roadColumns[${columnIndex}] must be an object`);
    }
    const shieldId = canonicalString(column.shieldId, `roadColumns[${columnIndex}].shieldId`);
    if (column.columnIndex !== columnIndex) {
      throw new TypeError(`roadColumns[${columnIndex}].columnIndex must equal its structural index`);
    }
    if (seenRoadShieldIds.has(shieldId)) throw new RangeError(`duplicate ROAD column Shield id: ${shieldId}`);
    seenRoadShieldIds.add(shieldId);

    const expectedShield = normalizedShields[columnIndex];
    if (shieldId !== expectedShield.shieldId || !ownerByShieldId.has(shieldId)) {
      throw new TypeError(`ROAD column ${columnIndex} must bind the corresponding known Shield id`);
    }
    if (!Array.isArray(column.slots) || column.slots.length !== NEW_BASE_MATCH_ROAD_DEPTH) {
      throw new RangeError(`roadColumns[${columnIndex}].slots must contain exactly ${NEW_BASE_MATCH_ROAD_DEPTH} entries`);
    }

    const slotIds = column.slots.map((slot, slotIndex) => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        throw new TypeError(`roadColumns[${columnIndex}].slots[${slotIndex}] must be an object`);
      }
      const slotId = canonicalString(slot.slotId, `roadColumns[${columnIndex}].slots[${slotIndex}].slotId`);
      if (seenSlotIds.has(slotId)) throw new RangeError(`duplicate ROAD_SLOT id: ${slotId}`);
      seenSlotIds.add(slotId);
      if (slot.shieldId !== shieldId
          || slot.columnIndex !== columnIndex
          || slot.depth !== slotIndex + 1) {
        throw new TypeError(`ROAD_SLOT ${slotId} structural identity mismatch`);
      }
      return slotId;
    });

    return {
      shieldId,
      participantId: expectedShield.participantId,
      seatId: expectedShield.seatId,
      playerId: expectedShield.playerId,
      playerKind: expectedShield.playerKind,
      teamId: expectedShield.teamId,
      columnIndex,
      slotIds,
    };
  });
}

export function bindNewBaseShieldRoadOwnership({ match, shieldAnchors, roadColumns } = {}) {
  const participantProjection = projectNewBaseMatchParticipants(match);
  const shields = requireShieldAnchors(shieldAnchors, participantProjection);
  const ownedRoadColumns = requireRoadColumns(roadColumns, shields);

  return deepFreeze({
    format: participantProjection.format,
    participants: participantProjection.participants,
    shieldParticipants: participantProjection.shieldParticipants,
    shields,
    roadColumns: ownedRoadColumns,
  });
}
