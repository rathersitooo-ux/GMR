import {
  selectPartnerLegalCandidate,
  selectPartnerManifestOrRuleCandidate,
} from './partner-legal-action-adapter.mjs';

const VERSION_KEYS = Object.freeze(['rulesVersion', 'cardVersion', 'stateVersion']);
const BOARD_PROJECTION_SCHEMA = 'gameroad.partner-advice-board-projection.v1';

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

function exactPresentationToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > 160) return null;
  return token;
}

function inactiveBoardProjection(reason) {
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: false,
    clear: true,
    reason,
    candidateId: null,
    targetId: null,
    alternativeCandidateId: null,
    source: null,
    presentationRole: 'partner-recommendation',
    autoExecute: false,
  });
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

export function projectPartnerAdviceBoardEmphasis({
  adviceResult,
  isCurrent,
  resolveTarget,
} = {}) {
  if (!adviceResult?.ok) return inactiveBoardProjection('ADVICE_UNAVAILABLE');
  if (adviceResult.containsPrivate !== false) return inactiveBoardProjection('PUBLIC_SCOPE_UNVERIFIED');

  const candidateId = exactPresentationToken(adviceResult.selected?.candidateId);
  if (!candidateId) return inactiveBoardProjection('NO_SELECTED_CANDIDATE');
  if (typeof isCurrent !== 'function' || typeof resolveTarget !== 'function') {
    return inactiveBoardProjection('PROJECTION_GATE_REQUIRED');
  }

  try {
    if (isCurrent(adviceResult) !== true) return inactiveBoardProjection('STALE_ADVICE');
  } catch {
    return inactiveBoardProjection('CURRENTNESS_CHECK_FAILED');
  }

  let resolvedTarget;
  try {
    resolvedTarget = resolveTarget(candidateId);
  } catch {
    return inactiveBoardProjection('TARGET_RESOLUTION_FAILED');
  }

  const targetId = exactPresentationToken(
    typeof resolvedTarget === 'string' ? resolvedTarget : resolvedTarget?.targetId,
  );
  if (!targetId) return inactiveBoardProjection('TARGET_UNMAPPED');

  const next = exactPresentationToken(adviceResult.next);
  return Object.freeze({
    schema: BOARD_PROJECTION_SCHEMA,
    active: true,
    clear: false,
    reason: null,
    candidateId,
    targetId,
    alternativeCandidateId: next && next !== candidateId ? next : null,
    source: exactPresentationToken(adviceResult.source),
    presentationRole: 'partner-recommendation',
    autoExecute: false,
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
