import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_BRANCH_HOPE_BRANCHES,
  GACHA_BRANCH_HOPE_GREYBOX_SCHEMA,
  GACHA_BRANCH_HOPE_UPGRADE_SIGNALS,
  createGachaBranchHopePlan,
} from '../browser/gacha-branch-hope-greybox.mjs';

const create = overrides => createGachaBranchHopePlan({
  resultIdentity: 'server-confirmed-result-001',
  branch: 'quiet_standard',
  ...overrides,
});

test('all three proposal branches bind to authoritative result identity without accepting result payloads', () => {
  const plans = [
    create(),
    create({ branch: 'late_upgrade', upgradeSignal: 'low_to_high' }),
    create({ branch: 'early_premium', premiumSignals: ['highest_tier'] }),
  ];

  assert.deepEqual(GACHA_BRANCH_HOPE_BRANCHES, ['quiet_standard', 'late_upgrade', 'early_premium']);
  for (const plan of plans) {
    assert.equal(plan.schema, GACHA_BRANCH_HOPE_GREYBOX_SCHEMA);
    assert.equal(plan.proposalOnly, true);
    assert.equal(plan.resultBinding.resultIdentity, 'server-confirmed-result-001');
    assert.equal(plan.resultBinding.authoritativeResultAlreadyConfirmed, true);
    assert.equal(plan.resultBinding.resultItemPayloadAccepted, false);
    assert.equal('resultBundle' in plan, false);
    assert.equal(plan.invariants.resultTruthMutable, false);
    assert.equal(plan.invariants.resultOrderMutable, false);
    assert.equal(plan.invariants.rngMutable, false);
    assert.equal(plan.invariants.saveMutable, false);
    assert.equal(plan.invariants.ownershipMutable, false);
  }
});

test('quiet standard keeps early weak cues uncertain instead of declaring a loss', () => {
  const plan = create();
  assert.equal(plan.branch, 'quiet_standard');
  assert.equal(plan.anticipationCues.length, 2);
  assert.equal(plan.anticipationCues[1].semantic, 'anticipation_only_no_guarantee');
  assert.equal(plan.anticipationCues[1].guaranteesResultTier, false);
  assert.equal(plan.invariants.earlyWeakCueMeansLoss, false);
  assert.match(plan.semanticsFingerprint, /"lossCertainBeforeReveal":false/);
});

test('late upgrade fails closed without an authoritative upgrade signal', () => {
  assert.throws(() => create({ branch: 'late_upgrade' }), /requires one authoritative upgradeSignal/);
  assert.throws(
    () => create({ branch: 'late_upgrade', upgradeSignal: 'mystery_upgrade' }),
    /authoritative supported upgrade signal/,
  );
});

test('all three late-upgrade mappings are single and monotonic', () => {
  const expected = {
    low_to_mid: ['low', 'mid'],
    mid_to_high: ['mid', 'high'],
    low_to_high: ['low', 'high'],
  };

  for (const signal of GACHA_BRANCH_HOPE_UPGRADE_SIGNALS) {
    const plan = create({ branch: 'late_upgrade', upgradeSignal: signal });
    assert.equal(plan.upgrade.eventCount, 1, signal);
    assert.equal(plan.upgrade.event.signal, signal, signal);
    assert.deepEqual([plan.upgrade.event.from, plan.upgrade.event.to], expected[signal], signal);
    assert.equal(plan.upgrade.monotonic, true, signal);
    assert.equal(plan.invariants.upgradeEventsMax, 1, signal);
    assert.equal(plan.invariants.upgradeMonotonic, true, signal);
  }
});

test('early premium requires explicit supported upstream semantics and never invents one', () => {
  assert.throws(() => create({ branch: 'early_premium' }), /requires at least one authoritative premium signal/);
  assert.throws(
    () => create({ branch: 'early_premium', premiumSignals: ['looks_lucky'] }),
    /unsupported or invented signal/,
  );

  const plan = create({
    branch: 'early_premium',
    premiumSignals: ['highest_tier', 'guaranteed'],
  });
  assert.deepEqual(plan.premium.signals, ['highest_tier', 'guaranteed']);
  assert.equal(plan.premium.source, 'authoritative_upstream_only');
  assert.equal(plan.premium.inventedSignalsAllowed, false);
  assert.equal(plan.invariants.inventedSignalsAllowed, false);
});

