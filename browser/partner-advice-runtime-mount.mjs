import {
  selectPartnerLegalCandidate,
  selectPartnerManifestOrRuleCandidate,
} from './partner-legal-action-adapter.mjs';

const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);

function exactVersionTuple(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of VERSION_KEYS) {
    const token = value[key];
    if (typeof token !== 'string' || !token || token.trim() !== token || token.length > 96) return null;
    out[key] = token;
  }
  return Object.freeze(out);
}

function preservePublicPayload(result, candidates) {
  if (!result?.ok || !result.selected) return result;
  const id = String(result.selected.candidateId || '');
  const raw = (candidates || []).find((candidate) =>
    String(candidate?.candidateId || '') === id && candidate?.publicScope === true,
  );
  if (!raw) return result;
  return Object.freeze({
    ...result,
    selected: Object.freeze({ ...result.selected, payload: raw.payload }),
  });
}

export function createPartnerAdviceReplayBridge({
  legacyReplay,
  getVersions = () => null,
  getManifest = () => null,
  getRuntimeState = () => null,
} = {}) {
  if (typeof legacyReplay !== 'function') throw new TypeError('legacyReplay must be a function');

  return function partnerAdviceReplay(candidates, rule) {
    const fallback = () => legacyReplay({ rule, candidates });
    const versions = exactVersionTuple(getVersions());
    if (!versions) return fallback();

    try {
      const manifest = getManifest();
      const result = manifest
        ? selectPartnerManifestOrRuleCandidate({
            candidates,
            rule,
            sourceVersions: versions,
            targetVersions: versions,
            manifest,
            runtimeState: getRuntimeState(),
          })
        : selectPartnerLegalCandidate({
            candidates,
            rule,
            sourceVersions: versions,
            targetVersions: versions,
          });

      if (!result?.ok) return fallback();
      return preservePublicPayload(result, candidates);
    } catch {
      return fallback();
    }
  };
}

export function createPartnerAdviceRuntimeControl({ onChange } = {}) {
  let versions = null;
  let manifest = null;
  let runtimeStateProvider = null;
  const changed = () => { if (typeof onChange === 'function') onChange(); };

  return Object.freeze({
    setVersions(next) {
      const parsed = exactVersionTuple(next);
      if (!parsed) return false;
      versions = parsed;
      changed();
      return true;
    },
    setManifest(next) {
      if (!next || typeof next !== 'object' || Array.isArray(next)) return false;
      manifest = next;
      changed();
      return true;
    },
    setRuntimeStateProvider(next) {
      if (next !== null && typeof next !== 'function') return false;
      runtimeStateProvider = next;
      changed();
      return true;
    },
    clearManifest() {
      manifest = null;
      changed();
    },
    getVersions: () => versions,
    getManifest: () => manifest,
    getRuntimeState: () => (runtimeStateProvider ? runtimeStateProvider() : null),
    status: () => Object.freeze({
      versionReady: Boolean(versions),
      manifestReady: Boolean(manifest),
      runtimeStateReady: Boolean(runtimeStateProvider),
      mode: versions ? (manifest ? 'manifest-or-rule' : 'shared-rule') : 'legacy-fallback',
    }),
  });
}
