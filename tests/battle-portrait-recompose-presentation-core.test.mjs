import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_PORTRAIT_RECOMPOSE_CONTRACT,
  BATTLE_PORTRAIT_REGION,
  isBattlePortraitRecomposePlan,
  projectBattlePortraitRecompose,
} from '../browser/battle-portrait-recompose-presentation-core.mjs';

test('390x844 recomposes into compact top rails, dominant world, and bottom interaction dock', () => {
  const plan = projectBattlePortraitRecompose({ viewportWidth: 390, viewportHeight: 844 });

  assert.equal(plan.applicable, true);
  assert.equal(plan.exactTarget, true);
  assert.equal(plan.profile, 'PHONE_PORTRAIT_390x844');
  assert.equal(plan.regions.topHud.topPx, 0);
  assert.equal(plan.regions.topHud.bottomPx, 56);
  assert.equal(plan.regions.publicStatus.topPx, 56);
  assert.equal(plan.regions.publicStatus.bottomPx, 108);
  assert.equal(plan.regions.worldViewport.topPx, 108);
  assert.equal(plan.regions.worldViewport.bottomPx, 596);
  assert.equal(plan.regions.worldViewport.heightPx, 488);
  assert.equal(plan.regions.currentAction.topPx, 540);
  assert.equal(plan.regions.currentAction.bottomPx, 596);
  assert.equal(plan.regions.interactionDock.topPx, 584);
  assert.equal(plan.regions.interactionDock.bottomPx, 844);
  assert.equal(plan.regions.interactionDock.heightPx, 260);
  assert.equal(plan.worldIsLargest, true);
  assert.equal(isBattlePortraitRecomposePlan(plan), true);
});

test('4P public state becomes one compact peripheral row instead of four tall center cards', () => {
  const plan = projectBattlePortraitRecompose();
  const publicStatus = plan.regions.publicStatus;

  assert.equal(publicStatus.name, BATTLE_PORTRAIT_REGION.PUBLIC_STATUS);
  assert.equal(publicStatus.placement, 'TOP_PERIPHERAL_RAIL');
  assert.equal(publicStatus.columns, 4);
  assert.equal(publicStatus.rows, 1);
  assert.equal(publicStatus.tileWidthPx, 90);
  assert.deepEqual(publicStatus.essentials, ['identity', 'team', 'currentActor', 'shieldLCR']);
  assert.deepEqual(publicStatus.contextual, ['role', 'publicAfterstate']);
  assert.equal(publicStatus.decorativeCenter, false);
});

test('world-space actors and progress remain owned by existing Battle/world authorities', () => {
  const plan = projectBattlePortraitRecompose();
  const world = plan.regions.worldViewport;

  assert.equal(world.placement, 'PRIMARY_WORLD_SURFACE');
  assert.equal(world.operationCharacter, 'WORLD_SPACE_AUTHORITATIVE_POSITION');
  assert.equal(world.shieldProgressGoal, 'WORLD_SPACE_INSPECTABLE');
  assert.equal(world.camera, 'EXISTING_FOLLOW_AND_INSPECT_AUTHORITY');
  assert.equal(world.fieldThemeBinding, 'DECORATION_SEPARATE_FROM_GAMEPLAY_GEOMETRY');

  assert.equal(plan.worldGeometryAuthority, false);
  assert.equal(plan.cameraAuthority, false);
  assert.equal(plan.shieldAuthority, false);
  assert.equal(plan.progressAuthority, false);
  assert.equal(plan.goalAuthority, false);
});

test('current action stays at the world-to-dock boundary without blocking board input', () => {
  const plan = projectBattlePortraitRecompose();
  const cue = plan.regions.currentAction;

  assert.equal(cue.name, BATTLE_PORTRAIT_REGION.CURRENT_ACTION);
  assert.equal(cue.placement, 'WORLD_TO_DOCK_BOUNDARY_OVERLAY');
  assert.equal(cue.blocksWorldInput, false);
  assert.equal(cue.valuePolicy, 'CALLER_AUTHORITATIVE_ONLY');
});

