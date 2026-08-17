import { recommendFromRuntimeManifest, selectPreferredLegalAction } from '../tools/advice-collective-eval.mjs';

const PARTNER_RULES = new Set(['left', 'right', 'max', 'min']);
const VERSION_KEYS = ['rulesVersion', 'cardVersion', 'stateVersion'];
const NO_ASSET_ACTION = 'NONE';

function exactToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96 || trimmed !== value) return null;
  return value;
}

function exactVersionTuple(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const tuple = {};
  for (const key of VERSION_KEYS) {
    const token = exactToken(value[key]);
    if (!token) return null;
    tuple[key] = token;
  }
  return tuple;
}

function sameVersions(a, b) {
  return VERSION_KEYS.every((key) => a[key] === b[key]);
}

function idCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fail(error) {
  return Object.freeze({
    ok: false,
    error,
    selected: null,
    ordered: Object.freeze([]),
    next: null,
    source: 'shared-legal-action-core',
    containsPrivate: false,
  });
}

function publicCandidate(candidate) {
  return Object.freeze({
    candidateId: candidate.candidateId,
    kind: candidate.kind,
    positionOrder: candidate.positionOrder,
    comparisonValue: candidate.comparisonValue,
  });
}

function preferenceFor(rule) {
  if (rule === 'left') return (view) => -view.publicFacts.positionOrder;
  if (rule === 'right') return (view) => view.publicFacts.positionOrder;
  if (rule === 'max') return (view) => view.publicFacts.comparisonValue;
  return (view) => -view.publicFacts.comparisonValue;
}

function buildCandidateBoundary(candidates, rule, versions) {
  const rows = [];
  const byId = new Map();
  const seen = new Set();

  for (const candidate of candidates) {
    const candidateId = exactToken(candidate?.candidateId);
    if (!candidateId || seen.has(candidateId)) return { error: 'DUPLICATE_OR_MISSING_ID' };
    seen.add(candidateId);
    if (candidate?.assetAction !== NO_ASSET_ACTION) return { error: 'ASSET_ACTION_BLOCKED' };
    if (candidate?.publicScope !== true) return { error: 'HIDDEN_INFO_BLOCKED' };

    const legal = candidate?.legal === true;
    let positionOrder = null;
    let comparisonValue = null;
    if (legal) {
      positionOrder = Number(candidate?.positionOrder);
      if (!Number.isFinite(positionOrder)) return { error: 'POSITION_REQUIRED' };
      if (rule === 'max' || rule === 'min') {
        if (candidate?.comparisonValue === null || candidate?.comparisonValue === undefined || candidate?.comparisonValue === '') {
          return { error: 'COMPARISON_VALUE_UNRESOLVED' };
        }
        comparisonValue = Number(candidate.comparisonValue);
        if (!Number.isFinite(comparisonValue)) return { error: 'COMPARISON_VALUE_UNRESOLVED' };
      } else if (candidate?.comparisonValue !== null && candidate?.comparisonValue !== undefined && candidate?.comparisonValue !== '') {
        const optionalComparison = Number(candidate.comparisonValue);
        if (Number.isFinite(optionalComparison)) comparisonValue = optionalComparison;
      }
    }

    const kind = typeof candidate?.kind === 'string' && candidate.kind.length <= 64 ? candidate.kind : null;
    const sanitized = { candidateId, kind, positionOrder, comparisonValue, legal };
    rows.push(sanitized);
    byId.set(candidateId, sanitized);
  }

  const idRank = new Map([...seen].sort(idCompare).map((id, index) => [id, index]));
  const sharedCandidates = rows.map((candidate) => ({
    actionId: candidate.candidateId,
    ...versions,
    legal: candidate.legal,
    viewerSafe: true,
    stableOrder: idRank.get(candidate.candidateId),
    publicFacts: {
      kind: candidate.kind,
      positionOrder: candidate.positionOrder,
      comparisonValue: candidate.comparisonValue,
    },
  }));
  const legalCount = rows.reduce((count, candidate) => count + (candidate.legal ? 1 : 0), 0);

  return { error: null, rows, byId, sharedCandidates, legalCount };
}

export function selectPartnerLegalCandidate({
  candidates,
  rule,
  sourceVersions,
  targetVersions,
} = {}) {
  if (!PARTNER_RULES.has(rule)) return fail('UNKNOWN_RULE');
  if (!Array.isArray(candidates)) return fail('CANDIDATES_REQUIRED');

  const source = exactVersionTuple(sourceVersions);
  const target = exactVersionTuple(targetVersions);
  if (!source || !target) return fail('VERSION_REQUIRED');
  if (!sameVersions(source, target)) return fail('VERSION_MISMATCH');

  const boundary = buildCandidateBoundary(candidates, rule, source);
  if (boundary.error) return fail(boundary.error);

  const result = selectPreferredLegalAction(boundary.sharedCandidates, target, preferenceFor(rule));
  if (result.accepted.length !== boundary.legalCount) return fail('LEGAL_BOUNDARY_REJECTED');
  if (result.reason === 'invalid-preference-score') return fail('PREFERENCE_SCORE_REJECTED');

  if (!result.selected) {
    if (result.reason !== 'no-legal-candidates') return fail('LEGAL_BOUNDARY_REJECTED');
    return Object.freeze({
      ok: true,
      error: null,
      selected: null,
      ordered: Object.freeze([]),
      next: null,
      reason: 'NO_LEGAL_CANDIDATE',
      source: 'shared-legal-action-core',
      containsPrivate: false,
    });
  }

  const ordered = Object.freeze(result.scores.map((row) => row.actionId));
  const selected = boundary.byId.get(result.selected.actionId);
  if (!selected) return fail('SELECTED_ID_NOT_FOUND');
  const next = ordered.length > 1 ? ordered[1] : null;
  const reason = Object.freeze({
    left: 'LEFTMOST',
    right: 'RIGHTMOST',
    max: 'MAXIMUM',
    min: 'MINIMUM',
  })[rule];

  return Object.freeze({
    ok: true,
    error: null,
    selected: publicCandidate(selected),
    ordered,
    next,
    reason,
    source: 'shared-legal-action-core',
    containsPrivate: false,
  });
}

