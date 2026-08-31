const SCHEMA = 'GAMEROAD_ROAD_MOVE_DECISION_V1';
const RESOLUTIONS = Object.freeze({
  FOCUSED: 'FOCUSED',
  SOLE_COMPATIBLE: 'SOLE_COMPATIBLE',
  UNRESOLVED: 'UNRESOLVED'
});

const IDENTITY_KEYS = Object.freeze([
  'instanceId',
  'cardInstanceId',
  'handCardId',
  'uid',
  'id',
  'cardId'
]);

function primitiveIdentity(value) {
  if (typeof value === 'string' && value.trim()) return `string:${value.trim()}`;
  if (typeof value === 'number' && Number.isFinite(value)) return `number:${value}`;
  return null;
}

export function roadCardIdentity(card) {
  const primitive = primitiveIdentity(card);
  if (primitive) return primitive;
  if (!card || typeof card !== 'object' || Array.isArray(card)) return null;

  for (const key of IDENTITY_KEYS) {
    const value = primitiveIdentity(card[key]);
    if (value) return `${key}:${value}`;
  }
  return null;
}

function normalizeCards(cards) {
  return Array.isArray(cards) ? cards : [];
}

function uniqueCardsByIdentity(cards, identify) {
  const byIdentity = new Map();
  for (const card of normalizeCards(cards)) {
    const identity = identify(card);
    if (!identity || byIdentity.has(identity)) continue;
    byIdentity.set(identity, card);
  }
  return byIdentity;
}

function pathIsLegal(validity) {
  if (validity === true) return true;
  if (!validity || typeof validity !== 'object' || Array.isArray(validity)) return false;

  const legal = validity.pathLegal === true || validity.legal === true || validity.isLegal === true;
  if (!legal) return false;
  if ('stoppable' in validity && validity.stoppable !== true) return false;
  if ('canStop' in validity && validity.canStop !== true) return false;
  return true;
}

/**
 * Derive whether the current Road-card + movement draft may be committed.
 *
 * This is intentionally a consumer only. It does not calculate reachability,
 * compatibility, Road value, adjacency, stoppability, hand ownership, or any
 * Battle-card state. Those remain authoritative inputs from their existing
 * producers and are revalidated again by the commit authority.
 */
export function deriveRoadMoveDecision(input = {}) {
  const {
    currentPath,
    validity,
    focusedRoadCard = null,
    compatibleRoadCards = [],
    handRoadCards = [],
    identifyRoadCard = roadCardIdentity
  } = input;

  if (typeof identifyRoadCard !== 'function') throw new TypeError('IDENTIFY_ROAD_CARD_REQUIRED');

  const hasCurrentPath = Array.isArray(currentPath) && currentPath.length > 0;
  const legalPath = hasCurrentPath && pathIsLegal(validity);

  const handByIdentity = uniqueCardsByIdentity(handRoadCards, identifyRoadCard);
  const compatibleByIdentity = uniqueCardsByIdentity(compatibleRoadCards, identifyRoadCard);
  const compatibleInHand = [];

  for (const identity of compatibleByIdentity.keys()) {
    if (!handByIdentity.has(identity)) continue;
    compatibleInHand.push({ identity, card: handByIdentity.get(identity) });
  }

  const focusedIdentity = identifyRoadCard(focusedRoadCard);
  const focusInHand = Boolean(focusedIdentity && handByIdentity.has(focusedIdentity));
  const focusCompatible = Boolean(focusedIdentity && compatibleByIdentity.has(focusedIdentity));
  const validFocus = focusInHand && focusCompatible;
  const invalidFocusedRoadCard = focusedRoadCard != null && !validFocus;

  let resolution = RESOLUTIONS.UNRESOLVED;
  let decisionRoadCard = null;
  let decisionRoadCardIdentity = null;

  if (validFocus) {
    resolution = RESOLUTIONS.FOCUSED;
    decisionRoadCardIdentity = focusedIdentity;
    decisionRoadCard = handByIdentity.get(focusedIdentity);
  } else if (compatibleInHand.length === 1) {
    resolution = RESOLUTIONS.SOLE_COMPATIBLE;
    decisionRoadCardIdentity = compatibleInHand[0].identity;
    decisionRoadCard = compatibleInHand[0].card;
  }

  const cardResolved = decisionRoadCardIdentity !== null;
  const canDecide = legalPath && cardResolved;
  const requiresRoadCardChoice = legalPath && !validFocus && compatibleInHand.length > 1;

  let reason = 'PATH_INVALID';
  if (legalPath && compatibleInHand.length === 0) reason = 'NO_COMPATIBLE_ROAD_CARD_IN_HAND';
  else if (requiresRoadCardChoice) reason = 'ROAD_CARD_CHOICE_REQUIRED';
  else if (canDecide && resolution === RESOLUTIONS.FOCUSED) reason = 'READY_FOCUSED';
  else if (canDecide && resolution === RESOLUTIONS.SOLE_COMPATIBLE) reason = 'READY_SOLE_COMPATIBLE';
  else if (legalPath) reason = 'ROAD_CARD_UNRESOLVED';

  const compatibleRoadCardIdentities = Object.freeze(
    compatibleInHand.map(({ identity }) => identity)
  );

  // Freeze only the projection containers. The selected card remains the
  // current hand object supplied by the caller and is never mutated/frozen here.
  return Object.freeze({
    schema: SCHEMA,
    canDecide,
    reason,
    resolution,
    decisionRoadCard,
    decisionRoadCardIdentity,
    requiresRoadCardChoice,
    invalidFocusedRoadCard,
    focusedRoadCardInHand: focusInHand,
    focusedRoadCardCompatible: focusCompatible,
    compatibleRoadCardCount: compatibleInHand.length,
    compatibleRoadCardIdentities
  });
}

export const ROAD_MOVE_DECISION_CORE = Object.freeze({
  schema: SCHEMA,
  resolutions: RESOLUTIONS,
  identityKeys: IDENTITY_KEYS
});
