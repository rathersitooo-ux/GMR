// Prototype-stage reused playing-card artwork mapping.
// Artwork source is pinned to an immutable public GitHub commit.
// Final formal/public asset adoption remains a separate GAMEROAD gate.
export const BASE52_COMMON_FACE_SOURCE = Object.freeze({
  schema: 'gameroad.base52-common-face-source.v1',
  repository: 'Webisso/playing-cards',
  commit: '50a3f7be7d6b7248da5f5c56533e1c5414aefb40',
  license: 'MIT',
  runtimeFetch: true,
  candidateStage: 'PROTOTYPE_DIRECT_USE_CANDIDATE',
  formalAssetAccepted: false,
  readabilityReferences: Object.freeze([
    'saulspatz/SVGCards Accessible Horizontal jumbo-index public-domain deck',
    'Microsoft XAG 102 contrast',
    'Microsoft XAG 103 color-independent identity',
    'Apple Games HIG legibility',
  ]),
});

const SUITS = Object.freeze({
  SP: Object.freeze({ name: 'spades', symbol: '♠', family: 'black' }),
  HT: Object.freeze({ name: 'hearts', symbol: '♥', family: 'red' }),
  DI: Object.freeze({ name: 'diamonds', symbol: '♦', family: 'red' }),
  CL: Object.freeze({ name: 'clubs', symbol: '♣', family: 'black' }),
});
const RANKS = Object.freeze(['A','2','3','4','5','6','7','8','9','10','J','Q','K']);
const RANK_FILE = Object.freeze({ A: 'ace', J: 'jack', Q: 'queen', K: 'king' });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function parseBase52CanonicalCardId(value) {
  const id = String(value ?? '').trim();
  const match = /^(SP|HT|DI|CL)_(A|[2-9]|10|J|Q|K)$/.exec(id);
  if (!match) return null;
  const suit = SUITS[match[1]];
  return deepFreeze({
    canonicalCardId: id,
    prefix: match[1],
    suit: suit.name,
    suitSymbol: suit.symbol,
    colorFamily: suit.family,
    rank: match[2],
  });
}

export function resolveBase52CommonFaceAsset(canonicalCardId) {
  const parsed = parseBase52CanonicalCardId(canonicalCardId);
  if (!parsed) return null;
  const stem = RANK_FILE[parsed.rank] ?? parsed.rank;
  const filename = `${stem}_of_${parsed.suit}.svg`;
  return deepFreeze({
    ...parsed,
    sourceFilename: filename,
    sourceRepository: BASE52_COMMON_FACE_SOURCE.repository,
    sourceCommit: BASE52_COMMON_FACE_SOURCE.commit,
    sourceLicense: BASE52_COMMON_FACE_SOURCE.license,
    assetUrl: `https://raw.githubusercontent.com/Webisso/playing-cards/${BASE52_COMMON_FACE_SOURCE.commit}/svg/${filename}`,
    runtimeFetch: true,
    candidateStage: BASE52_COMMON_FACE_SOURCE.candidateStage,
    formalAssetAccepted: false,
  });
}

export function buildBase52CommonFaceManifest(canonicalIds) {
  if (!Array.isArray(canonicalIds) || canonicalIds.length !== 52) throw new TypeError('BASE52_EXACTLY_52_REQUIRED');
  const ids = new Set();
  const semantic = new Set();
  const entries = [];
  for (const id of canonicalIds) {
    const asset = resolveBase52CommonFaceAsset(id);
    if (!asset) throw new TypeError('BASE52_CANONICAL_ID_INVALID');
    if (ids.has(asset.canonicalCardId)) throw new TypeError('BASE52_CANONICAL_ID_DUPLICATE');
    const key = `${asset.suit}:${asset.rank}`;
    if (semantic.has(key)) throw new TypeError('BASE52_RANK_SUIT_DUPLICATE');
    ids.add(asset.canonicalCardId);
    semantic.add(key);
    entries.push(asset);
  }
  for (const suit of Object.values(SUITS)) {
    for (const rank of RANKS) {
      if (!semantic.has(`${suit.name}:${rank}`)) throw new TypeError('BASE52_RANK_SUIT_COVERAGE_INCOMPLETE');
    }
  }
  return deepFreeze({
    schema: 'gameroad.base52-common-face-manifest.v1',
    source: BASE52_COMMON_FACE_SOURCE,
    count: entries.length,
    entries,
    candidateStage: BASE52_COMMON_FACE_SOURCE.candidateStage,
    formalAssetAccepted: false,
  });
}