test('branch cues stay within two to three meaningful pre-reveal signals with fixed sources', () => {
  const plans = [
    create(),
    create({ branch: 'late_upgrade', upgradeSignal: 'mid_to_high' }),
    create({ branch: 'early_premium', premiumSignals: ['multiple_highest'] }),
  ];

  for (const plan of plans) {
    assert.ok(plan.anticipationCues.length >= 2 && plan.anticipationCues.length <= 3, plan.branch);
    assert.equal(plan.anticipationCues[0].source, 'user_input', plan.branch);
    assert.deepEqual(plan.stageSequence, ['touch', 'anticipation', 'hush', 'reveal', 'settle'], plan.branch);
    assert.equal(plan.hush.semantic, 'contrast_before_reveal', plan.branch);
    assert.equal(plan.reveal.hero, 'acquired_card', plan.branch);
    assert.equal(plan.settle.priority, 'read_authoritative_result', plan.branch);
  }
});

test('accessibility fallbacks change rendering cost, never branch meaning', () => {
  const normal = create();
  const reduced = create({ accessibility: { reducedMotion: true } });
  const low = create({ accessibility: { lowPerf: true } });
  const muted = create({ accessibility: { soundOff: true } });

  assert.equal(reduced.accessibility.motionMode, 'still_or_fade');
  assert.equal(low.accessibility.motionMode, 'lightweight_motion');
  assert.equal(muted.accessibility.soundMode, 'off');

  for (const plan of [normal, reduced, low, muted]) {
    assert.equal(plan.accessibility.semanticMeaningPreserved, true);
    assert.equal(plan.accessibility.audioOnlySemanticsAllowed, false);
    assert.equal(plan.accessibility.motionOnlySemanticsAllowed, false);
    assert.equal(plan.semanticsFingerprint, normal.semanticsFingerprint);
  }
});

test('multi-pull compresses shell ritual and keeps one-action summary path', () => {
  const plan = create({ pullCount: 10 });
  assert.equal(plan.multi.pullCount, 10);
  assert.equal(plan.multi.commonRitualRepetitions, 1);
  assert.equal(plan.multi.shellOpeningRepeatedPerResult, false);
  assert.equal(plan.multi.revealMode, 'compressed_with_optional_post_reveal_highlights');
  assert.equal(plan.multi.highlightSource, 'explicit_upstream_after_reveal_only');
  assert.equal(plan.multi.summaryFastPath, 'one_action');
});

test('visual variant may change composition key but cannot change semantics', () => {
  const a = create({ variantKey: 'forest_gate_a' });
  const b = create({ variantKey: 'forest_gate_b' });
  assert.notEqual(a.variantKey, b.variantKey);
  assert.equal(a.semanticsFingerprint, b.semanticsFingerprint);
});

test('result payloads and precomputed highlight positions are rejected from greybox input', () => {
  for (const [key, value] of [
    ['resultBundle', [{ cardId: 'CARD_001' }]],
    ['results', [{ rarity: 'highest' }]],
    ['items', ['CARD_001']],
    ['cardId', 'CARD_001'],
    ['itemIdentity', 'CARD_001'],
    ['highlightSlots', [3, 7]],
  ]) {
    assert.throws(() => create({ [key]: value }), new RegExp(`${key} is forbidden`), key);
  }
});

test('mutually exclusive branch signals fail closed instead of creating ambiguous hype', () => {
  assert.throws(
    () => create({ upgradeSignal: 'low_to_mid' }),
    /quiet_standard cannot carry upgrade or premium/,
  );
  assert.throws(
    () => create({ branch: 'late_upgrade', upgradeSignal: 'low_to_high', premiumSignals: ['highest_tier'] }),
    /cannot also carry early premium/,
  );
  assert.throws(
    () => create({ branch: 'early_premium', upgradeSignal: 'low_to_high', premiumSignals: ['highest_tier'] }),
    /cannot also carry a late upgrade/,
  );
});
