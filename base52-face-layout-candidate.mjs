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

export const BASE52_EXTERNAL_FACE_SOURCE = deepFreeze({
  schema: 'gameroad.base52-external-face-source.v1',
  disposition: 'REUSE_COMPOSE',
  directUseCandidate: {
    repository: 'Webisso/playing-cards',
    commit: '50a3f7be7d6b7248da5f5c56533e1c5414aefb40',
    license: 'MIT',
    formats: ['svg', 'png'],
    cardCoverage: 54,
    runtimeSource: 'pinned-raw-github',
    formalAssetAccepted: false,
  },
  readabilityReferences: [
    {
      repository: 'saulspatz/SVGCards',
      license: 'public-domain',
      contribution: 'accessible-jumbo-index-and-four-suit-readable-identity',
    },
    {
      repository: 'AustinGabriel/Public-Domain-and-CC0-Playing-Cards',
      license: 'CC0/public-domain',
      contribution: 'commercial-safe-full-deck-rights-fallback',
    },
    {
      product: 'Balatro',
      contribution: 'high-contrast-card-option-and-glanceable-card-state-reference-only',
    },
  ],
  generatedFromModelDefaults: false,
  formalAssetAccepted: false,
});

const SOURCE_SUIT_NAMES = Object.freeze({
  clubs: 'clubs',
  diamonds: 'diamonds',
  hearts: 'hearts',
  spades: 'spades',
});
const SOURCE_RANK_NAMES = Object.freeze({
  A: 'ace',
  J: 'jack',
  Q: 'queen',
  K: 'king',
});

export function resolveBase52ExternalFaceAsset(card) {
  assertCard(card);
  const rankStem = SOURCE_RANK_NAMES[card.rank] ?? card.rank;
  const suitStem = SOURCE_SUIT_NAMES[card.suit];
  const sourceFilename = `${rankStem}_of_${suitStem}.svg`;
  const source = BASE52_EXTERNAL_FACE_SOURCE.directUseCandidate;
  return deepFreeze({
    schema: 'gameroad.base52-external-face-asset.v1',
    canonicalCardId: card.canonicalCardId,
    rank: card.rank,
    suit: card.suit,
    sourceRepository: source.repository,
    sourceCommit: source.commit,
    sourceLicense: source.license,
    sourceFilename,
    sourceUrl: `https://raw.githubusercontent.com/${source.repository}/${source.commit}/svg/${sourceFilename}`,
    generatedFromModelDefaults: false,
    formalAssetAccepted: false,
  });
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
    externalFaceAsset: null,
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
  const externalFaceAsset = resolveBase52ExternalFaceAsset(card);

  return deepFreeze({
    schema: SCHEMA,
    artStatus: ART_STATUS,
    formalAssetId: null,
    externalFaceAsset,
    externalFacePolicy: {
      disposition: BASE52_EXTERNAL_FACE_SOURCE.disposition,
      generatedPlaceholderAllowed: false,
      codeDrawnFormalFaceAllowed: false,
      identityFallback: 'corner-index',
      lowPerfCenterArtOptional: true,
    },
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
  const externalFaceUrls = new Set();

  for (const card of cards) {
    assertCard(card);
    if (ids.has(card.canonicalCardId)) throw new TypeError('CANONICAL_CARD_ID_DUPLICATE');
    const key = semanticKey(card);
    if (semanticKeys.has(key)) throw new TypeError('RANK_SUIT_PAIR_DUPLICATE');
    ids.add(card.canonicalCardId);
    semanticKeys.add(key);
    const entry = createBase52FaceLayoutCandidate(card, preferences);
    if (!entry.externalFaceAsset?.sourceUrl) throw new TypeError('BASE52_EXTERNAL_FACE_ASSET_REQUIRED');
    if (externalFaceUrls.has(entry.externalFaceAsset.sourceUrl)) throw new TypeError('BASE52_EXTERNAL_FACE_ASSET_DUPLICATE');
    externalFaceUrls.add(entry.externalFaceAsset.sourceUrl);
    entries.push(entry);
  }

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      if (!semanticKeys.has(`${suit}:${rank}`)) throw new TypeError('BASE52_RANK_SUIT_COVERAGE_INCOMPLETE');
    }
  }

  if (externalFaceUrls.size !== 52) throw new TypeError('BASE52_EXTERNAL_FACE_COVERAGE_INCOMPLETE');

  return deepFreeze({
    schema: SCHEMA,
    artStatus: ART_STATUS,
    externalFaceSource: BASE52_EXTERNAL_FACE_SOURCE,
    externalFaceCoverage: externalFaceUrls.size,
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
  externalFaceSource: BASE52_EXTERNAL_FACE_SOURCE,
  generatedPlaceholderAllowed: false,
  codeDrawnFormalFaceAllowed: false,
  formalAssetManifest: false,
});
