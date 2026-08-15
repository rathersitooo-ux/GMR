const REQUIRED_STATE_KEYS = ['phase', 'turnBand', 'pressureBand', 'manaBand', 'handBand'];
const DEFAULT_ALLOWED_LABEL_SOURCES = new Set(['human', 'formal-evaluator', 'benchmark-approved']);
const RUNTIME_MANIFEST_SCHEMA = 'gameroad.partner-advice-runtime-manifest.v1';

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 96) return null;
  return trimmed;
}

function sameVersions(a, b) {
  return ['rulesVersion', 'cardVersion', 'stateVersion'].every((key) => safeToken(a?.[key]) && a[key] === b?.[key]);
}

export function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const normalized = {};
  for (const key of REQUIRED_STATE_KEYS) {
    const token = safeToken(state[key]);
    if (!token) return null;
    normalized[key] = token;
  }
  return normalized;
}

export function stateFingerprint(state, versions) {
  const normalized = normalizeState(state);
  if (!normalized) return null;
  const rulesVersion = safeToken(versions?.rulesVersion);
  const cardVersion = safeToken(versions?.cardVersion);
  const stateVersion = safeToken(versions?.stateVersion);
  if (!rulesVersion || !cardVersion || !stateVersion) return null;
  return [
    `rules=${rulesVersion}`,
    `cards=${cardVersion}`,
    `state=${stateVersion}`,
    ...REQUIRED_STATE_KEYS.map((key) => `${key}=${normalized[key]}`),
  ].join('|');
}

export function eventEligibility(event, targetVersions, options = {}) {
  const allowedLabelSources = options.allowedLabelSources ?? DEFAULT_ALLOWED_LABEL_SOURCES;
  const reasons = [];
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { eligible: false, reasons: ['invalid-event'] };
  if (event.humanGate !== 'approved') reasons.push('human-gate-not-approved');
  if (event.privacyScope !== 'shared') reasons.push('privacy-not-shared');
  if (event.containsPrivate === true) reasons.push('private-data-present');
  if (event.missing === true) reasons.push('required-data-missing');
  if (!allowedLabelSources.has(event.labelSource)) reasons.push('label-source-not-approved');

  for (const key of ['rulesVersion', 'cardVersion', 'stateVersion']) {
    if (!safeToken(event[key]) || event[key] !== targetVersions?.[key]) reasons.push(`${key}-mismatch`);
  }

  if (!safeToken(event.actionId)) reasons.push('invalid-action-id');
  if (!normalizeState(event.state)) reasons.push('invalid-state');
  const reward = Number(event.reward);
  if (!Number.isFinite(reward) || reward < 0 || reward > 1) reasons.push('invalid-reward');
  const regret = Number(event.regret ?? 0);
  if (!Number.isFinite(regret) || regret < 0 || regret > 1) reasons.push('invalid-regret');
  return { eligible: reasons.length === 0, reasons };
}

function blankActionStats() {
  return { count: 0, rewardSum: 0, regretSum: 0 };
}

function addActionStat(map, actionId, reward, regret) {
  const stats = map.get(actionId) ?? blankActionStats();
  stats.count += 1;
  stats.rewardSum += reward;
  stats.regretSum += regret;
  map.set(actionId, stats);
}

function actionScore(stats, regretPenalty) {
  if (!stats || stats.count <= 0) return Number.NEGATIVE_INFINITY;
  const smoothedReward = (stats.rewardSum + 1) / (stats.count + 2);
  const meanRegret = stats.regretSum / stats.count;
  return smoothedReward - regretPenalty * meanRegret;
}

function bestAction(actionMap, regretPenalty) {
  const ranked = [...actionMap.entries()].map(([actionId, stats]) => ({
    actionId,
    count: stats.count,
    meanReward: stats.rewardSum / stats.count,
    meanRegret: stats.regretSum / stats.count,
    score: actionScore(stats, regretPenalty),
  }));
  ranked.sort((a, b) => b.score - a.score || b.count - a.count || a.actionId.localeCompare(b.actionId));
  return ranked[0] ?? null;
}

export function trainCollectiveMemory(events, targetVersions, options = {}) {
  const regretPenalty = finiteNumber(options.regretPenalty, 0.35);
  const contexts = new Map();
  const global = new Map();
  const rejected = new Map();
  let eligibleCount = 0;

  for (const event of events ?? []) {
    const eligibility = eventEligibility(event, targetVersions, options);
    if (!eligibility.eligible) {
      for (const reason of eligibility.reasons) rejected.set(reason, (rejected.get(reason) ?? 0) + 1);
      continue;
    }
    const fingerprint = stateFingerprint(event.state, targetVersions);
    const context = contexts.get(fingerprint) ?? new Map();
    const reward = Number(event.reward);
    const regret = Number(event.regret ?? 0);
    addActionStat(context, event.actionId, reward, regret);
    addActionStat(global, event.actionId, reward, regret);
    contexts.set(fingerprint, context);
    eligibleCount += 1;
  }

  return {
    targetVersions: { ...targetVersions },
    contexts,
    global,
    eligibleCount,
    rejected: Object.fromEntries([...rejected.entries()].sort()),
    regretPenalty,
    provisional: true,
    evidenceScope: 'offline-approved-event-evaluation',
  };
}

