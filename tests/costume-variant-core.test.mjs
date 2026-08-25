import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COSTUME_VARIANT_CORE,
  createCostumeRegistry,
  createMatchCostumeSnapshot,
  resolveCostumeSelection,
  restoreMatchCostumeSnapshot,
} from '../browser/costume-variant-core.mjs';

function fixtureRegistry() {
  return createCostumeRegistry({
    manifestRevision: 'r27-test-1',
    manifestHash: 'sha256:test-manifest-1',
    characters: [
      {
        characterId: 'partner.naki',
        defaultVariantId: 'base',
        variants: [
          {
            characterId: 'partner.naki',
            costumeVariantId: 'base',
            status: 'formal',
            base: true,
            surfaces: {
              home: { status: 'formal', assetId: 'test:naki/base/home' },
              battle: { status: 'formal', assetId: 'test:naki/base/battle' },
            },
          },
          {
            characterId: 'partner.naki',
            costumeVariantId: 'cat-maid',
            status: 'candidate',
            surfaces: {
              home: { status: 'candidate', assetId: 'candidate:naki/cat-maid/home' },
              battle: { status: 'candidate', assetId: 'candidate:naki/cat-maid/battle' },
            },
          },
        ],
      },
      {
        characterId: 'partner.other',
        defaultVariantId: 'base',
        variants: [
          {
            characterId: 'partner.other',
            costumeVariantId: 'base',
            status: 'formal',
            base: true,
            surfaces: { home: { status: 'formal', assetId: 'test:other/base/home' } },
          },
          {
            characterId: 'partner.other',
            costumeVariantId: 'formal-alt',
            status: 'formal',
            surfaces: { home: { status: 'formal', assetId: 'test:other/alt/home' } },
          },
        ],
      },
    ],
  });
}

test('supports multiple characters while keeping identity and costume variant separate', () => {
  const registry = fixtureRegistry();
  const naki = resolveCostumeSelection(registry, { characterId: 'partner.naki' });
  const other = resolveCostumeSelection(registry, { characterId: 'partner.other', costumeVariantId: 'formal-alt', ownershipByCharacter: { 'partner.other': ['formal-alt'] } });

  assert.equal(naki.accepted, true);
  assert.equal(naki.characterId, 'partner.naki');
  assert.equal(naki.costumeVariantId, 'base');
  assert.equal(other.accepted, true);
  assert.equal(other.characterId, 'partner.other');
  assert.equal(other.costumeVariantId, 'formal-alt');
  assert.notEqual(naki.characterId, other.characterId);
  assert.ok(Object.isFrozen(naki));
});

test('keeps the Naki cat-maid candidate from silently becoming a production asset', () => {
  const registry = fixtureRegistry();
  const production = resolveCostumeSelection(registry, {
    characterId: 'partner.naki',
    costumeVariantId: 'cat-maid',
    ownershipByCharacter: { 'partner.naki': ['cat-maid'] },
  });
  const candidate = resolveCostumeSelection(registry, {
    characterId: 'partner.naki',
    costumeVariantId: 'cat-maid',
    ownershipByCharacter: { 'partner.naki': ['cat-maid'] },
  }, { mode: 'candidate' });

  assert.equal(production.accepted, false);
  assert.equal(production.reason, 'CANDIDATE_NOT_ELIGIBLE');
  assert.equal(candidate.accepted, true);
  assert.equal(candidate.presentation.source, 'candidate');
  assert.equal(candidate.characterId, 'partner.naki');
  assert.equal(candidate.costumeVariantId, 'cat-maid');
});

