const SCHEMA = 'gameroad.costume-variant.v1';
const ASSET_STATUSES = Object.freeze(['formal', 'candidate', 'missing']);
const SURFACES = Object.freeze(['home', 'costume', 'board', 'battle', 'result', 'profile']);

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function cloneJson(value) {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('NON_JSON_VALUE');
  return JSON.parse(encoded);
}

function fail(reason, extra = {}) {
  return deepFreeze({ accepted: false, reason, ...extra });
}

function normalizePreferences(preferences) {
  const source = plainObject(preferences) ? preferences : {};
  return deepFreeze({
    reducedMotion: source.reducedMotion === true,
    lowPerf: source.lowPerf === true,
  });
}

function normalizeAsset(asset) {
  if (!plainObject(asset) || !ASSET_STATUSES.includes(asset.status)) {
    return deepFreeze({ status: 'missing' });
  }
  if ((asset.status === 'formal' || asset.status === 'candidate') && !nonEmptyString(asset.assetId)) {
    return deepFreeze({ status: 'missing' });
  }
  return deepFreeze({
    status: asset.status,
    ...(nonEmptyString(asset.assetId) ? { assetId: asset.assetId } : {}),
  });
}

function normalizeSurfaces(surfaces) {
  if (surfaces === undefined) return deepFreeze({});
  if (!plainObject(surfaces)) throw new TypeError('SURFACES_INVALID');
  const normalized = {};
  for (const [surface, asset] of Object.entries(surfaces)) {
    if (!SURFACES.includes(surface)) throw new TypeError('SURFACE_INVALID');
    normalized[surface] = normalizeAsset(asset);
  }
  return deepFreeze(normalized);
}

function normalizeVariant(characterId, variant) {
  if (!plainObject(variant)) throw new TypeError('VARIANT_INVALID');
  if (!nonEmptyString(variant.costumeVariantId)) throw new TypeError('COSTUME_VARIANT_ID_REQUIRED');
  if (variant.characterId !== undefined && variant.characterId !== characterId) {
    throw new TypeError('VARIANT_CHARACTER_MISMATCH');
  }
  if (!['formal', 'candidate'].includes(variant.status)) throw new TypeError('VARIANT_STATUS_INVALID');
  return deepFreeze({
    characterId,
    costumeVariantId: variant.costumeVariantId,
    status: variant.status,
    base: variant.base === true,
    surfaces: normalizeSurfaces(variant.surfaces),
  });
}

function normalizeCharacterManifest(manifest) {
  if (!plainObject(manifest)) throw new TypeError('CHARACTER_MANIFEST_INVALID');
  if (!nonEmptyString(manifest.characterId)) throw new TypeError('CHARACTER_ID_REQUIRED');
  if (!Array.isArray(manifest.variants) || manifest.variants.length === 0) {
    throw new TypeError('VARIANTS_REQUIRED');
  }
  const variants = manifest.variants.map((variant) => normalizeVariant(manifest.characterId, variant));
  const variantIds = variants.map((variant) => variant.costumeVariantId);
  if (new Set(variantIds).size !== variantIds.length) throw new TypeError('DUPLICATE_COSTUME_VARIANT_ID');
  const defaultVariantId = manifest.defaultVariantId ?? variants.find((variant) => variant.base)?.costumeVariantId;
  if (!nonEmptyString(defaultVariantId) || !variantIds.includes(defaultVariantId)) {
    throw new TypeError('DEFAULT_VARIANT_INVALID');
  }
  if (variants.filter((variant) => variant.base).length > 1) throw new TypeError('MULTIPLE_BASE_VARIANTS');
  return deepFreeze({
    characterId: manifest.characterId,
    defaultVariantId,
    variants,
  });
}

function indexRegistry(registry) {
  const characters = new Map(registry.characters.map((manifest) => [manifest.characterId, manifest]));
  return characters;
}

function normalizeOwnership(ownershipByCharacter, characterId) {
  if (ownershipByCharacter === undefined) return new Set();
  if (!plainObject(ownershipByCharacter)) return null;
  const selected = ownershipByCharacter[characterId];
  if (selected === undefined) return new Set();
  if (!Array.isArray(selected) || selected.some((value) => !nonEmptyString(value))) return null;
  return new Set(selected);
}

function surfacePlan(variant, surface, mode, preferences) {
  const asset = variant.surfaces[surface] ?? { status: 'missing' };
  const source = asset.status === 'formal'
    ? 'formal'
    : asset.status === 'candidate' && mode === 'candidate'
      ? 'candidate'
      : 'fallback';
  return deepFreeze({
    surface,
    source,
    ...(source !== 'fallback' ? { assetId: asset.assetId } : {}),
    motion: preferences.reducedMotion || preferences.lowPerf ? 'static_only' : 'allowed',
    reducedMotion: preferences.reducedMotion,
    lowPerf: preferences.lowPerf,
  });
}