export function recommendAction(memory, query, options = {}) {
  const minContextSupport = Math.max(1, Math.trunc(finiteNumber(options.minContextSupport, 8)));
  const fingerprint = stateFingerprint(query?.state, memory?.targetVersions);
  const context = fingerprint ? memory?.contexts?.get(fingerprint) : null;
  const contextSupport = context ? [...context.values()].reduce((sum, item) => sum + item.count, 0) : 0;
  const contextBest = contextSupport >= minContextSupport ? bestAction(context, memory.regretPenalty) : null;
  const globalBest = bestAction(memory.global, memory.regretPenalty);
  const selected = contextBest ?? globalBest;
  return {
    actionId: selected?.actionId ?? null,
    source: contextBest ? 'similar-situation' : globalBest ? 'global-baseline-fallback' : 'no-evidence',
    contextSupport,
    score: selected?.score ?? null,
    provisional: true,
  };
}

export function baselineAction(memory) {
  const best = bestAction(memory?.global ?? new Map(), memory?.regretPenalty ?? 0.35);
  return best?.actionId ?? null;
}

function caseRegret(testCase, actionId) {
  if (!actionId) return 1;
  if (testCase?.regretByAction && Number.isFinite(Number(testCase.regretByAction[actionId]))) {
    return Math.max(0, Math.min(1, Number(testCase.regretByAction[actionId])));
  }
  return actionId === testCase?.optimalActionId ? 0 : 1;
}

export function evaluateHoldout(memory, holdoutCases, options = {}) {
  const baseline = baselineAction(memory);
  let baselineCorrect = 0;
  let learnedCorrect = 0;
  let baselineRegret = 0;
  let learnedRegret = 0;
  const cases = Array.isArray(holdoutCases) ? holdoutCases : [];

  for (const testCase of cases) {
    const learned = recommendAction(memory, testCase, options).actionId;
    if (baseline === testCase.optimalActionId) baselineCorrect += 1;
    if (learned === testCase.optimalActionId) learnedCorrect += 1;
    baselineRegret += caseRegret(testCase, baseline);
    learnedRegret += caseRegret(testCase, learned);
  }

  const total = cases.length;
  const baselineAccuracy = total ? baselineCorrect / total : 0;
  const learnedAccuracy = total ? learnedCorrect / total : 0;
  return {
    total,
    baselineAction: baseline,
    baselineAccuracy,
    learnedAccuracy,
    accuracyDelta: learnedAccuracy - baselineAccuracy,
    baselineMeanRegret: total ? baselineRegret / total : 1,
    learnedMeanRegret: total ? learnedRegret / total : 1,
    regretDelta: total ? (learnedRegret - baselineRegret) / total : 0,
    provisional: true,
  };
}

export function promotionDecision(memory, metrics, thresholds = {}) {
  const minTrainEvents = Math.max(1, Math.trunc(finiteNumber(thresholds.minTrainEvents, 400)));
  const minHoldoutCases = Math.max(1, Math.trunc(finiteNumber(thresholds.minHoldoutCases, 100)));
  const minAccuracyDelta = finiteNumber(thresholds.minAccuracyDelta, 0.05);
  const maxRegretDelta = finiteNumber(thresholds.maxRegretDelta, 0);
  const reasons = [];
  if ((memory?.eligibleCount ?? 0) < minTrainEvents) reasons.push('insufficient-train-support');
  if ((metrics?.total ?? 0) < minHoldoutCases) reasons.push('insufficient-holdout-support');
  if ((metrics?.accuracyDelta ?? Number.NEGATIVE_INFINITY) < minAccuracyDelta) reasons.push('accuracy-delta-too-small');
  if ((metrics?.regretDelta ?? Number.POSITIVE_INFINITY) > maxRegretDelta) reasons.push('regret-regression');
  if (!memory?.targetVersions?.rulesVersion || !memory?.targetVersions?.cardVersion || !memory?.targetVersions?.stateVersion) {
    reasons.push('missing-version-boundary');
  }
  return {
    promotion: reasons.length === 0,
    reasons,
    thresholds: { minTrainEvents, minHoldoutCases, minAccuracyDelta, maxRegretDelta },
    provisional: true,
    formalPromotionRequiresHumanGate: true,
  };
}

