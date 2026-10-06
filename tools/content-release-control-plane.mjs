import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

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

function assertStagingManifest(manifest) {
  if (!isPlainObject(manifest) || manifest.schema !== STAGING_SCHEMA) {
    throw new ReleaseControlError('STAGING_MANIFEST_REQUIRED');
  }
  const candidate = manifest.candidate;
  const validation = validateReleasePackage(candidate);
  if (!validation.ok) throw new ReleaseControlError('RELEASE_VALIDATION_FAILED', validation.errors.join(','));
  if (candidate.environment !== 'staging') throw new ReleaseControlError('PRODUCTION_ACTIVATION_FORBIDDEN_V1');
  if (
    manifest.releaseId !== candidate.releaseId
    || manifest.version !== candidate.version
    || manifest.contentType !== candidate.contentType
    || manifest.candidateDigest !== validation.stagedDigest
    || manifest.approvalState !== candidate.approvalState
    || manifest.previousGoodVersion !== candidate.previousGoodVersion
    || manifest.rollbackTarget !== candidate.rollbackTarget
    || manifest.lifecycleState !== 'STAGED'
  ) {
    throw new ReleaseControlError('STAGING_MANIFEST_INTEGRITY_MISMATCH');
  }
  return manifest;
}

function assertReleaseIdentity(releaseId, version) {
  if (!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(releaseId ?? '')) {
    throw new ReleaseControlError('INVALID_RELEASE_ID');
  }
  if (!Number.isInteger(version) || version < 1) throw new ReleaseControlError('INVALID_VERSION');
}

function assertPersistedReleaseState(state) {
  if (
    !isPlainObject(state)
    || !Object.hasOwn(state, 'active')
    || !Object.hasOwn(state, 'previousGood')
    || !isPlainObject(state.seenVersions)
    || !Array.isArray(state.history)
  ) {
    throw new ReleaseControlError('PERSISTED_RELEASE_STATE_INVALID');
  }

  for (const pointer of [state.active, state.previousGood]) {
    if (pointer === null) continue;
    if (
      !isPlainObject(pointer)
      || typeof pointer.releaseId !== 'string'
      || !Number.isInteger(pointer.version)
      || typeof pointer.digest !== 'string'
      || !/^[0-9a-f]{64}$/.test(pointer.digest)
      || typeof pointer.contentType !== 'string'
    ) {
      throw new ReleaseControlError('PERSISTED_RELEASE_STATE_INVALID');
    }
  }

  for (const digest of Object.values(state.seenVersions)) {
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
      throw new ReleaseControlError('PERSISTED_RELEASE_STATE_INVALID');
    }
  }
  if (state.history.some((event) => !isPlainObject(event))) {
    throw new ReleaseControlError('PERSISTED_RELEASE_STATE_INVALID');
  }
  return state;
}

async function syncDirectory(directoryPath) {
  let directory;
  try {
    directory = await open(directoryPath, 'r');
    await directory.sync();
  } catch (error) {
    if (['EBADF', 'EISDIR', 'EINVAL', 'ENOTSUP'].includes(error?.code)) return;
    throw error;
  } finally {
    await directory?.close().catch(() => {});
  }
}

