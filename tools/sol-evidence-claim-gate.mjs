export const CLAIM_KIND = Object.freeze({
  OBSERVATION: 'OBSERVATION',
  HYPOTHESIS: 'HYPOTHESIS',
  ROOT_CAUSE: 'ROOT_CAUSE',
  CONSTRAINT: 'CONSTRAINT',
});

export const CLAIM_STATUS = Object.freeze({
  OBSERVED: 'OBSERVED',
  SUPPORTED: 'SUPPORTED',
  HYPOTHESIS: 'HYPOTHESIS',
  ESTABLISHED: 'ESTABLISHED',
  UNKNOWN: 'UNKNOWN',
});

const CLAIM_KINDS = new Set(Object.values(CLAIM_KIND));
const CLAIM_STATUSES = new Set(Object.values(CLAIM_STATUS));
const REF_CLASSES = new Set(['user', 'authority', 'actual', 'test', 'counter']);

function fail(reason, extras = {}) {
  return { ok: false, reason, ...extras };
}

function requiredString(value, name, max = 4000) {
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (!out) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function stringList(value, name, { required = false, maxItems = 64 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${name}_must_be_array`);
  if (required && value.length === 0) throw new Error(`${name}_required`);
  if (value.length > maxItems) throw new Error(`${name}_too_many`);
  const out = value.map((entry, index) => requiredString(entry, `${name}_${index}`, 512));
  if (new Set(out).size !== out.length) throw new Error(`${name}_duplicate`);
  return out;
}

function contextIndex(context) {
  if (!Array.isArray(context)) throw new Error('context_must_be_array');
  const index = new Map();
  for (let i = 0; i < context.length; i += 1) {
    const item = context[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`context_${i}_must_be_object`);
    const id = requiredString(item.id, `context_${i}_id`, 240);
    if (index.has(id)) throw new Error(`context_duplicate_id:${id}`);
    index.set(id, item);
  }
  return index;
}

function refClass(ref) {
  const colon = ref.indexOf(':');
  return colon > 0 ? ref.slice(0, colon) : '';
}

function validateRef(ref, index, name) {
  if (!index.has(ref)) throw new Error(`${name}_unknown_ref:${ref}`);
  const kind = refClass(ref);
  if (!REF_CLASSES.has(kind)) throw new Error(`${name}_untyped_ref:${ref}`);
  return kind;
}

function normalizeClaim(raw, index, evidenceIndex) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`claim_${index}_must_be_object`);
  const allowed = new Set([
    'id', 'kind', 'statement', 'status', 'evidenceRefs', 'counterEvidenceRefs',
    'discriminatingTestRefs', 'nextDiscriminator',
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) throw new Error(`claim_${index}_unknown_key:${key}`);
  }
  const claim = {
    id: requiredString(raw.id, `claim_${index}_id`, 120),
    kind: requiredString(raw.kind, `claim_${index}_kind`, 40),
    statement: requiredString(raw.statement, `claim_${index}_statement`),
    status: requiredString(raw.status, `claim_${index}_status`, 40),
    evidenceRefs: stringList(raw.evidenceRefs ?? [], `claim_${index}_evidenceRefs`),
    counterEvidenceRefs: stringList(raw.counterEvidenceRefs ?? [], `claim_${index}_counterEvidenceRefs`),
    discriminatingTestRefs: stringList(raw.discriminatingTestRefs ?? [], `claim_${index}_discriminatingTestRefs`),
    nextDiscriminator: typeof raw.nextDiscriminator === 'string' ? raw.nextDiscriminator.trim() : '',
  };
  if (!CLAIM_KINDS.has(claim.kind)) throw new Error(`claim_${index}_kind_invalid`);
  if (!CLAIM_STATUSES.has(claim.status)) throw new Error(`claim_${index}_status_invalid`);

  for (const ref of claim.evidenceRefs) validateRef(ref, evidenceIndex, `claim_${index}_evidenceRefs`);
  for (const ref of claim.counterEvidenceRefs) {
    const type = validateRef(ref, evidenceIndex, `claim_${index}_counterEvidenceRefs`);
    if (type !== 'counter') throw new Error(`claim_${index}_counterEvidenceRefs_wrong_type:${ref}`);
  }
  for (const ref of claim.discriminatingTestRefs) {
    const type = validateRef(ref, evidenceIndex, `claim_${index}_discriminatingTestRefs`);
    if (type !== 'test') throw new Error(`claim_${index}_discriminatingTestRefs_wrong_type:${ref}`);
  }

  const evidenceTypes = new Set(claim.evidenceRefs.map(refClass));
  if (claim.kind === CLAIM_KIND.ROOT_CAUSE && claim.status === CLAIM_STATUS.ESTABLISHED) {
    if (!evidenceTypes.has('actual')) throw new Error(`claim_${index}_root_cause_actual_required`);
    if (claim.counterEvidenceRefs.length === 0) throw new Error(`claim_${index}_root_cause_counter_required`);
    if (claim.discriminatingTestRefs.length === 0) throw new Error(`claim_${index}_root_cause_discriminating_test_required`);
  }
  if (
    claim.kind === CLAIM_KIND.ROOT_CAUSE
    && claim.status !== CLAIM_STATUS.ESTABLISHED
    && !claim.nextDiscriminator
  ) {
    throw new Error(`claim_${index}_root_cause_next_discriminator_required`);
  }
  return claim;
}

function normalizeClaims(rawClaims, evidenceIndex) {
  if (!Array.isArray(rawClaims)) throw new Error('claims_must_be_array');
  if (rawClaims.length > 64) throw new Error('claims_too_many');
  const claims = rawClaims.map((claim, index) => normalizeClaim(claim, index, evidenceIndex));
  const ids = new Set();
  for (const claim of claims) {
    if (ids.has(claim.id)) throw new Error(`claim_duplicate_id:${claim.id}`);
    ids.add(claim.id);
  }
  return claims;
}

function hasType(refs, type) {
  return refs.some((ref) => refClass(ref) === type);
}

export function validateEvidenceClaims(input = {}, context = []) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('input_must_be_object');
    const evidenceIndex = contextIndex(context);
    const mode = requiredString(input.mode ?? 'DESIGN_DECISION', 'mode', 80);
    const disposition = requiredString(input.disposition, 'disposition', 40);
    const claims = normalizeClaims(input.claims ?? [], evidenceIndex);
    const selectedCauseClaimId = typeof input.selectedCauseClaimId === 'string'
      ? input.selectedCauseClaimId.trim()
      : '';
    const decisionBasisRefs = stringList(input.decisionBasisRefs ?? [], 'decisionBasisRefs');
    for (const ref of decisionBasisRefs) validateRef(ref, evidenceIndex, 'decisionBasisRefs');

    const mutatingPlan = disposition === 'PLAN' && Array.isArray(input.filesToChange) && input.filesToChange.length > 0;
    if (mutatingPlan) {
      if (!(hasType(decisionBasisRefs, 'user') || hasType(decisionBasisRefs, 'authority'))) {
        throw new Error('mutating_plan_user_or_authority_basis_required');
      }
      if (!(hasType(decisionBasisRefs, 'actual') || hasType(decisionBasisRefs, 'test'))) {
        throw new Error('mutating_plan_actual_or_test_basis_required');
      }
    }

    const claimById = new Map(claims.map((claim) => [claim.id, claim]));
    let selectedCause = null;
    if (selectedCauseClaimId) {
      selectedCause = claimById.get(selectedCauseClaimId) ?? null;
      if (!selectedCause) throw new Error(`selected_cause_unknown:${selectedCauseClaimId}`);
      if (selectedCause.kind !== CLAIM_KIND.ROOT_CAUSE) throw new Error('selected_cause_must_be_root_cause');
    }

    if (mode === 'ROOT_CAUSE' && disposition === 'PLAN') {
      if (!selectedCause) throw new Error('root_cause_plan_selected_cause_required');
      if (selectedCause.status !== CLAIM_STATUS.ESTABLISHED) {
        throw new Error('root_cause_plan_established_cause_required');
      }
    }

    if (selectedCause && selectedCause.status === CLAIM_STATUS.ESTABLISHED) {
      const selectedRefs = new Set([
        ...selectedCause.evidenceRefs,
        ...selectedCause.counterEvidenceRefs,
        ...selectedCause.discriminatingTestRefs,
      ]);
      if (mutatingPlan && !decisionBasisRefs.some((ref) => selectedRefs.has(ref))) {
        throw new Error('mutating_plan_selected_cause_basis_not_bound');
      }
    }

    return {
      ok: true,
      claims,
      selectedCauseClaimId,
      decisionBasisRefs,
      evidenceIds: [...evidenceIndex.keys()],
    };
  } catch (error) {
    return fail(error.message);
  }
}