test('right-thumb family owns the bottom-right anchor and preserves 44px-class targets', () => {
  const plan = projectBattlePortraitRecompose();
  const dock = plan.regions.interactionDock;

  assert.equal(dock.primaryAnchor, 'BOTTOM_RIGHT_THUMB_CLUSTER');
  assert.equal(dock.minimumTouchTargetPx, 44);
  assert.equal(dock.jankenChoiceCount, 3);
  assert.equal(dock.thumbGeometryAuthority, 'BATTLE_THUMB_CLUSTER_PRESENTATION_R1');
  assert.equal(dock.handProjectionAuthority, 'EXISTING_HAND3_AND_JANKEN_RUNTIME');
});

test('basic Battle keeps roulette and dice absent while optional enablement only chooses placement', () => {
  const basic = projectBattlePortraitRecompose();
  assert.deepEqual(basic.optionalRules.roulette, { visible: false, placement: 'ABSENT' });
  assert.deepEqual(basic.optionalRules.dice, { visible: false, placement: 'ABSENT' });

  const enabled = projectBattlePortraitRecompose({
    optionalRouletteEnabled: true,
    optionalDiceEnabled: true,
  });
  assert.deepEqual(enabled.optionalRules.roulette, {
    visible: true,
    placement: 'BOTTOM_RIGHT_THUMB_CLUSTER_EXTENSION',
  });
  assert.deepEqual(enabled.optionalRules.dice, {
    visible: true,
    placement: 'WORLD_ACTION_EDGE_AUXILIARY',
  });
  assert.equal(enabled.optionalRuleEnableAuthority, false);
});

test('Advice Partner remains separate and compact by default', () => {
  const compact = projectBattlePortraitRecompose();
  assert.equal(compact.advice.actorSeparation, 'ADVICE_PARTNER_SEPARATE_FROM_OPERATION_CHARACTER');
  assert.equal(compact.advice.presentation, 'COMPACT_TRIGGER_AT_WORLD_EDGE');
  assert.equal(compact.advice.defaultCompact, true);
  assert.equal(compact.advice.defaultBlocksWorld, false);

  const expanded = projectBattlePortraitRecompose({ adviceExpanded: true });
  assert.equal(expanded.advice.presentation, 'EXPLICIT_EXPANDED_EXISTING_SURFACE');
  assert.equal(expanded.advice.defaultCompact, false);
});

test('HUD preserves current Battle information without inventing values or a second HUD', () => {
  const plan = projectBattlePortraitRecompose();
  const hud = plan.regions.topHud;

  assert.deepEqual(hud.requiredItems, [
    'settings', 'turn', 'score', 'battleCardChain', 'loadCardJanken', 'hate',
  ]);
  assert.equal(hud.valuePolicy, 'CALLER_AUTHORITATIVE_ONLY');
  assert.equal(hud.overflowPolicy, 'COMPACT_HORIZONTAL_NO_SECOND_HUD');
});

test('reduced-motion and low-performance modes preserve identical geometry and state meaning', () => {
  const normal = projectBattlePortraitRecompose();
  const reduced = projectBattlePortraitRecompose({ reducedMotion: true });
  const lowPerf = projectBattlePortraitRecompose({ lowPerformance: true });

  assert.equal(normal.motionMode, 'FULL');
  assert.equal(reduced.motionMode, 'REDUCED_STATIC');
  assert.equal(lowPerf.motionMode, 'LOW_PERF_STATIC');
  assert.deepEqual(reduced.regions, normal.regions);
  assert.deepEqual(lowPerf.regions, normal.regions);
  assert.deepEqual(reduced.optionalRules, normal.optionalRules);
  assert.deepEqual(lowPerf.optionalRules, normal.optionalRules);
});

test('safe insets shift screen-space bands without changing world authority', () => {
  const plan = projectBattlePortraitRecompose({
    viewportWidth: 390,
    viewportHeight: 844,
    safeInsets: { top: 12, right: 4, bottom: 20, left: 4 },
  });

  assert.equal(plan.regions.topHud.topPx, 12);
  assert.equal(plan.regions.interactionDock.bottomPx, 824);
  assert.equal(plan.regions.publicStatus.columns, 4);
  assert.equal(plan.worldGeometryAuthority, false);
  assert.equal(plan.worldIsLargest, true);
});

