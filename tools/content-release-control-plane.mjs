import { createHash } from 'node:crypto';

export const RELEASE_SCHEMA = 'gameroad.content-release.v1';
export const STAGING_SCHEMA = 'gameroad.content-release.staging-manifest.v1';

const APPROVAL_STATES = new Set(['PENDING', 'APPROVED', 'NOT_REQUIRED_NONPROD']);
const ENVIRONMENTS = new Set(['staging', 'production']);
const LIFECYCLE_STATES = new Set(['DRAFT', 'VALIDATED', 'STAGED', 'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'ROLLED_BACK']);
const ACTIVATION_MODES = new Set(['MANUAL', 'SCHEDULED']);

export class ReleaseControlError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ReleaseControlError';
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOptionalInteger(value, field) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ReleaseControlError(`INVALID_${field.toUpperCase()}`);
  return parsed;
}

function parseJsonCell(value, field, fallback) {
  if (value === null || value === undefined || String(value).trim() === '') return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new ReleaseControlError(`INVALID_JSON_${field.toUpperCase()}`);
  }
}

function uniqueStrings(value) {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && item.trim().length > 0)
    && new Set(value).size === value.length;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deployAffectingPayload(release) {
  return {
    releaseId: release.releaseId,
    version: release.version,
    contentType: release.contentType,
    contentRefs: release.contentRefs,
    minGameVersion: release.minGameVersion,
    requiredData: release.requiredData,
    optionalMedia: release.optionalMedia,
    activation: release.activation,
    environment: release.environment,
  };
}

export function computeReleaseDigest(release) {
  return createHash('sha256').update(canonicalJson(deployAffectingPayload(release))).digest('hex');
}

export function normalizeAuthoringRow(row) {
  if (!isPlainObject(row)) throw new ReleaseControlError('AUTHORING_ROW_REQUIRED');
  const version = normalizeOptionalInteger(row.version, 'version');
  if (version === null) throw new ReleaseControlError('INVALID_VERSION');

  return Object.freeze({
    schema: RELEASE_SCHEMA,
    releaseId: String(row.releaseId ?? '').trim(),
    version,
    contentType: String(row.contentType ?? '').trim(),
    contentRefs: parseJsonCell(row.contentRefsJson, 'contentRefsJson', []),
    minGameVersion: String(row.minGameVersion ?? '').trim(),
    requiredData: parseJsonCell(row.requiredDataJson, 'requiredDataJson', {}),
    optionalMedia: parseJsonCell(row.optionalMediaJson, 'optionalMediaJson', []),
    activation: Object.freeze({
      mode: String(row.activationMode ?? 'MANUAL').trim() || 'MANUAL',
      startsAtJST: String(row.startsAtJST ?? '').trim() || null,
      endsAtJST: String(row.endsAtJST ?? '').trim() || null,
      audience: String(row.audience ?? '').trim(),
    }),
    approvalState: String(row.approvalState ?? 'PENDING').trim() || 'PENDING',
    previousGoodVersion: normalizeOptionalInteger(row.previousGoodVersion, 'previousGoodVersion'),
    rollbackTarget: normalizeOptionalInteger(row.rollbackTarget, 'rollbackTarget'),
    provenance: String(row.provenance ?? '').trim(),
    changeReason: String(row.changeReason ?? '').trim(),
    environment: String(row.environment ?? 'staging').trim() || 'staging',
    lifecycleState: String(row.lifecycleState ?? 'DRAFT').trim() || 'DRAFT',
  });
}

export function validateReleasePackage(release) {
  const errors = [];
  if (!isPlainObject(release)) return { ok: false, errors: ['RELEASE_OBJECT_REQUIRED'], stagedDigest: null };
  if (release.schema !== RELEASE_SCHEMA) errors.push('SCHEMA_MISMATCH');
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(release.releaseId ?? '')) errors.push('INVALID_RELEASE_ID');
  if (!Number.isInteger(release.version) || release.version < 1) errors.push('INVALID_VERSION');
  if (typeof release.contentType !== 'string' || release.contentType.length === 0) errors.push('CONTENT_TYPE_REQUIRED');
  if (!uniqueStrings(release.contentRefs) || release.contentRefs.length === 0) errors.push('CONTENT_REFS_INVALID');
  if (typeof release.minGameVersion !== 'string' || release.minGameVersion.length === 0) errors.push('MIN_GAME_VERSION_REQUIRED');
  if (!isPlainObject(release.requiredData)) errors.push('REQUIRED_DATA_INVALID');
  if (!uniqueStrings(release.optionalMedia)) errors.push('OPTIONAL_MEDIA_INVALID');
  if (!isPlainObject(release.activation)) {
    errors.push('ACTIVATION_INVALID');
  } else {
    if (!ACTIVATION_MODES.has(release.activation.mode)) errors.push('ACTIVATION_MODE_INVALID');
    if (typeof release.activation.audience !== 'string' || release.activation.audience.length === 0) errors.push('AUDIENCE_REQUIRED');
    if (release.activation.mode === 'SCHEDULED' && !release.activation.startsAtJST) errors.push('SCHEDULE_START_REQUIRED');
    if (release.activation.startsAtJST && release.activation.endsAtJST) {
      const start = Date.parse(release.activation.startsAtJST.replace(' JST', '+09:00').replace(' ', 'T'));
      const end = Date.parse(release.activation.endsAtJST.replace(' JST', '+09:00').replace(' ', 'T'));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push('SCHEDULE_RANGE_INVALID');
    }
  }
  if (!APPROVAL_STATES.has(release.approvalState)) errors.push('APPROVAL_STATE_INVALID');
  if (!ENVIRONMENTS.has(release.environment)) errors.push('ENVIRONMENT_INVALID');
  if (!LIFECYCLE_STATES.has(release.lifecycleState)) errors.push('LIFECYCLE_STATE_INVALID');
  if (typeof release.provenance !== 'string' || release.provenance.length === 0) errors.push('PROVENANCE_REQUIRED');
  if (typeof release.changeReason !== 'string' || release.changeReason.length === 0) errors.push('CHANGE_REASON_REQUIRED');
  if (release.rollbackTarget !== null && release.previousGoodVersion === null) errors.push('ROLLBACK_WITHOUT_PREVIOUS_GOOD');
  if (release.rollbackTarget !== null && release.rollbackTarget !== release.previousGoodVersion) errors.push('ROLLBACK_TARGET_MISMATCH');
  if (release.environment === 'production' && release.approvalState !== 'APPROVED') errors.push('PRODUCTION_REQUIRES_APPROVAL');

  let stagedDigest = null;
  if (errors.length === 0) stagedDigest = computeReleaseDigest(release);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), stagedDigest });
}

