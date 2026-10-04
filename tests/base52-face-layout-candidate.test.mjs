import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE52_EXTERNAL_FACE_SOURCE,
  BASE52_FACE_LAYOUT_CANDIDATE,
  buildBase52FaceLayoutCandidateManifest,
  createBase52FaceLayoutCandidate,
  resolveBase52ExternalFaceAsset,
} from '../browser/base52-face-layout-candidate.mjs';

function fixtureDeck() {
  const cards = [];
  for (const suit of BASE52_FACE_LAYOUT_CANDIDATE.suits) {
    for (const rank of BASE52_FACE_LAYOUT_CANDIDATE.ranks) {
      cards.push({
        canonicalCardId: `fixture:${suit}:${rank}`,
        suit,
        rank,
      });
    }
  }
  return cards;
}

test('builds exactly one nonformal candidate entry for every caller-supplied canonical base52 card', () => {
  const manifest = buildBase52FaceLayoutCandidateManifest(fixtureDeck());

  assert.equal(manifest.count, 52);
  assert.equal(manifest.entries.length, 52);
  assert.equal(manifest.formalAssetManifest, false);
  assert.equal(manifest.canonicalIdsCallerSupplied, true);
  assert.equal(manifest.artStatus, 'NONFORMAL_CANDIDATE');
  assert.equal(new Set(manifest.entries.map(entry => entry.publicIdentity.canonicalCardId)).size, 52);
  assert.equal(new Set(manifest.entries.map(entry => `${entry.publicIdentity.suit}:${entry.publicIdentity.rank}`)).size, 52);
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.entries));
});

test('uses the same top-left rank plus suit grammar for A/J/Q/K and numbered cards without color dependence', () => {
  const samples = [
    { canonicalCardId: 'fixture:spades:A', suit: 'spades', rank: 'A' },
    { canonicalCardId: 'fixture:spades:7', suit: 'spades', rank: '7' },
    { canonicalCardId: 'fixture:spades:J', suit: 'spades', rank: 'J' },
    { canonicalCardId: 'fixture:spades:Q', suit: 'spades', rank: 'Q' },
    { canonicalCardId: 'fixture:spades:K', suit: 'spades', rank: 'K' },
  ];

  for (const card of samples) {
    const plan = createBase52FaceLayoutCandidate(card);
    assert.deepEqual(plan.cornerIndex, {
      position: 'top-left',
      primaryIdentity: true,
      rankText: card.rank,
      suitToken: card.suit,
      colorRequired: false,
    });
    assert.equal(plan.colorRequiredForIdentity, false);
    assert.equal(plan.grayscaleIdentityPreserved, true);
  }
});

test('face-down plans leak no canonical id, rank, or suit from the caller card', () => {
  const card = { canonicalCardId: 'secret-id-with-rank-A', suit: 'hearts', rank: 'A' };
  const plan = createBase52FaceLayoutCandidate(card, { faceDown: true });
  const encoded = JSON.stringify(plan);

  assert.equal(plan.face, 'back');
  assert.equal(plan.publicIdentity, null);
  assert.equal(plan.cornerIndex, null);
  assert.equal(plan.externalFaceAsset, null);
  assert.equal(plan.secretFaceLeakage, false);
  assert.equal(encoded.includes(card.canonicalCardId), false);
  assert.equal(encoded.includes(card.suit), false);
  assert.equal(encoded.includes(`\"rank\":\"${card.rank}\"`), false);
});

test('reduced-motion and low-performance modes preserve the same primary identity and only simplify center detail', () => {
  const card = { canonicalCardId: 'fixture:diamonds:10', suit: 'diamonds', rank: '10' };
  const normal = createBase52FaceLayoutCandidate(card);
  const reduced = createBase52FaceLayoutCandidate(card, { reducedMotion: true });
  const lowPerf = createBase52FaceLayoutCandidate(card, { lowPerf: true });

  for (const degraded of [reduced, lowPerf]) {
    assert.deepEqual(degraded.publicIdentity, normal.publicIdentity);
    assert.deepEqual(degraded.cornerIndex, normal.cornerIndex);
    assert.equal(degraded.centerDetail, 'minimal');
    assert.equal(degraded.grayscaleIdentityPreserved, true);
  }
  assert.equal(normal.centerDetail, 'candidate');
});

test('fails closed on malformed cards, duplicate ids, duplicate rank-suit pairs, and non-52 input', () => {
  assert.throws(() => createBase52FaceLayoutCandidate(null), /CARD_REQUIRED/);
  assert.throws(() => createBase52FaceLayoutCandidate({ canonicalCardId: '', suit: 'clubs', rank: 'A' }), /CANONICAL_CARD_ID_REQUIRED/);
  assert.throws(() => createBase52FaceLayoutCandidate({ canonicalCardId: 'x', suit: 'stars', rank: 'A' }), /SUIT_INVALID/);
  assert.throws(() => createBase52FaceLayoutCandidate({ canonicalCardId: 'x', suit: 'clubs', rank: '1' }), /RANK_INVALID/);
  assert.throws(() => buildBase52FaceLayoutCandidateManifest(fixtureDeck().slice(0, 51)), /BASE52_EXACTLY_52_REQUIRED/);

  const duplicateId = fixtureDeck();
  duplicateId[1] = { ...duplicateId[1], canonicalCardId: duplicateId[0].canonicalCardId };
  assert.throws(() => buildBase52FaceLayoutCandidateManifest(duplicateId), /CANONICAL_CARD_ID_DUPLICATE/);

  const duplicatePair = fixtureDeck();
  duplicatePair[1] = { ...duplicatePair[1], suit: duplicatePair[0].suit, rank: duplicatePair[0].rank };
  assert.throws(() => buildBase52FaceLayoutCandidateManifest(duplicatePair), /RANK_SUIT_PAIR_DUPLICATE/);
});

