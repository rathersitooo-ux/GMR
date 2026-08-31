import test from "node:test";
import assert from "node:assert/strict";

import {
  NEW_BASE_ROAD_COLUMN_COUNT,
  NEW_BASE_ROAD_SLOT_COUNT,
  NEW_BASE_ROAD_SLOT_DEPTH,
  createNewBaseRoadSlotColumns,
} from "../browser/new-base-road-slot-core.mjs";

const shieldIds = () =>
  Array.from({ length: NEW_BASE_ROAD_COLUMN_COUNT }, (_, index) =>
    `SHIELD_${String(index + 1).padStart(2, "0")}`,
  );

test("creates exactly 12 Shield-bound columns x 7 ROAD_SLOT entries", () => {
  const ids = shieldIds();
  const columns = createNewBaseRoadSlotColumns({ shieldIds: ids });

  assert.equal(NEW_BASE_ROAD_COLUMN_COUNT, 12);
  assert.equal(NEW_BASE_ROAD_SLOT_DEPTH, 7);
  assert.equal(NEW_BASE_ROAD_SLOT_COUNT, 84);
  assert.equal(columns.length, 12);
  assert.deepEqual(
    columns.map((column) => column.shieldId),
    ids,
  );

  const slots = columns.flatMap((column) => column.slots);
  assert.equal(slots.length, 84);
  assert.equal(new Set(slots.map((slot) => slot.slotId)).size, 84);

  for (const [columnIndex, column] of columns.entries()) {
    assert.equal(column.columnIndex, columnIndex);
    assert.equal(column.slots.length, 7);
    assert.deepEqual(
      column.slots.map((slot) => slot.depth),
      [1, 2, 3, 4, 5, 6, 7],
    );
    for (const slot of column.slots) {
      assert.equal(slot.shieldId, column.shieldId);
      assert.equal(slot.columnIndex, columnIndex);
    }
  }
});

test("is deterministic and keeps identity mapping external", () => {
  const ids = shieldIds().reverse();
  const first = createNewBaseRoadSlotColumns({ shieldIds: ids });
  const second = createNewBaseRoadSlotColumns({ shieldIds: ids });

  assert.deepEqual(first, second);
  assert.equal(first[0].shieldId, ids[0]);
  assert.equal(first[11].shieldId, ids[11]);
});

test("accepts a caller-owned slot id factory without adding graph semantics", () => {
  const columns = createNewBaseRoadSlotColumns({
    shieldIds: shieldIds(),
    makeSlotId: ({ shieldId, depth }) => `${shieldId}/ROAD/${depth}`,
  });

  assert.equal(columns[2].slots[4].slotId, "SHIELD_03/ROAD/5");
  assert.deepEqual(Object.keys(columns[0]).sort(), ["columnIndex", "shieldId", "slots"]);
  assert.deepEqual(Object.keys(columns[0].slots[0]).sort(), [
    "columnIndex",
    "depth",
    "shieldId",
    "slotId",
  ]);

  for (const forbidden of [
    "neighbors",
    "ownerPlayerId",
    "teamId",
    "goal",
    "field",
    "complete",
    "winner",
  ]) {
    assert.equal(forbidden in columns[0], false);
    assert.equal(forbidden in columns[0].slots[0], false);
  }
});

test("rejects incomplete, oversized, blank, or duplicate Shield identity lists", () => {
  assert.throws(
    () => createNewBaseRoadSlotColumns({ shieldIds: shieldIds().slice(0, 11) }),
    /exactly 12/,
  );
  assert.throws(
    () => createNewBaseRoadSlotColumns({ shieldIds: [...shieldIds(), "SHIELD_13"] }),
    /exactly 12/,
  );

  const blank = shieldIds();
  blank[4] = " ";
  assert.throws(() => createNewBaseRoadSlotColumns({ shieldIds: blank }), /non-empty/);

  const duplicate = shieldIds();
  duplicate[11] = duplicate[0];
  assert.throws(() => createNewBaseRoadSlotColumns({ shieldIds: duplicate }), /unique/);
});

test("rejects invalid or duplicate caller-owned ROAD_SLOT ids", () => {
  assert.throws(
    () =>
      createNewBaseRoadSlotColumns({
        shieldIds: shieldIds(),
        makeSlotId: () => "",
      }),
    /non-empty string/,
  );

  assert.throws(
    () =>
      createNewBaseRoadSlotColumns({
        shieldIds: shieldIds(),
        makeSlotId: () => "same-slot",
      }),
    /duplicate ROAD_SLOT id/,
  );
});
