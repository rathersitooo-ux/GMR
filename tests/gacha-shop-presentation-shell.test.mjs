import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_SHOP_PRESENTATION_SHELL_SCHEMA,
  createGachaShopPresentationShell,
} from '../browser/gacha-shop-presentation-shell.mjs';

const shopConfig = Object.freeze({holdMs: 420, moveCancelDistance: 18, rightSwipeDistance: 72});

const resultBundle = () => [
  {slot:1, kind:'card', cardId:'CARD_A', rarity:'common'},
  {slot:2, kind:'card', cardId:'CARD_B', rarity:'rare'},
];

function gachaEvent(eventId, sequence, type, extra = {}) {
  return {
    presentationId:'presentation:branch7:1',
    resultIdentity:'server-result:branch7:1',
    eventId,
    sequence,
    type,
    ...extra,
  };
}

function gacha(overrides = {}) {
  return {
    presentationId:'presentation:branch7:1',
    resultIdentity:'server-result:branch7:1',
    resultBundle:resultBundle(),
    assets:{character:'formal', video:'formal'},
    events:[
      gachaEvent('gacha:event:1', 1, 'START'),
      gachaEvent('gacha:event:2', 2, 'REVEAL_NEXT'),
    ],
    ...overrides,
  };
}

function commerceEvent(overrides = {}) {
  return {
    eventId:'commerce:event:branch7:1',
    requestId:'shop:req:branch7:1',
    gameProductKey:'GMR.BRANCH7.TEST.001',
    verificationState:'VERIFIED_BY_SERVER_AUTHORITY',
    verificationEvidenceId:'verify:evidence:branch7:1',
    state:'PAID_OR_FINALIZED',
    ...overrides,
  };
}

function verifiedShop(eventOverrides = {}, inputOverrides = {}) {
  return {
    mode:'VERIFIED_COMMERCE_EVENT',
    input:{
      config:shopConfig,
      currentRequestId:'shop:req:branch7:1',
      expectedGameProductKey:'GMR.BRANCH7.TEST.001',
      event:commerceEvent(eventOverrides),
      ...inputOverrides,
    },
  };
}

test('GACHA_IDLE is presentation-only and exposes no result identity or result item', () => {
  const out = createGachaShopPresentationShell({
    screen:'GACHA_IDLE',
    idle:{assets:{character:'formal', video:'formal'}},
  });

  assert.equal(out.schema, GACHA_SHOP_PRESENTATION_SHELL_SCHEMA);
  assert.equal(out.screen, 'GACHA_IDLE');
  assert.equal(out.presentation.stage, 'idle');
  assert.equal(out.presentation.resultIdentity, null);
  assert.equal(out.presentation.currentResult, null);
  assert.deepEqual(out.presentation.revealedResults, []);
  assert.equal(out.presentation.resultCount, 0);
  assert.equal(out.authority.resultAuthority, false);
  assert.equal(out.authority.transactionAuthority, false);
  assert.equal(out.authority.ownershipMutationAllowed, false);
  assert.equal(out.authority.saveMutationAllowed, false);
});

test('GACHA_RESULT fails closed without caller-supplied authoritative identity and ordered bundle', () => {
  assert.throws(
    () => createGachaShopPresentationShell({screen:'GACHA_RESULT', gacha:{resultBundle:resultBundle(), events:[]}}),
    /gacha.presentationId/,
  );
  assert.throws(
    () => createGachaShopPresentationShell({screen:'GACHA_RESULT', gacha:gacha({resultIdentity:''})}),
    /gacha.resultIdentity/,
  );
  assert.throws(
    () => createGachaShopPresentationShell({screen:'GACHA_RESULT', gacha:gacha({resultBundle:[]})}),
    /non-empty ordered array/,
  );
});

test('GACHA_RESULT delegates reveal order and identity to the existing gacha core', () => {
  const out = createGachaShopPresentationShell({screen:'GACHA_RESULT', gacha:gacha()});

  assert.equal(out.presentation.resultIdentity, 'server-result:branch7:1');
  assert.equal(out.presentation.presentationId, 'presentation:branch7:1');
  assert.equal(out.presentation.stage, 'reveal');
  assert.equal(out.presentation.currentResult.cardId, 'CARD_A');
  assert.deepEqual(out.presentation.revealedResults, [resultBundle()[0]]);
  assert.equal(out.authority.resultAuthority, false);
});

test('GACHA_SKIP requires a caller-supplied SKIP event and preserves the exact authoritative bundle order', () => {
  const bundle = resultBundle();
  const out = createGachaShopPresentationShell({
    screen:'GACHA_SKIP',
    gacha:gacha({
      resultBundle:bundle,
      events:[
        gachaEvent('gacha:skip:event:1', 1, 'START'),
        gachaEvent('gacha:skip:event:2', 2, 'SKIP'),
      ],
    }),
  });

  assert.equal(out.presentation.stage, 'completed');
  assert.deepEqual(out.presentation.revealedResults, bundle);
  assert.equal(out.presentation.resultIdentity, 'server-result:branch7:1');

  assert.throws(
    () => createGachaShopPresentationShell({screen:'GACHA_SKIP', gacha:gacha()}),
    /requires a caller-supplied SKIP event/,
  );
});

