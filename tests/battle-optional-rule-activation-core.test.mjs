import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT,
  isBattleOptionalRuleEnabled,
  projectBattleOptionalRuleActivation,
} from '../browser/battle-optional-rule-activation-core.mjs';

test('Basic Battle fails closed with both optional rules disabled', () => {
  const projected = projectBattleOptionalRuleActivation();
  assert.deepEqual(projected, {
    authorityRef: null,
    dice: { enabled: false, parameters: null, reason: 'NO_RESOLVED_AUTHORITY' },
    roulette: { enabled: false, parameters: null, reason: 'NO_RESOLVED_AUTHORITY' },
  });
  assert.equal(isBattleOptionalRuleEnabled(projected, 'dice'), false);
  assert.equal(isBattleOptionalRuleEnabled(projected, 'roulette'), false);
});

test('map/regulation-looking metadata never enables a rule by inference', () => {
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'MAP:FIELD-09',
    mapId: 'FIELD-09',
    regulationId: 'REGULATION-EXAMPLE',
    optionalRules: {},
  });
  assert.equal(projected.dice.enabled, false);
  assert.equal(projected.roulette.enabled, false);
});

test('explicit authoritative dice enablement is projected without inventing parameters', () => {
  const parameters = { sides: 8, entropyRef: 'TURN:42:DICE' };
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'REGULATION:RULESET-42',
    optionalRules: {
      dice: { enabled: true, parameters },
    },
  });

  assert.equal(projected.authorityRef, 'REGULATION:RULESET-42');
  assert.deepEqual(projected.dice, {
    enabled: true,
    parameters: { sides: 8, entropyRef: 'TURN:42:DICE' },
    reason: 'AUTHORITY_ENABLED',
  });
  assert.equal(projected.roulette.enabled, false);
  assert.notEqual(projected.dice.parameters, parameters);
  assert.equal(Object.isFrozen(projected.dice.parameters), true);
});

test('explicit authoritative roulette enablement does not create membership or legality', () => {
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'MAP:OPTIONAL-RULE-MAP',
    optionalRules: {
      roulette: { enabled: true },
    },
  });

  assert.deepEqual(projected.roulette, {
    enabled: true,
    parameters: null,
    reason: 'AUTHORITY_ENABLED',
  });
  assert.equal(projected.dice.enabled, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.computesRouletteMembership, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.computesCardLegality, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.commitsCardAction, false);
});

test('parameters never activate a rule without literal enabled=true', () => {
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'REGULATION:RULESET-7',
    optionalRules: {
      dice: { enabled: false, parameters: { sides: 20 } },
      roulette: { parameters: { mode: 'anything' } },
    },
  });

  assert.deepEqual(projected.dice, {
    enabled: false,
    parameters: null,
    reason: 'NOT_EXPLICITLY_ENABLED',
  });
  assert.deepEqual(projected.roulette, {
    enabled: false,
    parameters: null,
    reason: 'NOT_EXPLICITLY_ENABLED',
  });
});

test('missing canonical authorityRef fail-closes even if flags say enabled', () => {
  for (const authorityRef of [undefined, '', ' bad ']) {
    const projected = projectBattleOptionalRuleActivation({
      authorityRef,
      optionalRules: {
        dice: { enabled: true, parameters: { sides: 6 } },
        roulette: { enabled: true },
      },
    });
    assert.equal(projected.authorityRef, null);
    assert.equal(projected.dice.enabled, false);
    assert.equal(projected.roulette.enabled, false);
  }
});

test('unknown optional rules are ignored rather than gaining new semantics', () => {
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'OTHER:CURRENT-RULE-CONTEXT',
    optionalRules: {
      dice: { enabled: false },
      roulette: { enabled: false },
      pursuit: { enabled: true },
      hiddenHand: { enabled: true },
    },
  });

  assert.equal(isBattleOptionalRuleEnabled(projected, 'pursuit'), false);
  assert.equal(isBattleOptionalRuleEnabled(projected, 'hiddenHand'), false);
  assert.equal('pursuit' in projected, false);
  assert.equal('hiddenHand' in projected, false);
});

test('projected nested parameter data is detached and frozen', () => {
  const parameters = {
    sides: 6,
    nested: { seedRef: 'TURN:9' },
    values: [1, 2, 3],
  };
  const projected = projectBattleOptionalRuleActivation({
    authorityRef: 'MAP:AUTHORITY',
    optionalRules: {
      dice: { enabled: true, parameters },
    },
  });

  assert.notEqual(projected.dice.parameters.nested, parameters.nested);
  assert.notEqual(projected.dice.parameters.values, parameters.values);
  assert.equal(Object.isFrozen(projected.dice.parameters.nested), true);
  assert.equal(Object.isFrozen(projected.dice.parameters.values), true);
});

test('contract keeps Basic optional rules off and owns no gameplay writes', () => {
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.basicDiceEnabled, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.basicRouletteEnabled, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.authorityPrecedenceResolution, 'CALLER');
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.infersEnablementFromMapId, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.infersEnablementFromRegulationId, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.inventsRuleParameters, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.computesDiceRoll, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.computesMovementBudget, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_OPTIONAL_RULE_ACTIVATION_CONTRACT.uiWrite, false);
});
