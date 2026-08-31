export const NEW_BASE_PARTICIPANT_COUNT = 4;
export const NEW_BASE_SHIELDS_PER_PARTICIPANT = 3;
export const NEW_BASE_SHIELD_COUNT =
  NEW_BASE_PARTICIPANT_COUNT * NEW_BASE_SHIELDS_PER_PARTICIPANT;

function canonicalToken(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function optionalCanonicalToken(value, label) {
  if (value == null) return null;
  return canonicalToken(value, label);
}

function requireParticipants(participants) {
  if (!Array.isArray(participants)) {
    throw new TypeError("participants must be an array");
  }
  if (participants.length !== NEW_BASE_PARTICIPANT_COUNT) {
    throw new RangeError(
      `participants must contain exactly ${NEW_BASE_PARTICIPANT_COUNT} entries`,
    );
  }

  const seenParticipantIds = new Set();
  return participants.map((participant, participantIndex) => {
    if (!participant || typeof participant !== "object" || Array.isArray(participant)) {
      throw new TypeError(`participants[${participantIndex}] must be an object`);
    }

    const participantId = canonicalToken(
      participant.id,
      `participants[${participantIndex}].id`,
    );
    if (seenParticipantIds.has(participantId)) {
      throw new RangeError(`duplicate participant id: ${participantId}`);
    }
    seenParticipantIds.add(participantId);

    return Object.freeze({
      participantId,
      team: optionalCanonicalToken(
        participant.team,
        `participants[${participantIndex}].team`,
      ),
      participantIndex,
    });
  });
}

function defaultShieldId({ participantId, shieldIndex }) {
  return `SHIELD:${encodeURIComponent(participantId)}:${shieldIndex}`;
}

export function createNewBaseShieldAnchors({
  participants,
  makeShieldId = defaultShieldId,
} = {}) {
  const normalizedParticipants = requireParticipants(participants);
  if (typeof makeShieldId !== "function") {
    throw new TypeError("makeShieldId must be a function");
  }

  const usedShieldIds = new Set();
  const shields = [];
  const participantShields = normalizedParticipants.map((participant) => {
    const shieldIds = [];

    for (let shieldIndex = 1; shieldIndex <= NEW_BASE_SHIELDS_PER_PARTICIPANT; shieldIndex += 1) {
      const shieldId = makeShieldId({
        participantId: participant.participantId,
        team: participant.team,
        participantIndex: participant.participantIndex,
        shieldIndex,
      });

      if (typeof shieldId !== "string" || shieldId.trim() === "") {
        throw new TypeError(
          `makeShieldId must return a non-empty string for participant ${participant.participantIndex}, Shield ${shieldIndex}`,
        );
      }
      if (usedShieldIds.has(shieldId)) {
        throw new RangeError(`duplicate Shield id: ${shieldId}`);
      }
      usedShieldIds.add(shieldId);
      shieldIds.push(shieldId);
      shields.push(Object.freeze({
        shieldId,
        participantId: participant.participantId,
        team: participant.team,
        participantIndex: participant.participantIndex,
        shieldIndex,
      }));
    }

    return Object.freeze({
      participantId: participant.participantId,
      team: participant.team,
      participantIndex: participant.participantIndex,
      shieldIds: Object.freeze(shieldIds),
    });
  });

  if (usedShieldIds.size !== NEW_BASE_SHIELD_COUNT) {
    throw new Error("Shield structural invariant failed");
  }

  return Object.freeze({
    shieldIds: Object.freeze(shields.map((shield) => shield.shieldId)),
    shields: Object.freeze(shields),
    participants: Object.freeze(participantShields),
  });
}