test('reduced-motion and low-performance only change presentation fallbacks', () => {
  const reduced = createGachaShopPresentationShell({
    screen:'GACHA_RESULT',
    gacha:gacha({reducedMotion:true}),
  });
  assert.deepEqual(reduced.presentation.effects, {motion:'still', video:'disabled'});
  assert.equal(reduced.presentation.currentResult.cardId, 'CARD_A');

  const low = createGachaShopPresentationShell({
    screen:'GACHA_RESULT',
    gacha:gacha({lowPerf:true}),
  });
  assert.deepEqual(low.presentation.effects, {motion:'short_fade', video:'disabled'});
  assert.equal(low.presentation.currentResult.cardId, 'CARD_A');
});

test('SHOP pending phase delegates request identity and never invents transaction success', () => {
  const out = createGachaShopPresentationShell({
    screen:'SHOP',
    shop:{
      mode:'PRESENTATION_PHASE',
      input:{
        config:shopConfig,
        phase:'PENDING_OR_UNKNOWN',
        requestId:'shop:req:branch7:pending',
        currentRequestId:'shop:req:branch7:pending',
      },
    },
  });

  assert.equal(out.presentation.phase, 'PENDING_OR_UNKNOWN');
  assert.equal(out.presentation.requestId, 'shop:req:branch7:pending');
  assert.equal(out.presentation.feedback.feedback, 'pending');
  assert.equal(out.authority.transactionAuthority, false);
  assert.equal(out.authority.grantAuthority, false);
});

test('SHOP verified GRANTED/FAILED project confirmed/rejected UI only after existing authority checks', () => {
  const granted = createGachaShopPresentationShell({
    screen:'SHOP',
    shop:verifiedShop({
      state:'GRANTED',
      entitlementEvidenceId:'entitlement:evidence:branch7:1',
      durableSaveEvidenceId:'save:evidence:branch7:1',
    }),
  });
  assert.equal(granted.presentation.commerceState, 'GRANTED');
  assert.equal(granted.presentation.presentation.phase, 'SUCCESS');
  assert.equal(granted.presentation.presentation.feedback.feedback, 'confirmed');
  assert.equal(granted.presentation.grantAuthority, false);
  assert.equal(granted.presentation.ownershipMutationAllowed, false);
  assert.equal(granted.presentation.saveMutationAllowed, false);

  const failed = createGachaShopPresentationShell({
    screen:'SHOP',
    shop:verifiedShop({state:'FAILED'}),
  });
  assert.equal(failed.presentation.commerceState, 'FAILED');
  assert.equal(failed.presentation.presentation.phase, 'FAILURE');
  assert.equal(failed.presentation.presentation.feedback.feedback, 'failed');
});

test('SHOP duplicate verified event identity fails closed in the existing commerce boundary', () => {
  assert.throws(
    () => createGachaShopPresentationShell({
      screen:'SHOP',
      shop:verifiedShop({}, {processedEventIds:['commerce:event:branch7:1']}),
    }),
    /duplicate commerce event identity/,
  );
});

test('malformed screens, events, and Shop modes fail closed', () => {
  assert.throws(() => createGachaShopPresentationShell(null), /plain object/);
  assert.throws(() => createGachaShopPresentationShell({screen:'UNKNOWN'}), /unsupported Branch7 presentation screen/);
  assert.throws(
    () => createGachaShopPresentationShell({screen:'GACHA_RESULT', gacha:gacha({events:[null]})}),
    /gacha event must be a plain object/,
  );
  assert.throws(
    () => createGachaShopPresentationShell({screen:'SHOP', shop:{mode:'PURCHASE', input:{}}}),
    /unsupported Shop shell mode/,
  );
});

test('same input is deterministic and shell does not synthesize economy or ownership truth', () => {
  const input = {
    screen:'SHOP',
    shop:verifiedShop({state:'PAID_OR_FINALIZED'}),
  };
  const first = createGachaShopPresentationShell(input);
  const second = createGachaShopPresentationShell(input);
  assert.deepEqual(first, second);

  for (const forbidden of ['price', 'currency', 'productId', 'ownership', 'reward']) {
    assert.equal(Object.hasOwn(first.presentation, forbidden), false);
  }
  assert.equal(first.presentation.grantAuthority, false);
  assert.equal(first.presentation.ownershipMutationAllowed, false);
  assert.equal(first.presentation.saveMutationAllowed, false);
});
