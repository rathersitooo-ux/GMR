import { validateCollectiveImprovementProposal } from './advice-collective-eval.mjs';

const DECISION_PRODUCT_SCHEMA = 'gameroad.partner-advice-decision-product.v1';
const EXPECTED_CONSUMER = 'PARTNER-COLLECTIVE-ADVICE-OFFLINE-EVAL-001';
const TRANSFER_SCOPES = new Set(['POPULATION', 'PERSONAL']);

function safeToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return null;
  return trimmed;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function unexpectedFields(value, allowed, prefix, reasons) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) reasons.push(`${prefix}-unexpected-field:${key}`);
  }
}

function token(value, reason, reasons) {
  const normalized = safeToken(value);
  if (!normalized) reasons.push(reason);
  return normalized;
}

function decisionProductReject(reasons, proposalValidation = null) {
  return deepFreeze({
    ok: false,
    ready: false,
    abstain: true,
    reasons: [...new Set(reasons)].sort(),
    projection: null,
    sourceProposalValid: proposalValidation?.ok === true,
    formalPromotionEligible: false,
    authoritativeReuseEligible: false,
    automaticMutationAllowed: false,
  });
}

function normalizeAxes(value, reasons) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    reasons.push('comparison-axes-invalid');
    return [];
  }
  const axes = [];
  const refs = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const axis = value[index];
    if (!axis || typeof axis !== 'object' || Array.isArray(axis)) {
      reasons.push(`comparison-axis-${index}-invalid`);
      continue;
    }
    unexpectedFields(axis, new Set(['axisRef', 'observationRef', 'predeclared']), `comparison-axis-${index}`, reasons);
    const axisRef = token(axis.axisRef, `comparison-axis-${index}-axisRef-invalid`, reasons);
    const observationRef = token(axis.observationRef, `comparison-axis-${index}-observationRef-invalid`, reasons);
    if (axis.predeclared !== true) reasons.push(`comparison-axis-${index}-not-predeclared`);
    if (axisRef && refs.has(axisRef)) reasons.push(`comparison-axis-${index}-duplicate-axisRef`);
    if (axisRef) refs.add(axisRef);
    if (axisRef && observationRef && axis.predeclared === true) axes.push({ axisRef, observationRef, predeclared: true });
  }
  return axes;
}

