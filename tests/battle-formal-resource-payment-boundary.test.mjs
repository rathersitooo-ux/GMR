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

test('initial janken/Road generic Mana cost is zero', () => {
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

test('Mana is spent first, then the precise Honey shortfall is paid without an opt-in', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7, mana: 4, honey: 99,
  });
  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED);
  assert.equal(receipt.resolved, true);
  assert.equal(receipt.manaPaid, 4);
  assert.equal(receipt.honeyPaid, 3);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyAfter, 96);
  assert.equal(receipt.userChoiceRequired, false);
});

test('zero Mana permits a Battle card if Honey fully covers its cost', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 1, mana: 0, honey: 100,
  });
  assert.equal(receipt.resolved, true);
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 1);
  assert.equal(receipt.honeyAfter, 99);
});

test('insufficient combined resources reject without spending either resource', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7, mana: 4, honey: 2,
  });
  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL);
  assert.equal(receipt.resolved, false);
  assert.equal(receipt.reason, 'INSUFFICIENT_TOTAL_RESOURCES');
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.manaDeficit, 3);
  assert.equal(receipt.honeyDeficit, 1);
  assert.equal('manaAfter' in receipt, false);
  assert.equal('honeyAfter' in receipt, false);
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

test('formal resource payments conserve Mana and Honey over a range of states', () => {
  for (let cost = 0; cost <= 12; cost += 1) {
    for (let mana = 0; mana <= FORMAL_MANA_MAX; mana += 1) {
      for (let honey = 0; honey <= 12; honey += 1) {
        const receipt = projectFormalResourcePayment({
          kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
          cardNumber: cost, mana, honey,
        });
        if (!receipt.resolved) {
          assert.ok(mana + honey < cost);
          assert.equal(receipt.manaPaid, 0);
          assert.equal(receipt.honeyPaid, 0);
        } else {
          assert.equal(receipt.manaPaid, Math.min(mana, cost));
          assert.equal(receipt.manaPaid + receipt.honeyPaid, cost);
          assert.equal(receipt.manaAfter, mana - receipt.manaPaid);
          assert.equal(receipt.honeyAfter, honey - receipt.honeyPaid);
          assert.equal(receipt.userChoiceRequired, false);
        }
      }
    }
  }
});