export function deriveAffectiveUxSignals(trace = {}) {
  const adviceShown = Math.max(0, finiteNumber(trace.adviceShown));
  const adviceFollowed = Math.max(0, finiteNumber(trace.adviceFollowed));
  const negativeAfterFollow = Math.max(0, finiteNumber(trace.adviceNegativeOutcome));
  return {
    confusionProxy: Math.max(0, finiteNumber(trace.backtracks)) + Math.max(0, finiteNumber(trace.hesitationEvents)),
    frustrationProxy: Math.max(0, finiteNumber(trace.invalidActions)) + Math.max(0, finiteNumber(trace.retries)),
    trustProxy: adviceShown > 0 ? Math.min(1, adviceFollowed / adviceShown) : null,
    surpriseProxy: Math.max(0, finiteNumber(trace.unexpectedTransitions)),
    regretProxy: adviceFollowed > 0 ? Math.min(1, negativeAfterFollow / adviceFollowed) : 0,
    interpretation: 'observable-ux-proxy-not-human-emotion',
    provisional: true,
  };
}

export function benchmarkReport(memory, metrics, decision) {
  return {
    schema: 'gameroad.advice-collective-offline-eval.v1',
    generatedFrom: 'deterministic-offline-benchmark',
    trainEligible: memory.eligibleCount,
    rejected: memory.rejected,
    holdoutCases: metrics.total,
    baselineAccuracy: metrics.baselineAccuracy,
    learnedAccuracy: metrics.learnedAccuracy,
    accuracyDelta: metrics.accuracyDelta,
    baselineMeanRegret: metrics.baselineMeanRegret,
    learnedMeanRegret: metrics.learnedMeanRegret,
    regretDelta: metrics.regretDelta,
    promotionCandidate: decision.promotion,
    promotionReasons: decision.reasons,
    provisional: true,
    livePlayerPerformanceProven: false,
    humanAcceptanceProven: false,
  };
}

function runtimeManifestReject(reason) {
  return { ok: false, reason, manifest: null };
}

export function compileRuntimeAdviceManifest(memory, decision, approval, options = {}) {
  if (!memory || !(memory.contexts instanceof Map) || !(memory.global instanceof Map)) return runtimeManifestReject('invalid-memory');
  if (decision?.promotion !== true) return runtimeManifestReject('offline-promotion-not-passed');
  if (decision?.formalPromotionRequiresHumanGate !== true) return runtimeManifestReject('human-gate-contract-missing');
  if (approval?.gateId !== 'HUMAN-HOLDOUT-ACCEPTANCE' || approval?.humanGate !== 'approved') {
    return runtimeManifestReject('human-gate-not-approved');
  }
  if (approval?.privacyScope !== 'shared' || approval?.containsPrivate === true) return runtimeManifestReject('privacy-not-runtime-safe');
  const approvalId = safeToken(approval?.approvalId);
  if (!approvalId) return runtimeManifestReject('approval-id-missing');
  if (!sameVersions(memory.targetVersions, approval)) return runtimeManifestReject('version-mismatch');

  const minContextSupport = Math.max(1, Math.trunc(finiteNumber(options.minContextSupport, 8)));
  const baseline = bestAction(memory.global, memory.regretPenalty);
  if (!baseline?.actionId) return runtimeManifestReject('no-baseline-evidence');

  const contexts = [];
  for (const [fingerprint, actionMap] of memory.contexts.entries()) {
    if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 512 || !(actionMap instanceof Map)) continue;
    const support = [...actionMap.values()].reduce((sum, item) => sum + Math.max(0, finiteNumber(item?.count)), 0);
    if (support < minContextSupport) continue;
    const selected = bestAction(actionMap, memory.regretPenalty);
    if (!selected?.actionId) continue;
    contexts.push({ fingerprint, actionId: selected.actionId, support });
  }
  contexts.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint) || a.actionId.localeCompare(b.actionId));

  return {
    ok: true,
    reason: null,
    manifest: {
      schema: RUNTIME_MANIFEST_SCHEMA,
      targetVersions: { ...memory.targetVersions },
      approval: {
        gateId: 'HUMAN-HOLDOUT-ACCEPTANCE',
        approvalId,
        humanGate: 'approved',
        privacyScope: 'shared',
      },
      promotionSafe: true,
      defaultActionId: baseline.actionId,
      minContextSupport,
      contexts,
      sourceEvidence: 'offline-approved-aggregate-only',
      containsRawEvents: false,
      containsPrivate: false,
      livePlayerPerformanceProven: false,
    },
  };
}

function runtimeRecommendationReject(reason) {
  return { actionId: null, source: 'manifest-rejected', reason, fingerprint: null, support: 0 };
}