test('rejects unknown, cross-character, unowned, malformed, and in-match changes', () => {
  const registry = fixtureRegistry();

  assert.equal(resolveCostumeSelection(registry, { characterId: 'partner.unknown' }).reason, 'CHARACTER_UNKNOWN');
  assert.equal(resolveCostumeSelection(registry, {
    characterId: 'partner.naki',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.naki': ['formal-alt'] },
  }).reason, 'COSTUME_VARIANT_UNKNOWN');
  assert.equal(resolveCostumeSelection(registry, {
    characterId: 'partner.other',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.naki': ['formal-alt'] },
  }).reason, 'COSTUME_NOT_OWNED');
  assert.equal(resolveCostumeSelection(registry, {
    characterId: 'partner.other',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.other': 'formal-alt' },
  }).reason, 'OWNERSHIP_INVALID');
  assert.equal(resolveCostumeSelection(registry, {
    characterId: 'partner.other',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.other': ['formal-alt'] },
  }, { phase: 'match' }).reason, 'MATCH_COSTUME_CHANGE_REJECTED');
});

test('falls back explicitly for missing surfaces without changing identity', () => {
  const registry = fixtureRegistry();
  const result = resolveCostumeSelection(registry, {
    characterId: 'partner.other',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.other': ['formal-alt'] },
  }, { surface: 'battle' });

  assert.equal(result.accepted, true);
  assert.deepEqual(result.presentation, {
    surface: 'battle',
    source: 'fallback',
    motion: 'allowed',
    reducedMotion: false,
    lowPerf: false,
  });
  assert.equal(result.characterId, 'partner.other');
  assert.equal(result.costumeVariantId, 'formal-alt');
});

test('freezes a match snapshot and restores it only against the same manifest revision/hash', () => {
  const registry = fixtureRegistry();
  const resolution = resolveCostumeSelection(registry, {
    characterId: 'partner.other',
    costumeVariantId: 'formal-alt',
    ownershipByCharacter: { 'partner.other': ['formal-alt'] },
  });
  const snapshot = createMatchCostumeSnapshot(resolution);
  const restored = restoreMatchCostumeSnapshot(registry, snapshot);

  assert.equal(snapshot.locked, true);
  assert.equal(restored.accepted, true);
  assert.equal(restored.characterId, 'partner.other');
  assert.equal(restored.costumeVariantId, 'formal-alt');
  assert.equal(restoreMatchCostumeSnapshot({ ...registry, manifestHash: 'sha256:changed' }, snapshot).reason, 'MANIFEST_REVISION_MISMATCH');
  assert.ok(Object.isFrozen(snapshot));
});

test('reduced motion and low performance change presentation only', () => {
  const registry = fixtureRegistry();
  const selection = { characterId: 'partner.naki' };
  const normal = resolveCostumeSelection(registry, selection);
  const reduced = resolveCostumeSelection(registry, selection, { presentation: { reducedMotion: true } });
  const low = resolveCostumeSelection(registry, selection, { presentation: { lowPerf: true } });

  assert.equal(normal.characterId, reduced.characterId);
  assert.equal(normal.costumeVariantId, reduced.costumeVariantId);
  assert.equal(normal.manifestHash, low.manifestHash);
  assert.equal(normal.presentation.motion, 'allowed');
  assert.equal(reduced.presentation.motion, 'static_only');
  assert.equal(low.presentation.motion, 'static_only');
  assert.deepEqual(normal.presentation, { ...normal.presentation, motion: 'allowed' });
});

test('exposes a stable schema and surface vocabulary for every character manifest', () => {
  assert.equal(COSTUME_VARIANT_CORE.schema, 'gameroad.costume-variant.v1');
  assert.deepEqual(COSTUME_VARIANT_CORE.surfaces, ['home', 'costume', 'board', 'battle', 'result', 'profile']);
  assert.throws(() => createCostumeRegistry({ manifestRevision: 'r', manifestHash: 'h', characters: [{ characterId: 'partner.a', variants: [] }] }), /VARIANTS_REQUIRED/);
  assert.throws(() => createCostumeRegistry({ manifestRevision: 'r', manifestHash: 'h', characters: [{ characterId: 'partner.a', variants: [{ costumeVariantId: 'x', characterId: 'partner.b', status: 'formal' }] }] }), /VARIANT_CHARACTER_MISMATCH/);
});

