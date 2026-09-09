import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT,
  createBattleNewBaseLiveConsumerAdapter,
} from '../browser/battle-new-base-live-consumer-adapter.mjs';

function createAdapter(overrides = {}) {
  return createBattleNewBaseLiveConsumerAdapter({
    readRoundAuthority: async () => ({
      roundId: 'round-optional-rule',
      hand: [
        { id: 'card-a', suit: 'SP' },
        { id: 'card-b', suit: 'CL' },
        { id: 'card-c', suit: 'DI' },
      ],
    }),
    readAuthoritativeHand3Uint32: () => 0,
    readCompoundAttackCandidate: async () => ({}),
    sendExistingBattleAction: async () => true,
    ...overrides,
  });
}

test('Basic Battle stays fail-closed when optional-rule authority is not connected', async () => {
  const adapter = createAdapter();
  const projection = await adapter.projectOptionalRuleActivation();

  assert.equal(adapter.status().optionalRuleAuthorityConnected, false);
  assert.equal(projection.authorityRef, null);
  assert.deepEqual(projection.dice, {
    enabled: false,
    parameters: null,
    reason: 'NO_RESOLVED_AUTHORITY',
  });
  assert.deepEqual(projection.roulette, {
    enabled: false,
    parameters: null,
    reason: 'NO_RESOLVED_AUTHORITY',
  });
});

test('malformed or non-canonical caller authority cannot silently enable optional rules', async () => {
  const adapter = createAdapter({
    readResolvedOptionalRuleAuthority: async () => ({
      authorityRef: ' regulation/basic ',
      optionalRules: {
        dice: { enabled: true, parameters: { sides: 20 } },
        roulette: { enabled: true, parameters: { slots: 6 } },
      },
    }),
  });

  const projection = await adapter.projectOptionalRuleActivation();
  assert.equal(adapter.status().optionalRuleAuthorityConnected, true);
  assert.equal(projection.authorityRef, null);
  assert.equal(projection.dice.enabled, false);
  assert.equal(projection.roulette.enabled, false);
  assert.equal(projection.dice.reason, 'NO_RESOLVED_AUTHORITY');
  assert.equal(projection.roulette.reason, 'NO_RESOLVED_AUTHORITY');
});

test('canonical caller-resolved authority is projected without inventing execution or parameters', async () => {
  let reads = 0;
  const adapter = createAdapter({
    readResolvedOptionalRuleAuthority: async () => {
      reads += 1;
      return {
        authorityRef: 'battle-rule/season-9/map-a',
        optionalRules: {
          dice: {
            enabled: true,
            parameters: {
              source: 'caller-authority',
              opaque: { token: 'dice-mode-a' },
            },
          },
          roulette: { enabled: false },
        },
      };
    },
  });

  const projection = await adapter.projectOptionalRuleActivation();
  assert.equal(reads, 1);
  assert.equal(projection.authorityRef, 'battle-rule/season-9/map-a');
  assert.deepEqual(projection.dice, {
    enabled: true,
    parameters: {
      source: 'caller-authority',
      opaque: { token: 'dice-mode-a' },
    },
    reason: 'AUTHORITY_ENABLED',
  });
  assert.deepEqual(projection.roulette, {
    enabled: false,
    parameters: null,
    reason: 'NOT_EXPLICITLY_ENABLED',
  });
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.dice.parameters), true);
  assert.equal(Object.isFrozen(projection.dice.parameters.opaque), true);
});

test('optional-rule seam accepts only a reader function and advertises projection-only authority boundaries', () => {
  assert.throws(
    () => createAdapter({ readResolvedOptionalRuleAuthority: {} }),
    /readResolvedOptionalRuleAuthority must be a function/,
  );

  assert.equal(
    BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.optionalRuleActivationPolicy,
    'EXISTING_BATTLE_OPTIONAL_RULE_ACTIVATION_CORE',
  );
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.optionalRuleAuthority, 'CALLER_RESOLVED_CONTEXT');
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.basicDiceEnabled, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.basicRouletteEnabled, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.resolvesOptionalRulePrecedence, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.executesDice, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.executesRoulette, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesMovementFromOptionalRules, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.computesRouletteMembership, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.optionalRuleGameStateWrite, false);
  assert.equal(BATTLE_NEW_BASE_LIVE_CONSUMER_ADAPTER_CONTRACT.optionalRuleUiWrite, false);
});
