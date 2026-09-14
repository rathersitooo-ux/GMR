import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createPartnerAdviceBustupMotionController } from '../browser/partner-advice-bustup-motion-core.mjs';
import {
  SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE,
  saasunaAdviceMotionStateForTrigger,
} from '../browser/partner-saasuna-advice-bustup-motion-profile.mjs';

test('サースナーのmotion personalityを躁鬱として保持する', () => {
  const profile = SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE;
  assert.equal(profile.partnerId, 'partner.saasuna');
  assert.equal(profile.motionPersonality, '躁鬱');
  assert.equal(profile.humanDirection, 'おとなしくと大きく活発の躁鬱');
  assert.equal(profile.adviceTone, '落ち着いて');
  assert.equal(profile.expressionUse, '顔と手の両方を最大限');
  assert.equal(profile.states.IDLE_GENTLE.side, '鬱');
  assert.equal(profile.states.GUIDE_PRESENT.side, '鬱');
  assert.equal(profile.states.SURPRISED.side, '躁');
  assert.equal(profile.states.CURIOUS_CONFUSED.side, '鬱→躁→鬱');
  assert.equal(profile.states.TOUCH_CRY.side, '躁→鬱');
});

test('登録済み9キーポーズを9つのmotion stateへ一意に接続する', () => {
  const states = SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE.states;
  assert.deepEqual(Object.keys(states).sort(), [
    'CURIOUS_CONFUSED',
    'GUIDE_PRESENT',
    'HAPPY_SMILE',
    'HAPPY_WAVE',
    'IDLE_GENTLE',
    'SAD_DOWNCAST',
    'SHH',
    'SURPRISED',
    'TOUCH_CRY',
  ]);
  const assets = Object.values(states).map((state) => state.assetPath);
  assert.equal(new Set(assets).size, 9);
  assert.ok(assets.every((asset) => asset.startsWith('../assets/visual/partner/saasuna/')));
  assert.equal(saasunaAdviceMotionStateForTrigger('battle_card_submit'), 'SURPRISED');
});

test('9つのruntime assetが実体として存在しWebPである', () => {
  const states = SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE.states;
  const profileModuleUrl = new URL('../browser/partner-saasuna-advice-bustup-motion-profile.mjs', import.meta.url);
  for (const [stateId, state] of Object.entries(states)) {
    const runtimeFile = fileURLToPath(new URL(state.assetPath, profileModuleUrl));
    const payload = readFileSync(runtimeFile);
    assert.ok(payload.length > 1024, `${stateId}: runtime asset is unexpectedly small`);
    assert.equal(payload.subarray(0, 4).toString('ascii'), 'RIFF', `${stateId}: RIFF header missing`);
    assert.equal(payload.subarray(8, 12).toString('ascii'), 'WEBP', `${stateId}: WEBP header missing`);
  }
});

test('GUIDE中の躁reactionは1件保留し、意味塊終了後に躁へ切り替えて鬱へ戻る', () => {
  let nowMs = 1000;
  const controller = createPartnerAdviceBustupMotionController({
    profile: SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE,
    now: () => nowMs,
  });

  assert.equal(controller.status().stateId, 'IDLE_GENTLE');
  assert.equal(controller.status().side, '鬱');

  assert.equal(controller.setGuideActive(true), true);
  assert.equal(controller.status().stateId, 'GUIDE_PRESENT');
  assert.equal(controller.status().side, '鬱');

  assert.equal(controller.trigger('SURPRISED', { eventId: 'battle:event:1' }), true);
  const queued = controller.status();
  assert.equal(queued.stateId, 'GUIDE_PRESENT');
  assert.equal(queued.queuedStateId, 'SURPRISED');
  assert.equal(queued.reactionActive, false);

  assert.equal(controller.setGuideActive(false), true);
  const sou = controller.status();
  assert.equal(sou.stateId, 'SURPRISED');
  assert.equal(sou.side, '躁');
  assert.equal(sou.reactionActive, true);

  nowMs += 1001;
  const utsu = controller.tick();
  assert.equal(utsu.stateId, 'IDLE_GENTLE');
  assert.equal(utsu.side, '鬱');
  assert.equal(utsu.reactionActive, false);
});

test('同じeventを二重発火せず、強いreactionが弱いreactionを上書きする', () => {
  let nowMs = 0;
  const controller = createPartnerAdviceBustupMotionController({
    profile: SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE,
    now: () => nowMs,
  });

  assert.equal(controller.trigger('HAPPY_SMILE', { eventId: 'event:a' }), true);
  assert.equal(controller.status().stateId, 'HAPPY_SMILE');
  assert.equal(controller.trigger('HAPPY_SMILE', { eventId: 'event:a' }), false);

  assert.equal(controller.trigger('SURPRISED', { eventId: 'event:b' }), true);
  assert.equal(controller.status().stateId, 'SURPRISED');
  assert.equal(controller.status().side, '躁');

  assert.equal(controller.trigger('SAD_DOWNCAST', { eventId: 'event:c' }), true);
  assert.equal(controller.status().stateId, 'SURPRISED');
  assert.equal(controller.status().queuedStateId, 'SAD_DOWNCAST');

  nowMs += 1001;
  const queued = controller.tick();
  assert.equal(queued.stateId, 'SAD_DOWNCAST');
  assert.equal(queued.side, '鬱');
});