export function recommendFromRuntimeManifest(manifest, state, targetVersions) {
  if (!manifest || manifest.schema !== RUNTIME_MANIFEST_SCHEMA || manifest.promotionSafe !== true) {
    return runtimeRecommendationReject('manifest-not-approved');
  }
  if (manifest.approval?.gateId !== 'HUMAN-HOLDOUT-ACCEPTANCE' || manifest.approval?.humanGate !== 'approved') {
    return runtimeRecommendationReject('human-gate-not-approved');
  }
  if (manifest.approval?.privacyScope !== 'shared' || manifest.containsPrivate === true || manifest.containsRawEvents === true) {
    return runtimeRecommendationReject('privacy-not-runtime-safe');
  }
  if (!sameVersions(manifest.targetVersions, targetVersions)) return runtimeRecommendationReject('version-mismatch');
  const fingerprint = stateFingerprint(state, targetVersions);
  if (!fingerprint) return runtimeRecommendationReject('invalid-state');

  const contexts = Array.isArray(manifest.contexts) ? manifest.contexts : [];
  const exact = contexts.find((entry) => entry?.fingerprint === fingerprint && safeToken(entry?.actionId));
  const fallback = safeToken(manifest.defaultActionId);
  if (!exact && !fallback) return runtimeRecommendationReject('no-approved-recommendation');
  return {
    actionId: exact?.actionId ?? fallback,
    source: exact ? 'approved-similar-situation' : 'approved-global-fallback',
    reason: null,
    fingerprint,
    support: exact ? Math.max(0, finiteNumber(exact.support)) : 0,
  };
}

function clonePublicValue(value, depth = 0) {
  if (depth > 16) throw new TypeError('publicFacts-too-deep');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('publicFacts-non-finite-number');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => clonePublicValue(item, depth + 1));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('publicFacts-must-be-json-like');
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    const safeKey = safeToken(key);
    if (!safeKey || safeKey !== key) throw new TypeError('publicFacts-invalid-key');
    output[key] = clonePublicValue(value[key], depth + 1);
  }
  return output;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validVersionTuple(versions) {
  return ['rulesVersion', 'cardVersion', 'stateVersion'].every((key) => safeToken(versions?.[key]));
}

export function buildViewerSafeLegalActionSet(candidates, targetVersions) {
  const rows = Array.isArray(candidates) ? candidates : [];
  const accepted = [];
  const rejected = [];
  const targetValid = validVersionTuple(targetVersions);
  const idCounts = new Map();

  for (const candidate of rows) {
    const actionId = safeToken(candidate?.actionId);
    if (actionId) idCounts.set(actionId, (idCounts.get(actionId) ?? 0) + 1);
  }

  for (let index = 0; index < rows.length; index += 1) {
    const candidate = rows[index];
    const actionId = safeToken(candidate?.actionId);
    const reasons = [];
    if (!targetValid) reasons.push('invalid-target-versions');
    if (!actionId) reasons.push('invalid-action-id');
    if (actionId && idCounts.get(actionId) !== 1) reasons.push('duplicate-action-id');
    for (const key of ['rulesVersion', 'cardVersion', 'stateVersion']) {
      if (!safeToken(candidate?.[key]) || candidate[key] !== targetVersions?.[key]) reasons.push(`${key}-mismatch`);
    }
    if (candidate?.legal !== true) reasons.push('illegal-action');
    if (candidate?.viewerSafe !== true) reasons.push('viewer-unsafe');

    const stableOrder = candidate?.stableOrder ?? index;
    if (!Number.isSafeInteger(stableOrder) || stableOrder < 0) reasons.push('invalid-stable-order');

    let publicFacts = null;
    if (reasons.length === 0) {
      try {
        publicFacts = clonePublicValue(candidate?.publicFacts ?? {});
      } catch (error) {
        reasons.push(error instanceof Error ? error.message : 'invalid-public-facts');
      }
    }

    if (reasons.length > 0) {
      rejected.push({ index, actionId: actionId ?? null, reasons: [...new Set(reasons)] });
      continue;
    }

    accepted.push(deepFreeze({ actionId, stableOrder, publicFacts }));
  }

  accepted.sort((a, b) => a.stableOrder - b.stableOrder || a.actionId.localeCompare(b.actionId));
  return deepFreeze({
    targetVersions: targetValid ? { ...targetVersions } : null,
    accepted,
    rejected,
    deterministic: true,
    containsPrivate: false,
  });
}

