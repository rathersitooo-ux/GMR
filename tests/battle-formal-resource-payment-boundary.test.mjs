import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMAL_MANA_MAX,
  FORMAL_RESOURCE_PAYMENT_KIND,
  FORMAL_RESOURCE_PAYMENT_POLICY,
  FORMAL_RESOURCE_PAYMENT_STATUS,
  getFormalGenericManaCost,
  projectFormalResourcePayment,
} from '../browser/battle-formal-resource-payment-boundary.mjs';

test('ordinary Road generic Mana cost is zero; Battle janken cards use the Battle cost', () => {
  assert.equal(
    getFormalGenericManaCost({ kind: FORMAL_RESOURCE_PAYMENT_KIND.ROAD, cardNumber: 9 }),
    0,
  );

  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.ROAD,
    cardNumber: 9,
    mana: 0,
    honey: 6,
  });
  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED);
  assert.equal(receipt.cost, 0);
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyAfter, 6);
});

test('normal Battle card generic Mana cost equals its card number', () => {
  assert.equal(
    getFormalGenericManaCost({ kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE, cardNumber: 7 }),
    7,
  );
});

test('sufficient Mana pays the full Battle card cost and Honey is untouched', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 9,
    honey: 5,
  });

  assert.deepEqual(receipt, {
    status: FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED,
    resolved: true,
    cost: 7,
    manaBefore: 9,
    honeyBefore: 5,
    manaPaid: 7,
    honeyPaid: 0,
    manaAfter: 2,
    honeyAfter: 5,
    paymentPolicy: FORMAL_RESOURCE_PAYMENT_POLICY,
    userChoiceRequired: false,
  });
});

test('Mana is spent first, then Honey automatically covers only the shortfall', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 4,
    honey: 99,
  });

  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED);
  assert.equal(receipt.resolved, true);
  assert.equal(receipt.manaPaid, 4);
  assert.equal(receipt.honeyPaid, 3);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyAfter, 96);
  assert.equal(receipt.userChoiceRequired, false);
  assert.equal(receipt.paymentPolicy, FORMAL_RESOURCE_PAYMENT_POLICY);
});

test('zero Mana uses Honey for a payable Battle card, without a choice prompt', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 1,
    mana: 0,
    honey: 100,
  });

  assert.equal(receipt.resolved, true);
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 1);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyAfter, 99);
  assert.equal(receipt.userChoiceRequired, false);
});

test('exact Mana succeeds without Honey', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 4,
    mana: 4,
    honey: 0,
  });

  assert.equal(receipt.resolved, true);
  assert.equal(receipt.manaPaid, 4);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.honeyAfter, 0);
});

test('invalid resource or card inputs fail closed', () => {
  assert.throws(
    () => projectFormalResourcePayment({
      kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
      cardNumber: -1,
      mana: 1,
      honey: 1,
    }),
    TypeError,
  );
  assert.throws(
    () => projectFormalResourcePayment({
      kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
      cardNumber: 1,
      mana: FORMAL_MANA_MAX + 1,
      honey: 1,
    }),
    RangeError,
  );
  assert.throws(
    () => getFormalGenericManaCost({ kind: 'UNKNOWN', cardNumber: 1 }),
    TypeError,
  );
});


test('insufficient combined Mana and Honey is rejected without partial debit', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 2,
    honey: 3,
  });
  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.INSUFFICIENT_TOTAL);
  assert.equal(receipt.reason, 'INSUFFICIENT_COMBINED_RESOURCES');
  assert.equal(receipt.resolved, false);
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.manaDeficit, 5);
  assert.equal(receipt.totalDeficit, 2);
  assert.equal('manaAfter' in receipt, false);
  assert.equal('honeyAfter' in receipt, false);
  assert.equal(receipt.userChoiceRequired, false);
});

test('exact combined total pays Mana before Honey; input is not mutated', () => {
  const input = { kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE, cardNumber: 5, mana: 3, honey: 2 };
  const receipt = projectFormalResourcePayment(input);
  assert.equal(receipt.resolved, true);
  assert.deepEqual([receipt.manaPaid, receipt.honeyPaid], [3, 2]);
  assert.deepEqual([receipt.manaAfter, receipt.honeyAfter], [0, 0]);
  assert.deepEqual([input.mana, input.honey], [3, 2]);
  assert.equal(Object.isFrozen(receipt), true);
});