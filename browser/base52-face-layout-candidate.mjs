const SCHEMA = 'gameroad.base52-face-layout-candidate.v1';
const ART_STATUS = 'NONFORMAL_CANDIDATE';
const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']);
const SUITS = Object.freeze(['clubs', 'diamonds', 'hearts', 'spades']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    throw new TypeError('CARD_REQUIRED');
  }
  if (!nonEmptyString(card.canonicalCardId)) throw new TypeError('CANONICAL_CARD_ID_REQUIRED');
  if (!RANKS.includes(card.rank)) throw new TypeError('RANK_INVALID');
  if (!SUITS.includes(card.suit)) throw new TypeError('SUIT_INVALID');
}

function semanticKey(card) {
  return `${card.suit}:${card.rank}`;
}

function normalizePreferences(preferences) {
  const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};
  return deepFreeze({
    faceDown: source.faceDown === true,
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
  });
}

function createBackPlan(preferences) {
  return deepFreeze({
    schema: SCHEMA,
    artStatus: ART_STATUS,
    formalAssetId: null,
    face: 'back',
    publicIdentity: null,
    cornerIndex: null,
    centerDetail: 'hidden',
    colorRequiredForIdentity: false,
    grayscaleIdentityPreserved: true,
    secretFaceLeakage: false,
    accessibility: {
      reducedMotion: preferences.reducedMotion,
      lowPerf: preferences.lowPerf,
    },
    acceptanceBoundary: {
      actualUseSiteMeasured: false,
      humanFormalDirectionAccepted: false,
      productMounted: false,
    },
  });
}

export function createBase52FaceLayoutCandidate(card, preferences = {}) {
  const prefs = normalizePreferences(preferences);
  if (prefs.faceDown) return createBackPlan(prefs);

  assertCard(card);
  const centerDetail = prefs.lowPerf || prefs.reducedMotion ? 'minimal' : 'candidate';

  return deepFreeze({
    schema: SCHEMA,
    artStatus: ART_STATUS,
    formalAssetId: null,
    face: 'front',
    publicIdentity: {
      canonicalCardId: card.canonicalCardId,
      rank: card.rank,
      suit: card.suit,
    },
    cornerIndex: {
      position: 'top-left',
      primaryIdentity: true,
      rankText: card.rank,
      suitToken: card.suit,
      colorRequired: false,
    },
    centerDetail,
    colorRequiredForIdentity: false,
    grayscaleIdentityPreserved: true,
    secretFaceLeakage: false,
    accessibility: {
      reducedMotion: prefs.reducedMotion,
      lowPerf: prefs.lowPerf,
    },
    acceptanceBoundary: {
      actualUseSiteMeasured: false,
      humanFormalDirectionAccepted: false,
      productMounted: false,
    },
  });
}

export function buildBase52FaceLayoutCandidateManifest(cards, preferences = {}) {
  if (!Array.isArray(cards) || cards.length !== 52) throw new TypeError('BASE52_EXACTLY_52_REQUIRED');

  const ids = new Set();
  const semanticKeys = new Set();
  const entries = [];

  for (const card of cards) {
    assertCard(card);
    if (ids.has(card.canonicalCardId)) throw new TypeError('CANONICAL_CARD_ID_DUPLICATE');
    const key = semanticKey(card);
    if (semanticKeys.has(key)) throw new TypeError('RANK_SUIT_PAIR_DUPLICATE');
    ids.add(card.canonicalCardId);
    semanticKeys.add(key);
    entries.push(createBase52FaceLayoutCandidate(card, preferences));
  }

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!semanticKeys.has(`${suit}:${rank}`)) throw new TypeError('BASE52_RANK_SUIT_COVERAGE_INCOMPLETE');
    }
  }

  return deepFreeze({
    schema: SCHEMA,
    artStatus: ART_STATUS,
    formalAssetManifest: false,
    canonicalIdsCallerSupplied: true,
    count: entries.length,
    entries,
    acceptanceBoundary: {
      actualUseSiteMeasured: false,
      humanFormalDirectionAccepted: false,
      formalCommonFaceAssetConnected: false,
      productMounted: false,
    },
  });
}

export const BASE52_FACE_LAYOUT_CANDIDATE = Object.freeze({
  schema: SCHEMA,
  artStatus: ART_STATUS,
  ranks: RANKS,
  suits: SUITS,
  canonicalIdsCallerSupplied: true,
  fixedOcclusionThreshold: null,
  formalAssetManifest: false,
});