export function createStagingManifest(release) {
  const validation = validateReleasePackage(release);
  if (!validation.ok) throw new ReleaseControlError('RELEASE_VALIDATION_FAILED', validation.errors.join(','));
  if (release.environment !== 'staging') throw new ReleaseControlError('PRODUCTION_ACTIVATION_FORBIDDEN_V1');

  return Object.freeze({
    schema: STAGING_SCHEMA,
    releaseId: release.releaseId,
    version: release.version,
    contentType: release.contentType,
    candidateDigest: validation.stagedDigest,
    lifecycleState: 'STAGED',
    approvalState: release.approvalState,
    previousGoodVersion: release.previousGoodVersion,
    rollbackTarget: release.rollbackTarget,
    candidate: release,
  });
}

export function createEmptyReleaseState() {
  return Object.freeze({
    active: null,
    previousGood: null,
    seenVersions: Object.freeze({}),
    history: Object.freeze([]),
  });
}

function identityFromManifest(manifest) {
  return Object.freeze({
    releaseId: manifest.releaseId,
    version: manifest.version,
    digest: manifest.candidateDigest,
    contentType: manifest.contentType,
  });
}

export function assertCandidateCanActivate(manifest, state) {
  if (!isPlainObject(manifest) || manifest.schema !== STAGING_SCHEMA) throw new ReleaseControlError('STAGING_MANIFEST_REQUIRED');
  if (!isPlainObject(state)) throw new ReleaseControlError('RELEASE_STATE_REQUIRED');
  if (manifest.candidate?.environment !== 'staging') throw new ReleaseControlError('PRODUCTION_ACTIVATION_FORBIDDEN_V1');

  const active = state.active;
  const key = `${manifest.releaseId}@${manifest.version}`;
  const knownDigest = state.seenVersions?.[key] ?? null;

  if (active && active.releaseId === manifest.releaseId) {
    if (manifest.version < active.version) throw new ReleaseControlError('STALE_VERSION');
    if (manifest.version === active.version) {
      if (manifest.candidateDigest !== active.digest) throw new ReleaseControlError('SAME_VERSION_DIFFERENT_CONTENT');
      throw new ReleaseControlError('DOUBLE_ACTIVATION');
    }
  }

  if (knownDigest !== null) {
    if (knownDigest !== manifest.candidateDigest) throw new ReleaseControlError('SAME_VERSION_DIFFERENT_CONTENT');
    throw new ReleaseControlError('VERSION_ALREADY_USED');
  }

  if (manifest.previousGoodVersion !== null) {
    if (!active || active.releaseId !== manifest.releaseId || active.version !== manifest.previousGoodVersion) {
      throw new ReleaseControlError('PREVIOUS_GOOD_VERSION_MISMATCH');
    }
  }

  return true;
}

export function activateStagingManifest(manifest, state = createEmptyReleaseState()) {
  assertCandidateCanActivate(manifest, state);
  const nextActive = identityFromManifest(manifest);
  const key = `${manifest.releaseId}@${manifest.version}`;
  return Object.freeze({
    active: nextActive,
    previousGood: state.active,
    seenVersions: Object.freeze({ ...(state.seenVersions ?? {}), [key]: manifest.candidateDigest }),
    history: Object.freeze([
      ...(state.history ?? []),
      Object.freeze({ event: 'ACTIVATE_NONPROD', releaseId: manifest.releaseId, version: manifest.version, digest: manifest.candidateDigest }),
    ]),
  });
}

export function rollbackToPreviousGood(state) {
  if (!isPlainObject(state) || !state.active) throw new ReleaseControlError('ACTIVE_RELEASE_REQUIRED');
  if (!state.previousGood) throw new ReleaseControlError('PREVIOUS_GOOD_REQUIRED');
  const rolledBackFrom = state.active;
  return Object.freeze({
    active: state.previousGood,
    previousGood: null,
    seenVersions: Object.freeze({ ...(state.seenVersions ?? {}) }),
    history: Object.freeze([
      ...(state.history ?? []),
      Object.freeze({
        event: 'ROLLBACK_NONPROD',
        fromReleaseId: rolledBackFrom.releaseId,
        fromVersion: rolledBackFrom.version,
        toReleaseId: state.previousGood.releaseId,
        toVersion: state.previousGood.version,
      }),
    ]),
  });
}