async function writeJsonAtomically(filePath, value) {
  const directoryPath = path.dirname(filePath);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const temporaryPath = path.join(directoryPath, `.${path.basename(filePath)}.${randomUUID()}.tmp`);
  let file;
  try {
    file = await open(temporaryPath, 'wx', 0o600);
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await file.sync();
    await file.close();
    file = null;
    await rename(temporaryPath, filePath);
    await syncDirectory(directoryPath);
  } catch (error) {
    await file?.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function withReleaseStoreLock(lockPath, operation) {
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new ReleaseControlError('RELEASE_STORE_BUSY');
    throw error;
  }

  try {
    await lock.writeFile(`${process.pid}\n`, 'utf8');
    await lock.sync();
    return await operation();
  } finally {
    await lock.close().catch(() => {});
    await rm(lockPath, { force: true });
    await syncDirectory(path.dirname(lockPath));
  }
}

async function readPersistedReleaseState(statePath) {
  let contents;
  try {
    contents = await readFile(statePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return createEmptyReleaseState();
    throw error;
  }
  let state;
  try {
    state = JSON.parse(contents);
  } catch {
    throw new ReleaseControlError('PERSISTED_RELEASE_STATE_INVALID');
  }
  return assertPersistedReleaseState(state);
}

async function readStagingManifestFile(stagingDirectory, releaseId, version) {
  assertReleaseIdentity(releaseId, version);
  const manifestPath = path.join(stagingDirectory, `${releaseId}-v${version}.json`);
  let contents;
  try {
    contents = await readFile(manifestPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') throw new ReleaseControlError('STAGING_MANIFEST_NOT_FOUND');
    throw error;
  }

  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch {
    throw new ReleaseControlError('STAGING_MANIFEST_CORRUPT');
  }
  try {
    assertStagingManifest(manifest);
  } catch (error) {
    throw new ReleaseControlError('STAGING_MANIFEST_CORRUPT', error.code ?? 'STAGING_MANIFEST_CORRUPT');
  }
  if (manifest.releaseId !== releaseId || manifest.version !== version) {
    throw new ReleaseControlError('STAGING_MANIFEST_CORRUPT');
  }
  return manifest;
}

export function createFileBackedStagingReleaseStore(rootDirectory) {
  if (typeof rootDirectory !== 'string' || rootDirectory.trim().length === 0) {
    throw new ReleaseControlError('RELEASE_STORE_ROOT_REQUIRED');
  }
  const root = path.resolve(rootDirectory);
  const stagingDirectory = path.join(root, 'staging');
  const statePath = path.join(root, 'release-state.json');
  const lockPath = path.join(root, '.release-state.lock');

  async function readState() {
    return readPersistedReleaseState(statePath);
  }

  async function stage(manifest) {
    assertStagingManifest(manifest);
    await mkdir(stagingDirectory, { recursive: true, mode: 0o700 });
    const destinationPath = path.join(stagingDirectory, `${manifest.releaseId}-v${manifest.version}.json`);
    const temporaryPath = path.join(stagingDirectory, `.manifest-${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporaryPath, 'wx', 0o600);
      await file.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      await file.sync();
      await file.close();
      file = null;
      await link(temporaryPath, destinationPath);
    } catch (error) {
      await file?.close().catch(() => {});
      await rm(temporaryPath, { force: true }).catch(() => {});
      if (error?.code === 'EEXIST') {
        throw new ReleaseControlError('STAGING_MANIFEST_ALREADY_EXISTS');
      }
      throw error;
    }
    await rm(temporaryPath, { force: true });
    await syncDirectory(stagingDirectory);

    const persisted = await readStagingManifestFile(stagingDirectory, manifest.releaseId, manifest.version);
    if (canonicalJson(persisted) !== canonicalJson(manifest)) {
      throw new ReleaseControlError('STAGING_MANIFEST_READBACK_MISMATCH');
    }
    return persisted;
  }

  async function readStaged(releaseId, version) {
    return readStagingManifestFile(stagingDirectory, releaseId, version);
  }

  async function persistStateAndReadBack(nextState) {
    await writeJsonAtomically(statePath, nextState);
    const persisted = await readPersistedReleaseState(statePath);
    if (canonicalJson(persisted) !== canonicalJson(nextState)) {
      throw new ReleaseControlError('PERSISTED_RELEASE_STATE_READBACK_MISMATCH');
    }
    return persisted;
  }

  async function activate(releaseId, version) {
    return withReleaseStoreLock(lockPath, async () => {
      const manifest = await readStagingManifestFile(stagingDirectory, releaseId, version);
      const currentState = await readPersistedReleaseState(statePath);
      const nextState = activateStagingManifest(manifest, currentState);
      return persistStateAndReadBack(nextState);
    });
  }

  async function rollback() {
    return withReleaseStoreLock(lockPath, async () => {
      const currentState = await readPersistedReleaseState(statePath);
      const nextState = rollbackToPreviousGood(currentState);
      return persistStateAndReadBack(nextState);
    });
  }

  return Object.freeze({ stage, readStaged, readState, activate, rollback });
}
