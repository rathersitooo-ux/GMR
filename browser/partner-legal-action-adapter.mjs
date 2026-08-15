import { selectPreferredLegalAction } from '../tools/advice-collective-eval.mjs';

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

  const rows = [];
  const byId = new Map();
  const seen = new Set();

  for (const candidate of candidates) {
    const candidateId = exactToken(candidate?.candidateId);
    if (!candidateId || seen.has(candidateId)) return fail('DUPLICATE_OR_MISSING_ID');
    seen.add(candidateId);
    if (candidate?.assetAction !== NO_ASSET_ACTION) return fail('ASSET_ACTION_BLOCKED');
    if (candidate?.publicScope !== true) return fail('HIDDEN_INFO_BLOCKED');

    const legal = candidate?.legal === true;
    let positionOrder = null;
    let comparisonValue = null;
    if (legal) {
      positionOrder = Number(candidate?.positionOrder);
      if (!Number.isFinite(positionOrder)) return fail('POSITION_REQUIRED');
      if (rule === 'max' || rule === 'min') {
        if (candidate?.comparisonValue === null || candidate?.comparisonValue === undefined || candidate?.comparisonValue === '') {
          return fail('COMPARISON_VALUE_UNRESOLVED');
        }
        comparisonValue = Number(candidate.comparisonValue);
        if (!Number.isFinite(comparisonValue)) return fail('COMPARISON_VALUE_UNRESOLVED');
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
    ...source,
    legal: candidate.legal,
    viewerSafe: true,
    stableOrder: idRank.get(candidate.candidateId),
    publicFacts: {
      kind: candidate.kind,
      positionOrder: candidate.positionOrder,
      comparisonValue: candidate.comparisonValue,
    },
  }));

  const result = selectPreferredLegalAction(sharedCandidates, target, preferenceFor(rule));
  const legalCount = rows.reduce((count, candidate) => count + (candidate.legal ? 1 : 0), 0);
  if (result.accepted.length !== legalCount) return fail('LEGAL_BOUNDARY_REJECTED');
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
  const selected = byId.get(result.selected.actionId);
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

export function revalidatePartnerLegalCandidateForExecution({
  selectedCandidateId,
  selectedVersions,
  currentCandidates,
  currentVersions,
} = {}) {
  const selectedId = exactToken(selectedCandidateId);
  if (!selectedId) return fail('SELECTED_ID_REQUIRED');

  const selectedTuple = exactVersionTuple(selectedVersions);
  const currentTuple = exactVersionTuple(currentVersions);
  if (!selectedTuple || !currentTuple) return fail('VERSION_REQUIRED');
  if (!sameVersions(selectedTuple, currentTuple)) return fail('VERSION_MISMATCH');

  const currentBoundary = selectPartnerLegalCandidate({
    candidates: currentCandidates,
    rule: 'left',
    sourceVersions: currentTuple,
    targetVersions: currentTuple,
  });
  if (!currentBoundary.ok) return fail(currentBoundary.error);

  const exactCurrent = currentCandidates.find((candidate) => candidate?.candidateId === selectedId);
  if (!exactCurrent) return fail('SELECTED_ID_NOT_FOUND');
  if (exactCurrent.legal !== true || !currentBoundary.ordered.includes(selectedId)) {
    return fail('SELECTED_NO_LONGER_LEGAL');
  }

  const exactBoundary = selectPartnerLegalCandidate({
    candidates: [exactCurrent],
    rule: 'left',
    sourceVersions: currentTuple,
    targetVersions: currentTuple,
  });
  if (!exactBoundary.ok || !exactBoundary.selected || exactBoundary.selected.candidateId !== selectedId) {
    return fail('SELECTED_NO_LONGER_LEGAL');
  }

  return Object.freeze({
    ok: true,
    error: null,
    selected: exactBoundary.selected,
    ordered: Object.freeze([selectedId]),
    next: null,
    reason: 'REVALIDATED_CURRENT_CANDIDATE',
    source: 'shared-legal-action-core',
    containsPrivate: false,
  });
}
