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
    if (!safeToken(fingerprint) || !(actionMap instanceof Map)) continue;
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
