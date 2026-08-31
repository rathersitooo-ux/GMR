import test from "node:test";
import assert from "node:assert/strict";
import { autoAssignHand3ToFixedJankenSlots } from "../browser/newbase-janken-hand-assignment-core.mjs";

const FIXED_SLOT_STATE = Object.freeze({
  ROCK: Object.freeze({ slotId: "ROCK", jankenHand: "ROCK" }),
  SCISSORS: Object.freeze({ slotId: "SCISSORS", jankenHand: "SCISSORS" }),
  PAPER: Object.freeze({ slotId: "PAPER", jankenHand: "PAPER" }),
});

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

test("automatically assigns one policy result to shared fixed ROCK SCISSORS PAPER state", () => {
  const hand = makeHand();
  let calls = 0;
  const assigned = autoAssignHand3ToFixedJankenSlots({
    hand,
    fixedSlotState: FIXED_SLOT_STATE,
    assignmentPolicy(input) {
      calls += 1;
      assert.equal(Object.isFrozen(input), true);
      assert.equal(Object.isFrozen(input.handCardIds), true);
      assert.equal(Object.isFrozen(input.fixedSlots), true);
      assert.deepEqual(input.handCardIds, ["card-a", "card-b", "card-c"]);
      assert.deepEqual(input.fixedSlots, [
        { slotId: "ROCK", jankenHand: "ROCK" },
        { slotId: "SCISSORS", jankenHand: "SCISSORS" },
        { slotId: "PAPER", jankenHand: "PAPER" },
      ]);
      return ["card-c", "card-a", "card-b"];
    },
  });

  assert.equal(calls, 1);
  assert.deepEqual(assigned, [
    { slotId: "ROCK", jankenHand: "ROCK", cardId: "card-c" },
    { slotId: "SCISSORS", jankenHand: "SCISSORS", cardId: "card-a" },
    { slotId: "PAPER", jankenHand: "PAPER", cardId: "card-b" },
  ]);
  assert.equal(Object.isFrozen(assigned), true);
  assert.equal(assigned.every(Object.isFrozen), true);
});

test("keeps native card suit outside both assignment policy input and assigned janken state", () => {
  const hand = makeHand();
  const before = structuredClone(hand);
  let policyInput;
  const assigned = autoAssignHand3ToFixedJankenSlots({
    hand,
    fixedSlotState: FIXED_SLOT_STATE,
    assignmentPolicy(input) {
      policyInput = input;
      return ["card-b", "card-c", "card-a"];
    },
  });

  assert.deepEqual(hand, before);
  assert.equal(Object.hasOwn(policyInput, "hand"), false);
  assert.deepEqual(policyInput.handCardIds, ["card-a", "card-b", "card-c"]);
  assert.equal(hand[1].suit, "diamond");
  assert.equal(assigned[0].jankenHand, "ROCK");
  assert.equal(assigned[0].cardId, "card-b");
  assert.equal(Object.hasOwn(assigned[0], "suit"), false);
});

test("does not invent a default assignment policy", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlotState: FIXED_SLOT_STATE }),
    /assignmentPolicy_required/,
  );
});

test("accepts every exact permutation supplied by policy without imposing a mapping", () => {
  for (const permutation of permutations(["card-a", "card-b", "card-c"])) {
    const assigned = autoAssignHand3ToFixedJankenSlots({
      hand: makeHand(),
      fixedSlotState: FIXED_SLOT_STATE,
      assignmentPolicy: () => permutation,
    });
    assert.deepEqual(assigned.map((entry) => entry.cardId), permutation);
  }
});

test("fails closed unless current hand is exactly three uniquely identified cards", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand().slice(0, 2), fixedSlotState: FIXED_SLOT_STATE, assignmentPolicy: () => [] }),
    /hand_must_contain_exactly_3_cards/,
  );
  const duplicate = makeHand();
  duplicate[2].id = "card-a";
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: duplicate, fixedSlotState: FIXED_SLOT_STATE, assignmentPolicy: () => ["card-a", "card-b", "card-a"] }),
    /hand_card_ids_must_be_unique/,
  );
});

test("fails closed when shared fixed state changes a janken identity", () => {
  const badState = {
    ...FIXED_SLOT_STATE,
    PAPER: { slotId: "PAPER", jankenHand: "ROCK" },
  };
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlotState: badState, assignmentPolicy: () => ["card-a", "card-b", "card-c"] }),
    /fixed_slot_PAPER_must_keep_its_janken_identity/,
  );
});

test("fails closed on duplicate or unknown card ids returned by policy", () => {
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlotState: FIXED_SLOT_STATE, assignmentPolicy: () => ["card-a", "card-a", "card-c"] }),
    /assignment_policy_card_ids_must_be_unique/,
  );
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({ hand: makeHand(), fixedSlotState: FIXED_SLOT_STATE, assignmentPolicy: () => ["card-a", "card-b", "card-x"] }),
    /assignment_policy_must_use_only_current_hand_card_ids/,
  );
});

test("policy input is immutable and cannot reorder current hand identities in place", () => {
  const hand = makeHand();
  assert.throws(
    () => autoAssignHand3ToFixedJankenSlots({
      hand,
      fixedSlotState: FIXED_SLOT_STATE,
      assignmentPolicy(input) {
        input.handCardIds[0] = "card-c";
        return ["card-a", "card-b", "card-c"];
      },
    }),
    TypeError,
  );
  assert.deepEqual(hand.map((card) => card.id), ["card-a", "card-b", "card-c"]);
});
