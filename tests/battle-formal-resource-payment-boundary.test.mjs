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

test('Road generic Mana cost is zero', () => {
  assert.equal(
    getFormalGenericManaCost({ kind: FORMAL_RESOURCE_PAYMENT_KIND.ROAD, cardNumber: 9 }),
    0,
  );

  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.ROAD,
    cardNumber: 9,
    mana: 4,
    honey: 6,
  });
  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED);
  assert.equal(receipt.cost, 0);
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.manaAfter, 4);
  assert.equal(receipt.honeyAfter, 6);
});

test('normal Battle card generic Mana cost equals its card number', () => {
  assert.equal(
    getFormalGenericManaCost({ kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE, cardNumber: 7 }),
    7,
  );
});

test('Mana alone pays first when it covers the Battle card cost', () => {
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

test('Honey forcibly pays exactly the Mana deficit when sufficient', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 4,
    honey: 8,
  });

  assert.equal(receipt.status, FORMAL_RESOURCE_PAYMENT_STATUS.RESOLVED);
  assert.equal(receipt.manaPaid, 4);
  assert.equal(receipt.honeyPaid, 3);
  assert.equal(receipt.manaAfter, 0);
  assert.equal(receipt.honeyAfter, 5);
  assert.equal(receipt.userChoiceRequired, false);
});

test('total resource shortage fails closed instead of inventing an outcome', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 2,
    honey: 1,
  });

  assert.equal(
    receipt.status,
    FORMAL_RESOURCE_PAYMENT_STATUS.AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL,
  );
  assert.equal(receipt.resolved, false);
  assert.equal(receipt.manaPaid, 2);
  assert.equal(receipt.honeyRequired, 5);
  assert.equal(receipt.userChoiceRequired, false);
  assert.equal('manaAfter' in receipt, false);
  assert.equal('honeyAfter' in receipt, false);
  assert.equal('honeyPaid' in receipt, false);
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