test('landscape and wide viewports fail closed so this core cannot overwrite other responsive layouts', () => {
  const landscape = projectBattlePortraitRecompose({ viewportWidth: 667, viewportHeight: 375 });
  const widePortrait = projectBattlePortraitRecompose({ viewportWidth: 600, viewportHeight: 900 });

  for (const plan of [landscape, widePortrait]) {
    assert.equal(plan.applicable, false);
    assert.equal(plan.reason, 'NOT_PHONE_PORTRAIT');
    assert.equal(Object.prototype.hasOwnProperty.call(plan, 'regions'), false);
    assert.equal(plan.gameStateWrite, false);
    assert.equal(plan.worldGeometryAuthority, false);
  }
});

test('presentation projection never claims gameplay, target, hand assignment, Mana, or hidden-hand authority', () => {
  const plan = projectBattlePortraitRecompose({
    optionalRouletteEnabled: true,
    optionalDiceEnabled: true,
  });

  assert.equal(plan.gameplayAuthority, false);
  assert.equal(plan.inputAuthority, false);
  assert.equal(plan.legalityAuthority, false);
  assert.equal(plan.targetAuthority, false);
  assert.equal(plan.handAssignmentAuthority, false);
  assert.equal(plan.manaRecoveryAuthority, false);
  assert.equal(plan.hiddenHandAuthority, false);
  assert.equal(plan.gameStateWrite, false);

  const serialized = JSON.stringify(plan);
  for (const forbidden of [
    'legalTargets', 'targetId', 'shieldId', 'goalCoordinates', 'progressCoordinates',
    'manaRecoveryAmount', 'hiddenHandCount', 'cardToRock', 'cardToScissors', 'cardToPaper',
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('contract explicitly pins recomposition and non-authority boundaries', () => {
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.targetViewport.width, 390);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.targetViewport.height, 844);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.recomposesInsteadOfScalingLandscape, true);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.worldMustRemainLargestPrimarySurface, true);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.publicStatusDisposition, 'FOUR_COLUMN_COMPACT_PERIPHERAL_RAIL');
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.operationCharacterDisposition, 'WORLD_SPACE_EXISTING_AUTHORITY');
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.advicePartnerDisposition, 'SEPARATE_COMPACT_BY_DEFAULT');
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.thumbClusterDisposition, 'BOTTOM_RIGHT_EXISTING_AUTHORITY');
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.basicBattleRouletteVisible, false);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.basicBattleDiceVisible, false);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.movesWorldObjects, false);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.computesTargets, false);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.computesHandAssignment, false);
  assert.equal(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.writesGameState, false);
});

test('invalid dimensions, participant count, insets, and flags fail closed', () => {
  assert.throws(() => projectBattlePortraitRecompose({ viewportWidth: 0 }), /viewportWidth must be a positive finite number/);
  assert.throws(() => projectBattlePortraitRecompose({ viewportHeight: Number.NaN }), /viewportHeight must be a positive finite number/);
  assert.throws(() => projectBattlePortraitRecompose({ participantCount: 3 }), /participantCount must be 4/);
  assert.throws(() => projectBattlePortraitRecompose({ safeInsets: { left: -1 } }), /safeInsets.left must be a non-negative finite number/);
  assert.throws(() => projectBattlePortraitRecompose({ optionalRouletteEnabled: 'yes' }), /optionalRouletteEnabled must be boolean/);
  assert.throws(() => projectBattlePortraitRecompose({ reducedMotion: 1 }), /reducedMotion must be boolean/);
});

test('plans and the public contract are deeply frozen', () => {
  const plan = projectBattlePortraitRecompose();

  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.regions), true);
  assert.equal(Object.isFrozen(plan.regions.worldViewport), true);
  assert.equal(Object.isFrozen(plan.optionalRules), true);
  assert.equal(Object.isFrozen(BATTLE_PORTRAIT_REGION), true);
  assert.equal(Object.isFrozen(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT), true);
  assert.equal(Object.isFrozen(BATTLE_PORTRAIT_RECOMPOSE_CONTRACT.targetViewport), true);
});