function assertRegistry(registry) {
  if (!plainObject(registry) || registry.schema !== SCHEMA || !Array.isArray(registry.characters)) {
    return false;
  }
  return nonEmptyString(registry.manifestRevision) && nonEmptyString(registry.manifestHash);
}

export function createCostumeRegistry({ manifestRevision, manifestHash, characters } = {}) {
  if (!nonEmptyString(manifestRevision)) throw new TypeError('MANIFEST_REVISION_REQUIRED');
  if (!nonEmptyString(manifestHash)) throw new TypeError('MANIFEST_HASH_REQUIRED');
  if (!Array.isArray(characters) || characters.length === 0) throw new TypeError('CHARACTERS_REQUIRED');
  const normalizedCharacters = characters.map(normalizeCharacterManifest);
  const characterIds = normalizedCharacters.map((character) => character.characterId);
  if (new Set(characterIds).size !== characterIds.length) throw new TypeError('DUPLICATE_CHARACTER_ID');
  return deepFreeze({
    schema: SCHEMA,
    manifestRevision,
    manifestHash,
    surfaces: SURFACES,
    characters: normalizedCharacters,
  });
}

export function resolveCostumeSelection(registry, selection, {
  mode = 'production',
  surface = 'home',
  phase = 'lobby',
  presentation = {},
} = {}) {
  if (!assertRegistry(registry)) return fail('REGISTRY_INVALID');
  if (!plainObject(selection) || !nonEmptyString(selection.characterId)) return fail('SELECTION_INVALID');
  if (!SURFACES.includes(surface)) return fail('SURFACE_INVALID');
  if (!['production', 'candidate'].includes(mode)) return fail('MODE_INVALID');
  if (!['lobby', 'match'].includes(phase)) return fail('PHASE_INVALID');
  const characters = indexRegistry(registry);
  const character = characters.get(selection.characterId);
  if (!character) return fail('CHARACTER_UNKNOWN');
  if (phase === 'match') return fail('MATCH_COSTUME_CHANGE_REJECTED');

  const costumeVariantId = selection.costumeVariantId ?? character.defaultVariantId;
  if (!nonEmptyString(costumeVariantId)) return fail('COSTUME_VARIANT_ID_REQUIRED');
  const variant = character.variants.find((candidate) => candidate.costumeVariantId === costumeVariantId);
  if (!variant) return fail('COSTUME_VARIANT_UNKNOWN');
  if (variant.characterId !== selection.characterId) return fail('VARIANT_CHARACTER_MISMATCH');
  if (variant.status === 'candidate' && mode === 'production') return fail('CANDIDATE_NOT_ELIGIBLE');

  const ownership = normalizeOwnership(selection.ownershipByCharacter, selection.characterId);
  if (!ownership) return fail('OWNERSHIP_INVALID');
  if (!variant.base && !ownership.has(costumeVariantId)) return fail('COSTUME_NOT_OWNED');

  const preferences = normalizePreferences(presentation);
  return deepFreeze({
    accepted: true,
    reason: 'OK',
    characterId: selection.characterId,
    costumeVariantId,
    variantStatus: variant.status,
    manifestRevision: registry.manifestRevision,
    manifestHash: registry.manifestHash,
    presentation: surfacePlan(variant, surface, mode, preferences),
  });
}

export function createMatchCostumeSnapshot(resolution) {
  if (!plainObject(resolution) || resolution.accepted !== true) {
    return fail('RESOLUTION_INVALID');
  }
  return deepFreeze({
    schema: SCHEMA,
    locked: true,
    characterId: resolution.characterId,
    costumeVariantId: resolution.costumeVariantId,
    manifestRevision: resolution.manifestRevision,
    manifestHash: resolution.manifestHash,
  });
}

export function restoreMatchCostumeSnapshot(registry, snapshot, {
  surface = 'battle',
  presentation = {},
} = {}) {
  if (!plainObject(snapshot) || snapshot.schema !== SCHEMA || snapshot.locked !== true) {
    return fail('SNAPSHOT_INVALID');
  }
  if (snapshot.manifestRevision !== registry?.manifestRevision || snapshot.manifestHash !== registry?.manifestHash) {
    return fail('MANIFEST_REVISION_MISMATCH');
  }
  return resolveCostumeSelection(registry, {
    characterId: snapshot.characterId,
    costumeVariantId: snapshot.costumeVariantId,
    ownershipByCharacter: { [snapshot.characterId]: [snapshot.costumeVariantId] },
  }, { mode: 'production', surface, phase: 'lobby', presentation });
}

export const COSTUME_VARIANT_CORE = Object.freeze({
  schema: SCHEMA,
  assetStatuses: ASSET_STATUSES,
  surfaces: SURFACES,
});

