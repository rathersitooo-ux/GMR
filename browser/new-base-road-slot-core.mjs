export const NEW_BASE_ROAD_COLUMN_COUNT = 12;
export const NEW_BASE_ROAD_SLOT_DEPTH = 7;
export const NEW_BASE_ROAD_SLOT_COUNT =
  NEW_BASE_ROAD_COLUMN_COUNT * NEW_BASE_ROAD_SLOT_DEPTH;

function requireShieldIds(shieldIds) {
  if (!Array.isArray(shieldIds)) {
    throw new TypeError("shieldIds must be an array");
  }
  if (shieldIds.length !== NEW_BASE_ROAD_COLUMN_COUNT) {
    throw new RangeError(
      `shieldIds must contain exactly ${NEW_BASE_ROAD_COLUMN_COUNT} entries`,
    );
  }

  const normalized = shieldIds.map((shieldId, columnIndex) => {
    if (typeof shieldId !== "string" || shieldId.trim() === "") {
      throw new TypeError(`shieldIds[${columnIndex}] must be a non-empty string`);
    }
    return shieldId;
  });

  if (new Set(normalized).size !== normalized.length) {
    throw new RangeError("shieldIds must be unique");
  }

  return normalized;
}

function defaultSlotId({ shieldId, depth }) {
  return `ROAD_SLOT:${encodeURIComponent(shieldId)}:${depth}`;
}

export function createNewBaseRoadSlotColumns({
  shieldIds,
  makeSlotId = defaultSlotId,
} = {}) {
  const normalizedShieldIds = requireShieldIds(shieldIds);
  if (typeof makeSlotId !== "function") {
    throw new TypeError("makeSlotId must be a function");
  }

  const usedSlotIds = new Set();
  const columns = normalizedShieldIds.map((shieldId, columnIndex) => {
    const slots = Array.from({ length: NEW_BASE_ROAD_SLOT_DEPTH }, (_, slotIndex) => {
      const depth = slotIndex + 1;
      const slotId = makeSlotId({ shieldId, columnIndex, depth });
      if (typeof slotId !== "string" || slotId.trim() === "") {
        throw new TypeError(
          `makeSlotId must return a non-empty string for column ${columnIndex}, depth ${depth}`,
        );
      }
      if (usedSlotIds.has(slotId)) {
        throw new RangeError(`duplicate ROAD_SLOT id: ${slotId}`);
      }
      usedSlotIds.add(slotId);

      return Object.freeze({
        slotId,
        shieldId,
        columnIndex,
        depth,
      });
    });

    return Object.freeze({
      shieldId,
      columnIndex,
      slots: Object.freeze(slots),
    });
  });

  if (usedSlotIds.size !== NEW_BASE_ROAD_SLOT_COUNT) {
    throw new Error("ROAD_SLOT structural invariant failed");
  }

  return Object.freeze(columns);
}
