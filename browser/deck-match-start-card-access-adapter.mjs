import { evaluateDeckCardAccess } from './card-access-entitlement-core.mjs';
import { createDeckMatchStartSnapshot } from './deck-save-ack-core.mjs';
import { SEASON_STORE_KEY } from './season-store.mjs';

const SCHEMA = 'gameroad.deck-match-start-card-access-adapter.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function selectionDeck(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw new TypeError('MATCH_START_SELECTION_REQUIRED');
  }
  const savedDeck = selection.savedDeck && typeof selection.savedDeck === 'object'
    ? selection.savedDeck
    : {};
  return {
    main: Array.isArray(savedDeck.main) ? [...savedDeck.main] : [],
    ex: Array.isArray(savedDeck.ex) ? [...savedDeck.ex] : [],
  };
}

export function createDeckMatchStartSnapshotWithCardAccess(
  selection,
  {
    validateDeck,
    accessPolicy,
  } = {},
) {
  const access = evaluateDeckCardAccess(selectionDeck(selection), accessPolicy);
  if (!access.ok) {
    throw new Error(`MATCH_START_CARD_ACCESS_DENIED:${access.lockedCardIds.join(',')}`);
  }

  return createDeckMatchStartSnapshot(selection, { validateDeck });
}

export function inspectDeckMatchStartCardAccess(selection, { accessPolicy } = {}) {
  return deepFreeze({
    schema: SCHEMA,
    access: evaluateDeckCardAccess(selectionDeck(selection), accessPolicy),
    selectionMutationAllowed: false,
    matchStateMutationAllowed: false,
  });
}

// 第22段：シーズンパスのカード利用の方針を作る。
// 弾の番号が無いカードは所有扱い。前の弾のカードはパス所有で使え、
// 所有なしでは錠。今の弾（と後の弾）のカードはパス所有があっても錠。
// パスの所有は端末のシーズン記録（SEASON_STORE_KEY）の passOwned で読む。
function readSeasonPassOwned(storage) {
  if (!storage || typeof storage.getItem !== 'function') return false;
  try {
    const raw = storage.getItem(SEASON_STORE_KEY);
    if (!raw) return false;
    return JSON.parse(raw)?.passOwned === true;
  } catch {
    return false;
  }
}

export function buildSeasonPassCardAccessPolicy(selection, { storage, setNumbers } = {}) {
  const deck = selectionDeck(selection);
  const cardSetNumbers = setNumbers?.cardSetNumbers ?? {};
  const currentSetNumber = setNumbers?.currentSetNumber;
  const ownedCardIds = [];
  const seasonPassCardIds = [];
  for (const cardId of [...deck.main, ...deck.ex]) {
    const setNumber = cardSetNumbers[cardId];
    if (setNumber === undefined) ownedCardIds.push(cardId);
    else if (Number.isSafeInteger(currentSetNumber) && setNumber < currentSetNumber) {
      seasonPassCardIds.push(cardId);
    }
    // 今の弾・後の弾の番号があるカードは、所有にもパスの対象にも入れない（錠）。
  }
  return {
    ownedCardIds,
    seasonPass: {
      active: readSeasonPassOwned(storage),
      allCards: false,
      cardIds: seasonPassCardIds,
    },
  };
}

export const DECK_MATCH_START_CARD_ACCESS_ADAPTER = Object.freeze({
  schema: SCHEMA,
  existingMatchSnapshotAuthority: 'deck-save-ack-core:createDeckMatchStartSnapshot',
  entitlementAuthority: 'CALLER_SUPPLIED_POLICY',
  savedDeckMutationAllowed: false,
  ownershipMutationAllowed: false,
  matchStateMutationAllowed: false,
});
