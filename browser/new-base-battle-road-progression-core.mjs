export const NEW_BASE_BATTLE_ROAD_PROGRESSION_PLAN_SCHEMA =
  'GAMEROAD_NEW_BASE_BATTLE_ROAD_PROGRESSION_PLAN_V1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label}_INVALID`);
  }
  return value;
}

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label}_INVALID`);
  }
  return value;
}

function roadColumnIndex(roadColumns) {
  if (!Array.isArray(roadColumns)) throw new TypeError('ROAD_COLUMNS_INVALID');
  const byShieldId = new Map();
  for (const column of roadColumns) {
    if (!column || typeof column !== 'object' || Array.isArray(column)) {
      throw new TypeError('ROAD_COLUMN_INVALID');
    }
    const shieldId = nonEmptyString(column.shieldId, 'ROAD_COLUMN_SHIELD_ID');
    if (byShieldId.has(shieldId)) throw new TypeError(`ROAD_COLUMN_DUPLICATE_SHIELD:${shieldId}`);
    if (!Array.isArray(column.slots)) throw new TypeError(`ROAD_COLUMN_SLOTS_INVALID:${shieldId}`);
    const slots = column.slots.map(slot => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) {
        throw new TypeError(`ROAD_SLOT_INVALID:${shieldId}`);
      }
      return {
        slotId: nonEmptyString(slot.slotId, 'ROAD_SLOT_ID')
      };
    });
    if (new Set(slots.map(slot => slot.slotId)).size !== slots.length) {
      throw new TypeError(`ROAD_SLOT_DUPLICATE_ID:${shieldId}`);
    }
    byShieldId.set(shieldId, {
      shieldId,
      columnIndex: Number.isSafeInteger(column.columnIndex) ? column.columnIndex : null,
      slots
    });
  }
  return byShieldId;
}

function progressionKey({ serial, round, playerId, lane, before, after }) {
  return [
    'NEW_BASE_BATTLE_ROAD',
    serial,
    round,
    encodeURIComponent(playerId),
    encodeURIComponent(lane),
    before,
    after
  ].join(':');
}

export function planNewBaseBattleRoadProgression({
  resolution,
  roadColumns,
  resolveShieldId
}) {
  if (!resolution || typeof resolution !== 'object' || Array.isArray(resolution)) {
    throw new TypeError('BATTLE_RESOLUTION_REQUIRED');
  }
  if (typeof resolveShieldId !== 'function') {
    throw new TypeError('ROAD_SHIELD_RESOLVER_REQUIRED');
  }
  const serial = safeInteger(resolution.serial, 'BATTLE_RESOLUTION_SERIAL', 1);
  const round = safeInteger(resolution.round, 'BATTLE_RESOLUTION_ROUND', 1);
  if (!Array.isArray(resolution.laneGains)) {
    throw new TypeError('BATTLE_RESOLUTION_LANE_GAINS_INVALID');
  }

  const columnsByShieldId = roadColumnIndex(roadColumns);
  const seenGainKeys = new Set();
  const seenTargetShields = new Set();
  const steps = [];

  for (const gain of resolution.laneGains) {
    if (!gain || typeof gain !== 'object' || Array.isArray(gain)) {
      throw new TypeError('BATTLE_RESOLUTION_LANE_GAIN_INVALID');
    }
    const playerId = nonEmptyString(gain.id, 'BATTLE_RESOLUTION_LANE_GAIN_ID');
    const lane = nonEmptyString(gain.lane, 'BATTLE_RESOLUTION_LANE_GAIN_LANE');
    const before = safeInteger(gain.before, 'BATTLE_RESOLUTION_LANE_GAIN_BEFORE');
    const after = safeInteger(gain.after, 'BATTLE_RESOLUTION_LANE_GAIN_AFTER');
    const added = safeInteger(gain.added, 'BATTLE_RESOLUTION_LANE_GAIN_ADDED');
    if (after !== before + added) {
      throw new TypeError(`BATTLE_RESOLUTION_LANE_GAIN_INCONSISTENT:${playerId}:${lane}`);
    }

    const gainKey = `${JSON.stringify(playerId)}:${JSON.stringify(lane)}`;
    if (seenGainKeys.has(gainKey)) {
      throw new TypeError(`BATTLE_RESOLUTION_LANE_GAIN_DUPLICATE:${playerId}:${lane}`);
    }
    seenGainKeys.add(gainKey);
    if (added === 0) continue;

    const shieldId = nonEmptyString(
      resolveShieldId({ playerId, lane, resolution }),
      'ROAD_SHIELD_RESOLUTION'
    );
    if (seenTargetShields.has(shieldId)) {
      throw new TypeError(`ROAD_PROGRESSION_DUPLICATE_TARGET:${shieldId}`);
    }
    seenTargetShields.add(shieldId);

    const column = columnsByShieldId.get(shieldId);
    if (!column) throw new TypeError(`ROAD_PROGRESSION_UNKNOWN_SHIELD:${shieldId}`);
    if (before > column.slots.length || after > column.slots.length) {
      throw new TypeError(`ROAD_PROGRESSION_CAPACITY_EXCEEDED:${shieldId}`);
    }

    steps.push({
      progressionKey: progressionKey({ serial, round, playerId, lane, before, after }),
      playerId,
      lane,
      shieldId,
      columnIndex: column.columnIndex,
      before,
      after,
      added,
      fillSlotIds: column.slots.slice(before, after).map(slot => slot.slotId)
    });
  }

  return deepFreeze({
    schema: NEW_BASE_BATTLE_ROAD_PROGRESSION_PLAN_SCHEMA,
    source: { serial, round },
    steps
  });
}