export function selectPreferredLegalAction(candidates, targetVersions, preference = null) {
  const legalSet = buildViewerSafeLegalActionSet(candidates, targetVersions);
  if (legalSet.accepted.length === 0) {
    return deepFreeze({ ...legalSet, selected: null, scores: [], reason: 'no-legal-candidates' });
  }
  if (preference !== null && typeof preference !== 'function') {
    return deepFreeze({ ...legalSet, selected: null, scores: [], reason: 'invalid-preference' });
  }

  const scoreRows = [];
  for (const candidate of legalSet.accepted) {
    const publicView = deepFreeze({ actionId: candidate.actionId, publicFacts: candidate.publicFacts });
    const score = preference === null ? 0 : Number(preference(publicView));
    if (!Number.isFinite(score)) {
      return deepFreeze({ ...legalSet, selected: null, scores: [], reason: 'invalid-preference-score' });
    }
    scoreRows.push({ actionId: candidate.actionId, score, stableOrder: candidate.stableOrder });
  }

  scoreRows.sort((a, b) => b.score - a.score || a.stableOrder - b.stableOrder || a.actionId.localeCompare(b.actionId));
  const winner = legalSet.accepted.find((candidate) => candidate.actionId === scoreRows[0].actionId) ?? null;
  return deepFreeze({
    ...legalSet,
    selected: winner ? { actionId: winner.actionId, publicFacts: winner.publicFacts } : null,
    scores: scoreRows.map(({ actionId, score }) => ({ actionId, score })),
    reason: null,
  });
}

const COLLECTIVE_PROPOSAL_SCHEMA = 'gameroad.collective-improvement-proposal.v1';
const COLLECTIVE_PROVENANCE = new Set(['fixture', 'synthetic', 'prototype_local', 'server_verified', 'public_production']);
const COLLECTIVE_AUTHORITY_LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
const COLLECTIVE_RELEASE_PROVENANCE = new Set(['server_verified', 'public_production']);
const COLLECTIVE_RELEASE_AUTHORITY = new Set(['L4', 'L5', 'L6', 'L7']);
const COLLECTIVE_DECISION_AUTHORITIES = new Set(['human', 'formal-preauthorized']);
const COLLECTIVE_VERSION_KEYS = ['releaseVersion', 'rulesVersion', 'contentVersion', 'cardVersion', 'stateVersion'];

function proposalUnexpectedFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .sort()
    .map((key) => `unexpected-field:${key}`);
}

function proposalVersionTuple(value, reasons, prefix = 'versions') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reasons.push(`${prefix}-invalid`);
    return null;
  }
  for (const reason of proposalUnexpectedFields(value, new Set(COLLECTIVE_VERSION_KEYS))) {
    reasons.push(`${prefix}-${reason}`);
  }
  const normalized = {};
  for (const key of COLLECTIVE_VERSION_KEYS) {
    const token = safeToken(value[key]);
    if (!token) reasons.push(`${prefix}-${key}-invalid`);
    else normalized[key] = token;
  }
  return COLLECTIVE_VERSION_KEYS.every((key) => normalized[key]) ? normalized : null;
}

function proposalVersionsEqual(a, b) {
  return COLLECTIVE_VERSION_KEYS.every((key) => safeToken(a?.[key]) && a[key] === b?.[key]);
}

function proposalTokenArray(value, reasons, prefix) {
  if (!Array.isArray(value)) {
    reasons.push(`${prefix}-invalid`);
    return [];
  }
  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const token = safeToken(value[index]);
    if (!token) {
      reasons.push(`${prefix}-${index}-invalid`);
      continue;
    }
    if (seen.has(token)) {
      reasons.push(`${prefix}-${index}-duplicate`);
      continue;
    }
    seen.add(token);
    normalized.push(token);
  }
  return normalized;
}

function proposalEvidenceRef(value, expectedVersions, cohortId, reasons, prefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reasons.push(`${prefix}-invalid`);
    return null;
  }
  const allowed = new Set([
    'evidenceId',
    'ownerId',
    'digest',
    'acquiredAt',
    'authorityLevel',
    'provenance',
    'cohortId',
    'versions',
    'summaryRef',
  ]);
  for (const reason of proposalUnexpectedFields(value, allowed)) reasons.push(`${prefix}-${reason}`);

  const evidenceId = safeToken(value.evidenceId);
  const ownerId = safeToken(value.ownerId);
  const digest = safeToken(value.digest);
  const acquiredAt = safeToken(value.acquiredAt);
  const authorityLevel = safeToken(value.authorityLevel);
  const provenance = safeToken(value.provenance);
  const evidenceCohortId = safeToken(value.cohortId);
  const summaryRef = value.summaryRef == null ? null : safeToken(value.summaryRef);
  const versions = proposalVersionTuple(value.versions, reasons, `${prefix}-versions`);

  if (!evidenceId) reasons.push(`${prefix}-evidenceId-invalid`);
  if (!ownerId) reasons.push(`${prefix}-ownerId-invalid`);
  if (!digest) reasons.push(`${prefix}-digest-invalid`);
  if (!acquiredAt) reasons.push(`${prefix}-acquiredAt-invalid`);
  if (!authorityLevel || !COLLECTIVE_AUTHORITY_LEVELS.has(authorityLevel)) reasons.push(`${prefix}-authorityLevel-invalid`);
  if (!provenance || !COLLECTIVE_PROVENANCE.has(provenance)) reasons.push(`${prefix}-provenance-invalid`);
  if (!evidenceCohortId || evidenceCohortId !== cohortId) reasons.push(`${prefix}-cohort-mismatch`);
  if (value.summaryRef != null && !summaryRef) reasons.push(`${prefix}-summaryRef-invalid`);
  if (versions && !proposalVersionsEqual(versions, expectedVersions)) reasons.push(`${prefix}-version-mismatch`);

  if (!evidenceId || !ownerId || !digest || !acquiredAt || !authorityLevel || !provenance || !evidenceCohortId || !versions) return null;
  return {
    evidenceId,
    ownerId,
    digest,
    acquiredAt,
    authorityLevel,
    provenance,
    cohortId: evidenceCohortId,
    versions,
    summaryRef,
  };
}

