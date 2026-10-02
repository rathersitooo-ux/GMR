import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LIVE_HTML = readFileSync(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

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

test('Honey cannot substitute for missing Mana', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 7,
    mana: 4,
    honey: 99,
  });

  assert.equal(
    receipt.status,
    FORMAL_RESOURCE_PAYMENT_STATUS.AUTHORITY_UNRESOLVED_INSUFFICIENT_TOTAL,
  );
  assert.equal(receipt.resolved, false);
  assert.equal(receipt.reason, 'INSUFFICIENT_MANA');
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
  assert.equal(receipt.manaDeficit, 3);
  assert.equal('manaAfter' in receipt, false);
  assert.equal('honeyAfter' in receipt, false);
});

test('zero Mana cannot play a non-janken Battle card even with Honey available', () => {
  const receipt = projectFormalResourcePayment({
    kind: FORMAL_RESOURCE_PAYMENT_KIND.BATTLE,
    cardNumber: 1,
    mana: 0,
    honey: 100,
  });

  assert.equal(receipt.resolved, false);
  assert.equal(receipt.reason, 'INSUFFICIENT_MANA');
  assert.equal(receipt.manaPaid, 0);
  assert.equal(receipt.honeyPaid, 0);
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


test('live active Battle submission projects formal Mana payment before removing the card', () => {
  const helperStart = LIVE_HTML.indexOf('async function projectLiveBattleCardPayment');
  const resolveStart = LIVE_HTML.indexOf('async function resolveBattle()');
  const payment = LIVE_HTML.indexOf('const payment=await projectLiveBattleCardPayment(p,battle);', resolveStart);
  const remove = LIVE_HTML.indexOf("removeHand(p,battle);", payment);
  const commit = LIVE_HTML.indexOf('commitLiveBattleCardPayment(p,payment);', remove);
  const reveal = LIVE_HTML.indexOf("makeParticipant(p,battle,'active_submission')", commit);

  assert.ok(helperStart > 0, 'live payment helper must exist');
  assert.match(LIVE_HTML, /import\('\.\/battle-formal-resource-payment-boundary\.mjs'\)/);
  assert.ok(resolveStart > 0 && payment > resolveStart, 'resolveBattle must invoke formal payment');
  assert.ok(remove > payment, 'insufficient Mana must be decided before hand removal');
  assert.ok(commit > remove, 'Mana must be deducted only after hand removal succeeds');
  assert.ok(reveal > commit, 'participant registration must happen after payment commit');
  assert.match(LIVE_HTML.slice(payment, remove), /if\(!payment\?\.resolved\).*continue/s);
  assert.doesNotMatch(LIVE_HTML.slice(payment, reveal), /honey\s*[-+]=|honey\s*=/);
});
