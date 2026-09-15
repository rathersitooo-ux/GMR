const SCHEMA = 'gameroad.battle-deck-supply-boundary.v1';

const STANDARD_RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const STANDARD_SUITS = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);

function freezeArray(values) {
  return Object.freeze([...values]);
}

function assertDeck(value, name) {
  if (!Array.isArray(value)) throw new TypeError(`${name}_ARRAY_REQUIRED`);
}

function assertPermutation(before, after) {
  if (!Array.isArray(after)) throw new TypeError('SUB_DECK_SHUFFLE_ARRAY_REQUIRED');
  if (after.length !== before.length) throw new TypeError('SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED');

  const counts = new Map();
  for (const item of before) counts.set(item, (counts.get(item) || 0) + 1);
  for (const item of after) {
    const count = counts.get(item) || 0;
    if (count <= 0) throw new TypeError('SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED');
    if (count === 1) counts.delete(item);
    else counts.set(item, count - 1);
  }
  if (counts.size) throw new TypeError('SUB_DECK_SHUFFLE_PERMUTATION_REQUIRED');
}

function buildFinalResortIdentitySet() {
  const cards = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push(Object.freeze({
        source: 'FINAL_RESORT_STANDARD_52',
        identityKey: `${suit}:${rank}`,
        suit,
        rank,
        joker: false,
        abilityStatus: 'NONE',
        gameplaySemanticsStatus: 'UNRESOLVED',
      }));
    }
  }
  return Object.freeze(cards);
}

const FINAL_RESORT_IDENTITIES = buildFinalResortIdentitySet();

export const BATTLE_DECK_SUPPLY_BOUNDARY = Object.freeze({
  schema: SCHEMA,
  mainDeckExhaustion: 'SHUFFLE_ALL_REMAINING_SUB_DECK_TO_MAIN',
  finalResortEntry: 'ONLY_WHEN_MAIN_AND_SUB_DECK_CANNOT_SUPPLY',
  finalResortPartnerSource: 'INFINITE_STANDARD_52_NO_JOKER',
  finalResortAbilities: 'NONE',
  finalResortGenerationMechanism: 'UNRESOLVED',
  finalResortRankGameplaySemantics: 'UNRESOLVED',
  standardRanks: STANDARD_RANKS,
  standardSuits: STANDARD_SUITS,
});

export function createFinalResortPartnerPolicy() {
  return Object.freeze({
    schema: SCHEMA,
    mode: 'FINAL_RESORT',
    scope: 'PARTNER',
    source: Object.freeze({
      kind: 'STANDARD_PLAYING_CARDS',
      isInfinite: true,
      cardIdentityCount: 52,
      jokersIncluded: false,
      identities: FINAL_RESORT_IDENTITIES,
    }),
    abilityPolicy: 'NONE',
    drawGenerationStatus: 'UNRESOLVED',
    rankGameplaySemanticsStatus: 'UNRESOLVED',
  });
}

/**
 * Resolve one ordinary Battle card-supply request without owning Battle RNG or card values.
 *
 * The caller remains authoritative for the opaque card identities and for shuffle randomness.
 * This boundary only owns the current user-fixed supply transition:
 * main deck -> shuffled remaining sub deck -> final-resort-required.
 */
export function consumeNextBattleSupply({
  mainDeck,
  subDeck,
  shuffleSubDeck,
} = {}) {
  assertDeck(mainDeck, 'MAIN_DECK');
  assertDeck(subDeck, 'SUB_DECK');

  let nextMain = [...mainDeck];
  let nextSub = [...subDeck];

  if (nextMain.length > 0) {
    const card = nextMain.shift();
    return Object.freeze({
      schema: SCHEMA,
      status: 'CARD_SUPPLIED',
      source: 'MAIN_DECK',
      card,
      mainDeck: freezeArray(nextMain),
      subDeck: freezeArray(nextSub),
      transition: null,
      finalResortPolicy: null,
    });
  }

  if (nextSub.length > 0) {
    if (typeof shuffleSubDeck !== 'function') {
      throw new TypeError('SUB_DECK_SHUFFLE_AUTHORITY_REQUIRED');
    }

    const beforeShuffle = [...nextSub];
    const shuffled = shuffleSubDeck([...beforeShuffle]);
    assertPermutation(beforeShuffle, shuffled);

    nextMain = [...shuffled];
    nextSub = [];
    const card = nextMain.shift();

    return Object.freeze({
      schema: SCHEMA,
      status: 'CARD_SUPPLIED',
      source: 'SUB_DECK_SHUFFLED_TO_MAIN',
      card,
      mainDeck: freezeArray(nextMain),
      subDeck: freezeArray(nextSub),
      transition: 'SUB_DECK_SHUFFLED_TO_MAIN',
      finalResortPolicy: null,
    });
  }

  return Object.freeze({
    schema: SCHEMA,
    status: 'FINAL_RESORT_REQUIRED',
    source: null,
    card: null,
    mainDeck: freezeArray([]),
    subDeck: freezeArray([]),
    transition: 'ENTER_FINAL_RESORT',
    finalResortPolicy: createFinalResortPartnerPolicy(),
  });
}