test('does not claim formal art, product mount, actual-use measurement, Human direction, or a fabricated occlusion threshold', () => {
  const manifest = buildBase52FaceLayoutCandidateManifest(fixtureDeck(), { lowPerf: true });

  assert.equal(BASE52_FACE_LAYOUT_CANDIDATE.formalAssetManifest, false);
  assert.equal(BASE52_FACE_LAYOUT_CANDIDATE.fixedOcclusionThreshold, null);
  assert.deepEqual(manifest.acceptanceBoundary, {
    actualUseSiteMeasured: false,
    humanFormalDirectionAccepted: false,
    formalCommonFaceAssetConnected: false,
    productMounted: false,
  });
  for (const entry of manifest.entries) {
    assert.equal(entry.artStatus, 'NONFORMAL_CANDIDATE');
    assert.equal(entry.formalAssetId, null);
    assert.equal(entry.acceptanceBoundary.actualUseSiteMeasured, false);
    assert.equal(entry.acceptanceBoundary.humanFormalDirectionAccepted, false);
    assert.equal(entry.acceptanceBoundary.productMounted, false);
  }
});

test('does not mutate caller-supplied card registry or preferences', () => {
  const cards = fixtureDeck();
  const prefs = { reducedMotion: true, lowPerf: false };
  const beforeCards = structuredClone(cards);
  const beforePrefs = structuredClone(prefs);

  buildBase52FaceLayoutCandidateManifest(cards, prefs);

  assert.deepEqual(cards, beforeCards);
  assert.deepEqual(prefs, beforePrefs);
});


test('maps all 52 canonical rank-suit pairs to one pinned external SVG donor without generated placeholders', () => {
  const manifest = buildBase52FaceLayoutCandidateManifest(fixtureDeck());

  assert.equal(manifest.externalFaceCoverage, 52);
  assert.equal(new Set(manifest.entries.map(entry => entry.externalFaceAsset.sourceUrl)).size, 52);
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.disposition, 'REUSE_COMPOSE');
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.directUseCandidate.repository, 'Webisso/playing-cards');
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.directUseCandidate.commit, '50a3f7be7d6b7248da5f5c56533e1c5414aefb40');
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.directUseCandidate.license, 'MIT');
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.generatedFromModelDefaults, false);
  assert.equal(BASE52_FACE_LAYOUT_CANDIDATE.generatedPlaceholderAllowed, false);
  assert.equal(BASE52_FACE_LAYOUT_CANDIDATE.codeDrawnFormalFaceAllowed, false);
  for (const entry of manifest.entries) {
    assert.equal(entry.externalFaceAsset.generatedFromModelDefaults, false);
    assert.equal(entry.externalFaceAsset.formalAssetAccepted, false);
    assert.match(entry.externalFaceAsset.sourceUrl, /^https:\/\/raw\.githubusercontent\.com\/Webisso\/playing-cards\/50a3f7be7d6b7248da5f5c56533e1c5414aefb40\/svg\/.+\.svg$/);
  }
});

test('uses predictable donor filenames for number and court cards while keeping caller canonical ids authoritative', () => {
  const cases = [
    [{ canonicalCardId: 'fixture:spades:A', suit: 'spades', rank: 'A' }, 'ace_of_spades.svg'],
    [{ canonicalCardId: 'fixture:hearts:10', suit: 'hearts', rank: '10' }, '10_of_hearts.svg'],
    [{ canonicalCardId: 'fixture:diamonds:Q', suit: 'diamonds', rank: 'Q' }, 'queen_of_diamonds.svg'],
    [{ canonicalCardId: 'fixture:clubs:K', suit: 'clubs', rank: 'K' }, 'king_of_clubs.svg'],
  ];

  for (const [card, filename] of cases) {
    const asset = resolveBase52ExternalFaceAsset(card);
    assert.equal(asset.canonicalCardId, card.canonicalCardId);
    assert.equal(asset.sourceFilename, filename);
    assert.ok(asset.sourceUrl.endsWith('/svg/' + filename));
  }
});

test('records external accessibility and rights references without promoting them to formal GAMEROAD art', () => {
  const refs = BASE52_EXTERNAL_FACE_SOURCE.readabilityReferences;

  assert.ok(refs.some(ref => ref.repository === 'saulspatz/SVGCards' && ref.license === 'public-domain'));
  assert.ok(refs.some(ref => ref.repository === 'AustinGabriel/Public-Domain-and-CC0-Playing-Cards' && ref.license === 'CC0/public-domain'));
  assert.ok(refs.some(ref => ref.product === 'Balatro'));
  assert.equal(BASE52_EXTERNAL_FACE_SOURCE.formalAssetAccepted, false);

  const plan = createBase52FaceLayoutCandidate({ canonicalCardId: 'fixture:clubs:2', suit: 'clubs', rank: '2' }, { lowPerf: true });
  assert.equal(plan.externalFacePolicy.generatedPlaceholderAllowed, false);
  assert.equal(plan.externalFacePolicy.codeDrawnFormalFaceAllowed, false);
  assert.equal(plan.externalFacePolicy.identityFallback, 'corner-index');
  assert.equal(plan.externalFacePolicy.lowPerfCenterArtOptional, true);
});