function proposalEvidenceList(value, expectedVersions, cohortId, reasons, prefix, { requireNonEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    reasons.push(`${prefix}-invalid`);
    return [];
  }
  if (requireNonEmpty && value.length === 0) reasons.push(`${prefix}-empty`);
  const normalized = [];
  const ids = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = proposalEvidenceRef(value[index], expectedVersions, cohortId, reasons, `${prefix}-${index}`);
    if (!item) continue;
    if (ids.has(item.evidenceId)) {
      reasons.push(`${prefix}-${index}-duplicate-evidenceId`);
      continue;
    }
    ids.add(item.evidenceId);
    normalized.push(item);
  }
  return normalized;
}

function proposalEvidenceIsReleaseGrade(item) {
  return COLLECTIVE_RELEASE_PROVENANCE.has(item?.provenance) && COLLECTIVE_RELEASE_AUTHORITY.has(item?.authorityLevel);
}

function proposalResultEvidence(value, reasons) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    reasons.push('resultEvidence-invalid');
    return null;
  }
  const allowed = new Set(['state', 'evidenceId', 'authorityLevel', 'provenance']);
  for (const reason of proposalUnexpectedFields(value, allowed)) reasons.push(`resultEvidence-${reason}`);
  const state = safeToken(value.state);
  const evidenceId = value.evidenceId == null ? null : safeToken(value.evidenceId);
  const authorityLevel = value.authorityLevel == null ? null : safeToken(value.authorityLevel);
  const provenance = value.provenance == null ? null : safeToken(value.provenance);
  if (!['PENDING', 'VERIFIED'].includes(state)) reasons.push('resultEvidence-state-invalid');
  if (state === 'PENDING') {
    if (value.evidenceId != null || value.authorityLevel != null || value.provenance != null) reasons.push('resultEvidence-pending-must-not-claim-evidence');
  } else if (state === 'VERIFIED') {
    if (!evidenceId) reasons.push('resultEvidence-evidenceId-invalid');
    if (!authorityLevel || !COLLECTIVE_AUTHORITY_LEVELS.has(authorityLevel)) reasons.push('resultEvidence-authorityLevel-invalid');
    if (!provenance || !COLLECTIVE_PROVENANCE.has(provenance)) reasons.push('resultEvidence-provenance-invalid');
  }
  if (!state || !['PENDING', 'VERIFIED'].includes(state)) return null;
  return { state, evidenceId, authorityLevel, provenance };
}

