import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildNakiBattleTimeline,
  NAKI_BATTLE_PHASE_ORDER,
  phaseForPresentationStage
} from '../battle-naki-idol-sprite-runtime.mjs';
import {
  NAKI_IDOL_HEART_VFX,
  NAKI_IDOL_POST_IMPACT_VFX,
  NAKI_IDOL_ADVICE_ASSETS,
  resolveNakiVfx
} from '../naki-idol-battle-assets.mjs';
import { resolveNakiAdviceExpression } from '../partner-naki-advice-visuals.mjs';

test('Naki has an independent FE-style six-phase timeline', () => {
  const timeline = buildNakiBattleTimeline({ role: 'attacker', seed: 12 });
  assert.deepEqual(timeline.map((item) => item.phase), NAKI_BATTLE_PHASE_ORDER);
  assert.equal(timeline.find((item) => item.phase === 'impact').hitstop, true);
  assert.ok(timeline.find((item) => item.phase === 'stance').duration > 0);
  assert.ok(timeline.find((item) => item.phase === 'anticipation').duration > 0);
  assert.ok(timeline.find((item) => item.phase === 'release').duration > 0);
  assert.ok(timeline.find((item) => item.phase === 'reaction').duration > 0);
  assert.ok(timeline.find((item) => item.phase === 'return').duration > 0);
});

test('the defender gets a real hit reaction instead of whole-figure recoil CSS', () => {
  const timeline = buildNakiBattleTimeline({ role: 'defender', seed: 2 });
  const impact = timeline.find((item) => item.phase === 'impact');
  const reaction = timeline.find((item) => item.phase === 'reaction');
  assert.match(impact.frame.fileName, /05-hit-reaction/);
  assert.match(reaction.frame.fileName, /05-hit-reaction/);
});

test('release and impact use heart VFX first; crescent is post-impact only', () => {
  const release = resolveNakiVfx({ phase: 'release', seed: 1 });
  const impact = resolveNakiVfx({ phase: 'impact', seed: 1 });
  assert.ok(NAKI_IDOL_HEART_VFX.includes(release));
  assert.ok(NAKI_IDOL_HEART_VFX.includes(impact));
  assert.equal(release.postImpactOnly, false);
  assert.equal(impact.postImpactOnly, false);
  assert.equal(resolveNakiVfx({ phase: 'stance', seed: 1 }), null);
  for (const item of NAKI_IDOL_POST_IMPACT_VFX) assert.equal(item.postImpactOnly, true);
});

test('presentation stages map to the animation without changing gameplay authority', () => {
  assert.equal(phaseForPresentationStage('focus', 'attacker'), 'stance');
  assert.equal(phaseForPresentationStage('read', 'attacker'), 'anticipation');
  assert.equal(phaseForPresentationStage('compare', 'attacker'), 'release');
  assert.equal(phaseForPresentationStage('winner', 'defender'), 'reaction');
  assert.equal(phaseForPresentationStage('settle', 'attacker'), 'return');
});

test('Naki advice has nine transparent expression assets with stable routing', () => {
  assert.equal(Object.keys(NAKI_IDOL_ADVICE_ASSETS).length, 9);
  assert.equal(resolveNakiAdviceExpression({ reactionActive: true }), 'SURPRISED');
  assert.equal(resolveNakiAdviceExpression({ tutorialActive: true }), 'GUIDE_PRESENT');
  assert.equal(resolveNakiAdviceExpression({ quickRouteId: 'secret' }), 'SHH');
  assert.equal(resolveNakiAdviceExpression({ adviceActive: true, battleActive: true }), 'HAPPY_SMILE');
  assert.equal(resolveNakiAdviceExpression({}), 'IDLE_GENTLE');
});