export function selectPartnerManifestOrRuleCandidate({
  candidates,
  rule,
  sourceVersions,
  targetVersions,
  manifest,
  runtimeState,
} = {}) {
  const fallback = selectPartnerLegalCandidate({ candidates, rule, sourceVersions, targetVersions });
  if (!fallback.ok) return Object.freeze({ ...fallback, manifestUsed: false, fallbackReason: 'HEURISTIC_BOUNDARY_FAILED' });

  const source = exactVersionTuple(sourceVersions);
  const target = exactVersionTuple(targetVersions);
  if (!source || !target || !sameVersions(source, target)) {
    return Object.freeze({ ...fallback, manifestUsed: false, fallbackReason: 'VERSION_MISMATCH' });
  }

  const boundary = buildCandidateBoundary(candidates, rule, source);
  if (boundary.error) return Object.freeze({ ...fallback, manifestUsed: false, fallbackReason: boundary.error });

  const runtime = recommendFromRuntimeManifest(manifest, runtimeState, target);
  if (!runtime.actionId) {
    return Object.freeze({
      ...fallback,
      manifestUsed: false,
      fallbackReason: String(runtime.reason || 'MANIFEST_REJECTED').toUpperCase().replaceAll('-', '_'),
      manifestSource: runtime.source,
      manifestFingerprint: runtime.fingerprint,
      manifestSupport: 0,
    });
  }

  const selected = boundary.byId.get(runtime.actionId);
  if (!selected?.legal) {
    return Object.freeze({
      ...fallback,
      manifestUsed: false,
      fallbackReason: 'MANIFEST_ACTION_NOT_CURRENTLY_LEGAL',
      manifestSource: runtime.source,
      manifestFingerprint: runtime.fingerprint,
      manifestSupport: runtime.support,
    });
  }

  const currentLegalSet = selectPreferredLegalAction(boundary.sharedCandidates, target, () => 0);
  if (currentLegalSet.accepted.length !== boundary.legalCount) {
    return Object.freeze({ ...fallback, manifestUsed: false, fallbackReason: 'LEGAL_BOUNDARY_REJECTED' });
  }
  const acceptedIds = new Set(currentLegalSet.accepted.map((candidate) => candidate.actionId));
  if (!acceptedIds.has(runtime.actionId)) {
    return Object.freeze({
      ...fallback,
      manifestUsed: false,
      fallbackReason: 'MANIFEST_ACTION_NOT_CURRENTLY_LEGAL',
      manifestSource: runtime.source,
      manifestFingerprint: runtime.fingerprint,
      manifestSupport: runtime.support,
    });
  }

  const ordered = Object.freeze([
    runtime.actionId,
    ...fallback.ordered.filter((candidateId) => candidateId !== runtime.actionId),
  ]);
  return Object.freeze({
    ok: true,
    error: null,
    selected: publicCandidate(selected),
    ordered,
    next: ordered.length > 1 ? ordered[1] : null,
    reason: 'APPROVED_RUNTIME_MANIFEST',
    source: 'approved-runtime-manifest',
    containsPrivate: false,
    manifestUsed: true,
    fallbackReason: null,
    manifestSource: runtime.source,
    manifestFingerprint: runtime.fingerprint,
    manifestSupport: runtime.support,
  });
}

export function revalidateSelectedPartnerLegalCandidate({
  selectedCandidateId,
  rule,
  selectedVersions,
  candidates,
  currentVersions,
} = {}) {
  const selectedId = exactToken(selectedCandidateId);
  if (!selectedId) return fail('SELECTED_ID_REQUIRED');
  if (!PARTNER_RULES.has(rule)) return fail('UNKNOWN_RULE');
  if (!Array.isArray(candidates)) return fail('CANDIDATES_REQUIRED');

  const selectedVersionTuple = exactVersionTuple(selectedVersions);
  const currentVersionTuple = exactVersionTuple(currentVersions);
  if (!selectedVersionTuple || !currentVersionTuple) return fail('VERSION_REQUIRED');
  if (!sameVersions(selectedVersionTuple, currentVersionTuple)) return fail('VERSION_MISMATCH');

  const boundary = buildCandidateBoundary(candidates, rule, currentVersionTuple);
  if (boundary.error) return fail(boundary.error);

  const selected = boundary.byId.get(selectedId);
  if (!selected) return fail('SELECTED_ID_NOT_FOUND');

  const currentLegalSet = selectPreferredLegalAction(
    boundary.sharedCandidates,
    currentVersionTuple,
    () => 0,
  );
  if (currentLegalSet.accepted.length !== boundary.legalCount) return fail('LEGAL_BOUNDARY_REJECTED');

  const acceptedIds = new Set(currentLegalSet.accepted.map((candidate) => candidate.actionId));
  if (!selected.legal || !acceptedIds.has(selectedId)) return fail('SELECTED_ID_NOT_LEGAL');

  return Object.freeze({
    ok: true,
    error: null,
    selected: publicCandidate(selected),
    versions: Object.freeze({ ...currentVersionTuple }),
    source: 'shared-legal-action-core',
    containsPrivate: false,
  });
}
