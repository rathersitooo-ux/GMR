import test from "node:test";
import assert from "node:assert/strict";
import { autoAssignHand3ToFixedJankenSlots } from "../browser/newbase-janken-hand-assignment-core.mjs";

const FIXED_SLOTS = Object.freeze([
  Object.freeze({ slotId: "slot-rock", jankenHand: "ROCK" }),
  Object.freeze({ slotId: "slot-scissors", jankenHand: "SCISSORS" }),
  Object.freeze({ slotId: "slot-paper", jankenHand: "PAPER" }),
]);

function makeHand() {
  return [
    { id: "card-a", suit: "club", power: 1 },
    { id: "card-b", suit: "diamond", power: 2 },
    { id: "card-c", suit: "spade", power: 3 },
  ];
}

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, candidateIndex) => candidateIndex !== index)).map((tail) => [item, ...tail]),
  );
}

test("automatically assigns one policy result to the three fixed janken slots", () => {
  const hand = makeHand();
  let calls = 0;
  const assigned = autoAssignHand3ToFixedJankenSlots({
    hand,
    fixedSlots: FIXED_SLOTS,
    assignmentPolicy(input) {
      calls += 1;
      assert.equal(Object.isFrozen(input), true);
      assert.equal(Object.isFrozen(input.hand), true);
      assert.equal(Object.isFrozen(input.fixedSlots), true);
      assert.deepEqual(input.fixedSlots.map((slot) => slot.jankenHand), ["ROCK", "SCISSORS", "PAPER"]);
      return ["card-c", "card-a", "card-b"];
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(assigned, [
    { slotId: "slot-rock", jankenHand: "ROCK", cardId: "card-c" },
    { slotId: "slot-scissors", jankenHand: "SCISSORS", cardId: "card-a" },
    { slotId: "slot-paper", jankenHand: "PAPER", cardId: "card-b" },
  ]);
  assert.equal(Object.isFrozen(assigned), true);
  assert.equal(assigned.every(Object.isFrozen), true);
});

test("keeps native card suit separate from assigned janken hand", () => {
  const hand = makeHand();
  const before = structuredClone(hand);
  const assigned = autoAssignHand3ToFixedJankenSlots({
    hand,
    fixedSlots: FIXED_SLOTS,
    assignmentPolicy: () => ["card-b", "card-c", "card-a"],
  });

  assert.deepEqual(hand, before);
  assert.equal(hand[1].suit, "diamond");
  assert.equal(assigned[0].jankenHand, "ROCK");
  assert.equal(assigned[0].cardId, "card-b");
  assert.equal(Object.hasOwn(assigned[0], "suit"), false);
});

test("does not invent a default assignment policy", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlots: FIXED_SLOTS }),
    /assignmentPolicy_required/,
  );
});

test("accepts every exact permutation supplied by policy without imposing a mapping", () => {
  for (const permutation of permutations(["card-a", "card-b", "card-c"])) {
    const assigned = autoAssignHand3ToFixedJankenSlots({
      hand: makeHand(),
      fixedSlots: FIXED_SLOTS,
      assignmentPolicy: () => permutation,
    });
    assert.deepEqual(assigned.map((entry) => entry.cardId), permutation);
  }
});

test("fails closed unless current hand is exactly three uniquely identified cards", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand().slice(0, 2), fixedSlots: FIXED_SLOTS, assignmentPolicy: () => [] }),
    /hand_must_contain_exactly_3_cards/,
  );
  const duplicate = makeHand();
  duplicate[2].id = "card-a";
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: duplicate, fixedSlots: FIXED_SLOTS, assignmentPolicy: () => ["card-a", "card-b", "card-a"] }),
    /hand_card_ids_must_be_unique/,
  );
});

test("fails closed unless slots are exactly fixed ROCK SCISSORS PAPER identities", () => {
  const badSlots = [
    { slotId: "slot-rock", jankenHand: "ROCK" },
    { slotId: "slot-scissors", jankenHand: "SCISSORS" },
    { slotId: "slot-lizard", jankenHand: "LIZARD" },
  ];
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlots: badSlots, assignmentPolicy: () => ["card-a", "card-b", "card-c"] }),
    /fixed_slots_must_be_exactly_ROCK_SCISSORS_PAPER/,
  );
});

test("fails closed on duplicate or unknown card ids returned by policy", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlots: FIXED_SLOTS, assignmentPolicy: () => ["card-a", "card-a", "card-c"] }),
    /assignment_policy_card_ids_must_be_unique/,
  );
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlots: FIXED_SLOTS, assignmentPolicy: () => ["card-a", "card-b", "card-x"] }),
    /assignment_policy_must_use_only_current_hand_card_ids/,
  );
});

test("policy receives snapshots, so attempted top-level mutation cannot alter current hand", () => {
  const hand = makeHand();
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({
      hand,
      fixedSlots: FIXED_SLOTS,
      assignmentPolicy(input) {
        input.hand[0].suit = "PAPER";
        return ["card-a", "card-b", "card-c"];
      },
    }),
    TypeError,
  );
  assert.equal(hand[0].suit, "club");
});
