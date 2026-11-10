import {
  BATTLE_DECK_SUPPLY_BOUNDARY,
  consumeNextBattleSupply,
} from './battle-deck-supply-boundary.mjs';

export const BATTLE_SUBDECK_SUPPLY_ADAPTER_SCHEMA = 'gameroad.battle-subdeck-supply-adapter.v1';

/**
 * Narrow caller-facing adapter over the merged Battle deck-supply boundary.
 *
 * This module does not own deck rules, RNG, generated-card semantics, or a
 * gameplay-state write. It only projects the boundary result into the exact
 * card supplied plus the next deck arrays that the caller may commit.
 */
export function projectBattleSubDeckSupply({
  mainDeck,
  subDeck,
  shuffleSubDeck,
} = {}) {
  const supply = consumeNextBattleSupply({
    mainDeck,
    subDeck,
    shuffleSubDeck,
  });

  const deckUpdate = Object.freeze({
    mainDeck: supply.mainDeck,
    subDeck: supply.subDeck,
  });

  return Object.freeze({
    schema: BATTLE_SUBDECK_SUPPLY_ADAPTER_SCHEMA,
    status: supply.status,
    source: supply.source,
    suppliedCard: supply.card,
    transition: supply.transition,
    deckUpdate,
    finalResortPolicy: supply.finalResortPolicy,
    callerMustCommitDeckUpdate: supply.status === 'CARD_SUPPLIED',
    gameplayStateWrite: false,
    shuffleAuthority: 'CALLER',
  });
}

export const BATTLE_SUBDECK_SUPPLY_ADAPTER_CONTRACT = Object.freeze({
  schema: BATTLE_SUBDECK_SUPPLY_ADAPTER_SCHEMA,
  authority: 'BATTLE_DECK_SUPPLY_BOUNDARY',
  sourceSchema: BATTLE_DECK_SUPPLY_BOUNDARY.schema,
  mainDeckExhaustion: BATTLE_DECK_SUPPLY_BOUNDARY.mainDeckExhaustion,
  finalResortEntry: BATTLE_DECK_SUPPLY_BOUNDARY.finalResortEntry,
  cardIdentity: 'OPAQUE_EXACT_REFERENCE',
  shuffleAuthority: 'CALLER',
  gameplayStateWrite: false,
  generatedCardSemantics: false,
  liveConsumerBinding: false,
});