export function buildPartnerAdviceDecisionProduct(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return decisionProductReject(['invalid-input']);

  unexpectedFields(
    input,
    new Set(['decisionProductId', 'decisionProductVersion', 'consumerTaskId', 'consumerUseSiteRef', 'proposal', 'decisionContext']),
    'top',
    reasons,
  );

  const decisionProductId = token(input.decisionProductId, 'decisionProductId-invalid', reasons);
  const decisionProductVersion = token(input.decisionProductVersion, 'decisionProductVersion-invalid', reasons);
  const consumerTaskId = token(input.consumerTaskId, 'consumerTaskId-invalid', reasons);
  const consumerUseSiteRef = token(input.consumerUseSiteRef, 'consumerUseSiteRef-invalid', reasons);
  if (consumerTaskId && consumerTaskId !== EXPECTED_CONSUMER) reasons.push('consumerTaskId-mismatch');

  const proposalValidation = validateCollectiveImprovementProposal(input.proposal);
  if (!proposalValidation.ok) {
    for (const reason of proposalValidation.reasons ?? []) reasons.push(`proposal:${reason}`);
  }
  const proposal = proposalValidation.proposal;
  if (proposal && consumerUseSiteRef && consumerUseSiteRef !== proposal.affectedUseSiteRef) reasons.push('consumer-use-site-mismatch');
  if (proposal?.missingData?.state !== 'NONE') reasons.push('proposal-missing-data');
  if (proposal?.counterEvidence?.state === 'UNKNOWN') reasons.push('counter-evidence-unknown');

  const context = input.decisionContext;
  if (!context || typeof context !== 'object' || Array.isArray(context)) reasons.push('decisionContext-invalid');
  else unexpectedFields(
    context,
    new Set(['decisionInput', 'exposure', 'intervention', 'proxy', 'environment', 'transfer', 'comparison', 'hypothesis', 'confidenceRef']),
    'decisionContext',
    reasons,
  );

  const decisionInput = context?.decisionInput;
  if (!decisionInput || typeof decisionInput !== 'object' || Array.isArray(decisionInput)) reasons.push('decisionInput-invalid');
  else unexpectedFields(decisionInput, new Set(['capturedAtDecision', 'contextRef']), 'decisionInput', reasons);
  if (decisionInput?.capturedAtDecision !== true) reasons.push('decision-input-not-captured');
  const decisionContextRef = token(decisionInput?.contextRef, 'decisionInput-contextRef-invalid', reasons);

  const exposure = context?.exposure;
  if (!exposure || typeof exposure !== 'object' || Array.isArray(exposure)) reasons.push('exposure-invalid');
  else unexpectedFields(exposure, new Set(['opportunityState', 'opportunityRef', 'candidateSetRef']), 'exposure', reasons);
  const opportunityState = safeToken(exposure?.opportunityState);
  if (!['KNOWN', 'UNKNOWN'].includes(opportunityState)) reasons.push('exposure-opportunityState-invalid');
  if (opportunityState !== 'KNOWN') reasons.push('exposure-opportunity-unknown');
  const opportunityRef = token(exposure?.opportunityRef, 'exposure-opportunityRef-invalid', reasons);
  const candidateSetRef = token(exposure?.candidateSetRef, 'exposure-candidateSetRef-invalid', reasons);

  const intervention = context?.intervention;
  if (!intervention || typeof intervention !== 'object' || Array.isArray(intervention)) reasons.push('intervention-invalid');
  else unexpectedFields(intervention, new Set(['reversible', 'interventionUnitRef', 'rollbackRef']), 'intervention', reasons);
  if (intervention?.reversible !== true) reasons.push('intervention-not-reversible');
  const interventionUnitRef = token(intervention?.interventionUnitRef, 'intervention-unitRef-invalid', reasons);
  const interventionRollbackRef = token(intervention?.rollbackRef, 'intervention-rollbackRef-invalid', reasons);
  if (proposal && interventionRollbackRef && interventionRollbackRef !== proposal.rollback.rollbackRef) reasons.push('rollback-ref-mismatch');

  const proxy = context?.proxy;
  if (!proxy || typeof proxy !== 'object' || Array.isArray(proxy)) reasons.push('proxy-invalid');
  else unexpectedFields(proxy, new Set(['role', 'limitationRef', 'primaryOutcomeRef']), 'proxy', reasons);
  const proxyRole = safeToken(proxy?.role);
  if (proxyRole !== 'SUPPORTING_ONLY') reasons.push('proxy-role-invalid');
  const proxyLimitationRef = token(proxy?.limitationRef, 'proxy-limitationRef-invalid', reasons);
  const primaryOutcomeRef = token(proxy?.primaryOutcomeRef, 'proxy-primaryOutcomeRef-invalid', reasons);

  const environment = context?.environment;
  if (!environment || typeof environment !== 'object' || Array.isArray(environment)) reasons.push('environment-invalid');
  else unexpectedFields(environment, new Set(['driftState', 'environmentRef', 'expiryRef']), 'environment', reasons);
  const driftState = safeToken(environment?.driftState);
  if (!['CURRENT', 'STALE', 'UNKNOWN'].includes(driftState)) reasons.push('environment-driftState-invalid');
  if (driftState === 'STALE') reasons.push('environment-stale');
  if (driftState === 'UNKNOWN') reasons.push('environment-drift-unknown');
  const environmentRef = token(environment?.environmentRef, 'environment-ref-invalid', reasons);
  const expiryRef = token(environment?.expiryRef, 'environment-expiryRef-invalid', reasons);

  const transfer = context?.transfer;
  if (!transfer || typeof transfer !== 'object' || Array.isArray(transfer)) reasons.push('transfer-invalid');
  else unexpectedFields(transfer, new Set(['sourceScope', 'targetScope', 'personalAuthorityRef']), 'transfer', reasons);
  const sourceScope = safeToken(transfer?.sourceScope);
  const targetScope = safeToken(transfer?.targetScope);
  if (!TRANSFER_SCOPES.has(sourceScope)) reasons.push('transfer-sourceScope-invalid');
  if (!TRANSFER_SCOPES.has(targetScope)) reasons.push('transfer-targetScope-invalid');
  const personalAuthorityRef = transfer?.personalAuthorityRef == null ? null : safeToken(transfer.personalAuthorityRef);
  if (transfer?.personalAuthorityRef != null && !personalAuthorityRef) reasons.push('transfer-personalAuthorityRef-invalid');
  if (sourceScope === 'PERSONAL' && targetScope === 'POPULATION') reasons.push('personal-to-population-transfer-forbidden');
  if (sourceScope === 'POPULATION' && targetScope === 'PERSONAL' && !personalAuthorityRef) {
    reasons.push('population-to-personal-transfer-unapproved');
  }

  const comparison = context?.comparison;
  if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) reasons.push('comparison-invalid');
  else unexpectedFields(comparison, new Set(['axes', 'strongestAlternativeRef', 'noChangeRef']), 'comparison', reasons);
  const axes = normalizeAxes(comparison?.axes, reasons);
  const strongestAlternativeRef = token(comparison?.strongestAlternativeRef, 'comparison-strongestAlternativeRef-invalid', reasons);
  const noChangeRef = token(comparison?.noChangeRef, 'comparison-noChangeRef-invalid', reasons);

  const hypothesis = context?.hypothesis;
  if (!hypothesis || typeof hypothesis !== 'object' || Array.isArray(hypothesis)) reasons.push('hypothesis-invalid');
  else unexpectedFields(hypothesis, new Set(['expectedEffectRef', 'mechanismRef']), 'hypothesis', reasons);
  const expectedEffectRef = token(hypothesis?.expectedEffectRef, 'hypothesis-expectedEffectRef-invalid', reasons);
  const mechanismRef = token(hypothesis?.mechanismRef, 'hypothesis-mechanismRef-invalid', reasons);
  const confidenceRef = token(context?.confidenceRef, 'confidenceRef-invalid', reasons);

  if (reasons.length > 0 || !proposal) return decisionProductReject(reasons.length > 0 ? reasons : ['proposal-invalid'], proposalValidation);

  const evidenceRefs = proposal.supportingEvidence.map((item) => item.evidenceId).sort();
  const counterEvidenceRefs = proposal.counterEvidence.items.map((item) => item.evidenceId).sort();
  const projection = {
    schema: DECISION_PRODUCT_SCHEMA,
    decisionProductId,
    decisionProductVersion,
    consumerTaskId,
    consumerUseSiteRef,
    sourceProposal: {
      proposalId: proposal.proposalId,
      proposalVersion: proposal.proposalVersion,
      kind: proposal.kind,
      versions: { ...proposal.versions },
      cohortId: proposal.cohort.cohortId,
      affectedOwnerId: proposal.affectedOwnerId,
      changeRef: proposal.changeRef,
      evidenceRefs,
      counterEvidenceState: proposal.counterEvidence.state,
      counterEvidenceSearchRef: proposal.counterEvidence.searchRef,
      counterEvidenceRefs,
    },
    decisionContext: {
      decisionInput: { capturedAtDecision: true, contextRef: decisionContextRef },
      exposure: { opportunityState: 'KNOWN', opportunityRef, candidateSetRef },
      intervention: { reversible: true, interventionUnitRef, rollbackRef: interventionRollbackRef },
      proxy: { role: 'SUPPORTING_ONLY', limitationRef: proxyLimitationRef, primaryOutcomeRef },
      environment: { driftState: 'CURRENT', environmentRef, expiryRef },
      transfer: { sourceScope, targetScope, personalAuthorityRef },
      comparison: { axes, strongestAlternativeRef, noChangeRef },
      hypothesis: { expectedEffectRef, mechanismRef },
      confidenceRef,
    },
    offlineEvaluationReady: true,
    formalPromotionEligible: proposalValidation.releaseEligible === true,
    authoritativeReuseEligible: proposalValidation.reuseEligible === true,
    automaticMutationAllowed: false,
    personaMutationAllowed: false,
    relationshipMutationAllowed: false,
    containsRawEvents: false,
    containsPrivate: false,
    abstentionSupported: true,
  };

  return deepFreeze({
    ok: true,
    ready: true,
    abstain: false,
    reasons: [],
    projection,
    sourceProposalValid: true,
    formalPromotionEligible: projection.formalPromotionEligible,
    authoritativeReuseEligible: projection.authoritativeReuseEligible,
    automaticMutationAllowed: false,
  });
}
