import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BATTLE_TURN_PHASE,
  BATTLE_TURN_PHASE_CONTRACT,
  assertBattleTurnPhaseTransition,
  canTransitionBattleTurnPhase,
  getBattleTurnPhaseSpec,
  phaseOwnsPrimaryInput,
} from '../browser/battle-turn-phase-contract-core.mjs';

test('current gameplay phase order is explicit and unchanged', () => {
  assert.deepEqual(BATTLE_TURN_PHASE_CONTRACT.order, ['plan', 'reveal', 'move', 'target', 'resolve']);
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.initialPhase, 'plan');
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.secondTurnController, false);
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.gameStateWrite, false);
});

test('only the current linear turn transitions are legal', () => {
  const legal = [
    ['plan', 'reveal'],
    ['reveal', 'move'],
    ['move', 'target'],
    ['target', 'resolve'],
    ['resolve', 'plan'],
  ];
  for (const [from, to] of legal) {
    assert.equal(canTransitionBattleTurnPhase(from, to), true, `${from}->${to}`);
    const receipt = assertBattleTurnPhaseTransition({ current: from, next: to, reason: 'test' });
    assert.equal(receipt.current, from);
    assert.equal(receipt.next, to);
    assert.equal(receipt.gameStateWrite, false);
  }
});

test('skips, rewinds, and unknown phases fail closed', () => {
  for (const [from, to] of [
    ['plan', 'move'],
    ['reveal', 'target'],
    ['move', 'resolve'],
    ['target', 'plan'],
    ['resolve', 'target'],
    ['plan', 'plan'],
  ]) {
    assert.equal(canTransitionBattleTurnPhase(from, to), false, `${from}->${to}`);
    assert.throws(() => assertBattleTurnPhaseTransition({ current: from, next: to }), /BATTLE_TURN_PHASE_ILLEGAL_TRANSITION/);
  }
  assert.throws(() => getBattleTurnPhaseSpec('settle'), /BATTLE_TURN_PHASE_UNKNOWN/);
});

test('phase boundaries name start, completion, and primary input ownership', () => {
  assert.deepEqual(
    BATTLE_TURN_PHASE_CONTRACT.order.map((phase) => {
      const spec = getBattleTurnPhaseSpec(phase);
      return [spec.id, spec.startCondition, spec.completionCondition, spec.primaryInputOwner];
    }),
    [
      ['plan', 'ROUND_RUNTIME_READY', 'ALL_LEGAL_PLANS_ACCEPTED_AND_LOCKED', 'PLAN_RESERVATION'],
      ['reveal', 'PLANS_LOCKED', 'ROAD_REVEAL_AND_REVEAL_ABILITIES_RESOLVED', 'SYSTEM'],
      ['move', 'ROAD_REVEAL_RESOLVED', 'ALL_AUTHORITATIVE_PATHS_RESOLVED', 'SYSTEM'],
      ['target', 'MOVEMENT_RESOLVED_AND_ACTIVE_ATTACKER_SELECTED', 'LEGAL_ATTACK_TARGET_COMMITTED', 'ATTACK_TARGET'],
      ['resolve', 'LEGAL_ATTACK_TARGET_COMMITTED', 'BATTLE_RESOLUTION_BOARD_SETTLE_AND_TERMINAL_CHECK_COMPLETE', 'SYSTEM'],
    ],
  );
  assert.equal(phaseOwnsPrimaryInput(BATTLE_TURN_PHASE.PLAN, 'PLAN_RESERVATION'), true);
  assert.equal(phaseOwnsPrimaryInput(BATTLE_TURN_PHASE.TARGET, 'ATTACK_TARGET'), true);
  assert.equal(phaseOwnsPrimaryInput(BATTLE_TURN_PHASE.RESOLVE, 'ATTACK_TARGET'), false);
});

test('cinematic presentation stages remain separate from gameplay phases', () => {
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.gameplayPhaseAuthority, 'match.phase');
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.battlePresentationStageAuthority, 'match.battlePresentation.stage');
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.presentationStageChangesGameplayPhase, false);
  assert.equal(BATTLE_TURN_PHASE_CONTRACT.nestedChoiceAuthority, 'EXISTING_ABILITY_AND_REPLACEMENT_RUNTIME');
});

test('live GAMEROAD routes gameplay phase writes through the guarded transition seam', async () => {
  const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.match(html, /id="gameroad-battle-turn-phase-contract-r1"/);
  assert.match(html, /function setBattleTurnPhase\(m,next,reason\)/);
  assert.doesNotMatch(html, /\bm\.phase\s*=\s*['"](?:reveal|move|target|resolve|plan)['"]/);
  const calls = [...html.matchAll(/setBattleTurnPhase\(m,'(reveal|move|target|resolve|plan)'/g)].map((m) => m[1]);
  assert.deepEqual(calls.sort(), ['move', 'move', 'plan', 'resolve', 'reveal', 'reveal', 'target', 'target'].sort());
});

test('live battle presentation settle is not promoted into a gameplay phase', async () => {
  const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
  assert.match(html, /setBattlePresentation\('settle'/);
  assert.doesNotMatch(html, /setBattleTurnPhase\(m,'settle'/);
});