export function validateCollectiveImprovementProposal(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({
      ok: false,
      reasons: ['invalid-proposal'],
      proposal: null,
      releaseEligible: false,
      reuseEligible: false,
    });
  }

  const allowedTop = new Set([
    'proposalId',
    'proposalVersion',
    'kind',
    'versions',
    'cohort',
    'missingData',
    'supportingEvidence',
    'counterEvidence',
    'affectedOwnerId',
    'affectedUseSiteRef',
    'protectedInvariantRef',
    'changeRef',
    'expectedObservation',
    'isolation',
    'rollback',
    'decision',
    'releaseLink',
    'resultEvidence',
  ]);
  reasons.push(...proposalUnexpectedFields(input, allowedTop));

  const proposalId = safeToken(input.proposalId);
  const proposalVersion = safeToken(input.proposalVersion);
  const kind = safeToken(input.kind);
  if (!proposalId) reasons.push('proposalId-invalid');
  if (!proposalVersion) reasons.push('proposalVersion-invalid');
  if (!['CHANGE', 'NO_CHANGE'].includes(kind)) reasons.push('kind-invalid');

  const versions = proposalVersionTuple(input.versions, reasons);

  const cohortAllowed = new Set(['cohortId', 'scopeRef']);
  const cohort = input.cohort;
  if (!cohort || typeof cohort !== 'object' || Array.isArray(cohort)) reasons.push('cohort-invalid');
  else for (const reason of proposalUnexpectedFields(cohort, cohortAllowed)) reasons.push(`cohort-${reason}`);
  const cohortId = safeToken(cohort?.cohortId);
  const cohortScopeRef = safeToken(cohort?.scopeRef);
  if (!cohortId) reasons.push('cohortId-invalid');
  if (!cohortScopeRef) reasons.push('cohort-scopeRef-invalid');

  const missingAllowed = new Set(['state', 'refs']);
  const missingData = input.missingData;
  if (!missingData || typeof missingData !== 'object' || Array.isArray(missingData)) reasons.push('missingData-invalid');
  else for (const reason of proposalUnexpectedFields(missingData, missingAllowed)) reasons.push(`missingData-${reason}`);
  const missingState = safeToken(missingData?.state);
  if (!['NONE', 'PRESENT', 'UNKNOWN'].includes(missingState)) reasons.push('missingData-state-invalid');
  const missingRefs = proposalTokenArray(missingData?.refs, reasons, 'missingData-refs');
  if (missingState === 'NONE' && missingRefs.length > 0) reasons.push('missingData-none-with-refs');
  if (missingState === 'PRESENT' && missingRefs.length === 0) reasons.push('missingData-present-without-refs');

  const supportingEvidence = versions && cohortId
    ? proposalEvidenceList(input.supportingEvidence, versions, cohortId, reasons, 'supportingEvidence', { requireNonEmpty: true })
    : [];
  if ((!versions || !cohortId) && !Array.isArray(input.supportingEvidence)) reasons.push('supportingEvidence-invalid');

  const counterAllowed = new Set(['state', 'searchRef', 'items']);
  const counterEvidence = input.counterEvidence;
  if (!counterEvidence || typeof counterEvidence !== 'object' || Array.isArray(counterEvidence)) reasons.push('counterEvidence-invalid');
  else for (const reason of proposalUnexpectedFields(counterEvidence, counterAllowed)) reasons.push(`counterEvidence-${reason}`);
  const counterState = safeToken(counterEvidence?.state);
  const counterSearchRef = safeToken(counterEvidence?.searchRef);
  if (!['PRESENT', 'NONE_FOUND', 'UNKNOWN'].includes(counterState)) reasons.push('counterEvidence-state-invalid');
  if (!counterSearchRef) reasons.push('counterEvidence-searchRef-invalid');
  const counterItems = versions && cohortId
    ? proposalEvidenceList(counterEvidence?.items, versions, cohortId, reasons, 'counterEvidence-items')
    : [];
  if (counterState === 'PRESENT' && counterItems.length === 0) reasons.push('counterEvidence-present-without-items');
  if ((counterState === 'NONE_FOUND' || counterState === 'UNKNOWN') && counterItems.length > 0) {
    reasons.push('counterEvidence-state-items-conflict');
  }

  const affectedOwnerId = safeToken(input.affectedOwnerId);
  const affectedUseSiteRef = safeToken(input.affectedUseSiteRef);
  const protectedInvariantRef = safeToken(input.protectedInvariantRef);
  if (!affectedOwnerId) reasons.push('affectedOwnerId-invalid');
  if (!affectedUseSiteRef) reasons.push('affectedUseSiteRef-invalid');
  if (!protectedInvariantRef) reasons.push('protectedInvariantRef-invalid');

  const changeRef = input.changeRef == null ? null : safeToken(input.changeRef);
  if (kind === 'CHANGE' && !changeRef) reasons.push('changeRef-required-for-change');
  if (kind === 'NO_CHANGE' && input.changeRef != null) reasons.push('changeRef-forbidden-for-no-change');

  const observationAllowed = new Set(['metricRef', 'observationPlanRef']);
  const expectedObservation = input.expectedObservation;
  if (!expectedObservation || typeof expectedObservation !== 'object' || Array.isArray(expectedObservation)) reasons.push('expectedObservation-invalid');
  else for (const reason of proposalUnexpectedFields(expectedObservation, observationAllowed)) reasons.push(`expectedObservation-${reason}`);
  const metricRef = safeToken(expectedObservation?.metricRef);
  const observationPlanRef = safeToken(expectedObservation?.observationPlanRef);
  if (!metricRef) reasons.push('expectedObservation-metricRef-invalid');
  if (!observationPlanRef) reasons.push('expectedObservation-observationPlanRef-invalid');

  const isolationAllowed = new Set(['isolationRef', 'scopeRef']);
  const isolation = input.isolation;
  if (!isolation || typeof isolation !== 'object' || Array.isArray(isolation)) reasons.push('isolation-invalid');
  else for (const reason of proposalUnexpectedFields(isolation, isolationAllowed)) reasons.push(`isolation-${reason}`);
  const isolationRef = safeToken(isolation?.isolationRef);
  const isolationScopeRef = safeToken(isolation?.scopeRef);
  if (!isolationRef) reasons.push('isolation-isolationRef-invalid');
  if (!isolationScopeRef) reasons.push('isolation-scopeRef-invalid');

  const rollbackAllowed = new Set(['conditionRef', 'rollbackRef']);
  const rollback = input.rollback;
  if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) reasons.push('rollback-invalid');
  else for (const reason of proposalUnexpectedFields(rollback, rollbackAllowed)) reasons.push(`rollback-${reason}`);
  const rollbackConditionRef = safeToken(rollback?.conditionRef);
  const rollbackRef = safeToken(rollback?.rollbackRef);
  if (!rollbackConditionRef) reasons.push('rollback-conditionRef-invalid');
  if (!rollbackRef) reasons.push('rollback-rollbackRef-invalid');

  const decisionAllowed = new Set(['state', 'authority', 'evidenceRef']);
  const decision = input.decision ?? { state: 'PENDING' };
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) reasons.push('decision-invalid');
  else for (const reason of proposalUnexpectedFields(decision, decisionAllowed)) reasons.push(`decision-${reason}`);
  const decisionState = safeToken(decision?.state) ?? 'PENDING';
  const decisionAuthority = decision?.authority == null ? null : safeToken(decision.authority);
  const decisionEvidenceRef = decision?.evidenceRef == null ? null : safeToken(decision.evidenceRef);
  if (!['PENDING', 'APPROVED', 'REJECTED'].includes(decisionState)) reasons.push('decision-state-invalid');
  if (decisionState === 'PENDING') {
    if (decision?.authority != null || decision?.evidenceRef != null) reasons.push('decision-pending-must-not-claim-authority');
  } else {
    if (!decisionAuthority || !COLLECTIVE_DECISION_AUTHORITIES.has(decisionAuthority)) reasons.push('decision-authority-invalid');
    if (!decisionEvidenceRef) reasons.push('decision-evidenceRef-invalid');
  }

  const releaseAllowed = new Set(['releaseId', 'resultRecordId']);
  const releaseLink = input.releaseLink;
  if (releaseLink != null && (!releaseLink || typeof releaseLink !== 'object' || Array.isArray(releaseLink))) reasons.push('releaseLink-invalid');
  else if (releaseLink) for (const reason of proposalUnexpectedFields(releaseLink, releaseAllowed)) reasons.push(`releaseLink-${reason}`);
  const releaseId = releaseLink == null ? null : safeToken(releaseLink.releaseId);
  const resultRecordId = releaseLink == null ? null : safeToken(releaseLink.resultRecordId);
  if (releaseLink != null && !releaseId) reasons.push('releaseLink-releaseId-invalid');
  if (releaseLink != null && !resultRecordId) reasons.push('releaseLink-resultRecordId-invalid');

  const resultEvidence = proposalResultEvidence(input.resultEvidence, reasons);
  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) {
    return deepFreeze({
      ok: false,
      reasons: uniqueReasons,
      proposal: null,
      releaseEligible: false,
      reuseEligible: false,
    });
  }

  const normalized = {
    schema: COLLECTIVE_PROPOSAL_SCHEMA,
    proposalId,
    proposalVersion,
    kind,
    versions,
    cohort: { cohortId, scopeRef: cohortScopeRef },
    missingData: { state: missingState, refs: missingRefs },
    supportingEvidence,
    counterEvidence: { state: counterState, searchRef: counterSearchRef, items: counterItems },
    affectedOwnerId,
    affectedUseSiteRef,
    protectedInvariantRef,
    changeRef,
    expectedObservation: { metricRef, observationPlanRef },
    isolation: { isolationRef, scopeRef: isolationScopeRef },
    rollback: { conditionRef: rollbackConditionRef, rollbackRef },
    decision: { state: decisionState, authority: decisionAuthority, evidenceRef: decisionEvidenceRef },
    releaseLink: releaseLink == null ? null : { releaseId, resultRecordId },
    resultEvidence,
    automaticMutationAllowed: false,
    formalDecisionRequired: true,
    containsRawEvents: false,
    containsPrivate: false,
  };

  const supportingReleaseGrade = supportingEvidence.every(proposalEvidenceIsReleaseGrade);
  const counterReleaseGrade = counterState === 'NONE_FOUND' || counterItems.every(proposalEvidenceIsReleaseGrade);
  const releaseEligible =
    missingState === 'NONE'
    && counterState !== 'UNKNOWN'
    && decisionState === 'APPROVED'
    && releaseLink != null
    && supportingReleaseGrade
    && counterReleaseGrade;
  const reuseEligible =
    releaseEligible
    && resultEvidence?.state === 'VERIFIED'
    && COLLECTIVE_RELEASE_PROVENANCE.has(resultEvidence.provenance)
    && COLLECTIVE_RELEASE_AUTHORITY.has(resultEvidence.authorityLevel);

  return deepFreeze({
    ok: true,
    reasons: [],
    proposal: normalized,
    releaseEligible,
    reuseEligible,
  });
}

export function buildCollectiveImprovementProposal(input) {
  return validateCollectiveImprovementProposal(input);
}
