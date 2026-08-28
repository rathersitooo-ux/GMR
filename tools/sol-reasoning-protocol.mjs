#!/usr/bin/env node
import { createHash } from 'node:crypto';

import { unpackReasoningPacket } from './executor-bus-packet-compressor.mjs';

export const SOL_REASONING_PROTOCOL_VERSION = 'gameroad-sol-reasoning-v2';
export const SOL_REASONING_RESPONSE_SCHEMA = 'sol-plan-v2';

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

const REQUEST_KIND = 'request';
const RESPONSE_KIND = 'response';
const MODES = new Set([
  'ROOT_CAUSE',
  'DESIGN_DECISION',
  'FAILURE_RECOVERY',
  'WORK_DECOMPOSITION',
  'REVIEW',
]);
const DISPOSITIONS = new Set(['PLAN', 'NEEDS_EVIDENCE', 'BLOCKED', 'NO_CHANGE']);
const CLAIM_KINDS = new Set(Object.values(CLAIM_KIND));
const CLAIM_STATUSES = new Set(Object.values(CLAIM_STATUS));
const EVIDENCE_REF_CLASSES = new Set(['user', 'authority', 'actual', 'test', 'counter']);
const REQUEST_KEYS = new Set([
  'protocolVersion',
  'kind',
  'requestId',
  'taskId',
  'workUnitKey',
  'acquireKey',
  'reasoningPacketFingerprint',
  'mode',
  'question',
  'returnSchema',
]);
const RESPONSE_KEYS = new Set([
  'protocolVersion',
  'kind',
  'requestId',
  'taskId',
  'workUnitKey',
  'acquireKey',
  'reasoningPacketFingerprint',
  'disposition',
  'cause',
  'claims',
  'selectedCauseClaimId',
  'decisionBasisRefs',
  'decision',
  'filesToChange',
  'doNotTouch',
  'implementationOrder',
  'tests',
  'rollback',
  'uncertainties',
  'evidenceRequests',
  'acceptanceCoverage',
]);

function fail(reason, extras = {}) {
  return { ok: false, reason, ...extras };
}

function cleanString(value, name, { max = 8000, optional = false } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (!out && !optional) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function cleanStringList(value, name, { required = false, maxItems = 64 } = {}) {
  if (!Array.isArray(value)) throw new Error(`${name}_must_be_array`);
  if (required && value.length === 0) throw new Error(`${name}_required`);
  if (value.length > maxItems) throw new Error(`${name}_too_many`);
  const out = value.map((item, index) => cleanString(item, `${name}_${index}`, { max: 2000 }));
  if (new Set(out).size !== out.length) throw new Error(`${name}_duplicate`);
  return out;
}

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}_must_be_object`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${label}_unknown_key:${key}`);
  }
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('base64url');
}

function requestIdentityBody(value) {
  return {
    protocolVersion: value.protocolVersion,
    kind: value.kind,
    taskId: value.taskId,
    workUnitKey: value.workUnitKey,
    acquireKey: value.acquireKey,
    reasoningPacketFingerprint: value.reasoningPacketFingerprint,
    mode: value.mode,
    question: value.question,
    returnSchema: value.returnSchema,
  };
}

function deriveRequestId(value) {
  return `solr_${hash(requestIdentityBody(value)).slice(0, 32)}`;
}

function scopeAllows(path, scopeEntry) {
  if (path === scopeEntry) return true;
  if (scopeEntry.endsWith('/**')) {
    const prefix = scopeEntry.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  return false;
}

function isWithinMutableScope(path, queuePacket) {
  return queuePacket.exactMutableResources.some((entry) => scopeAllows(path, entry));
}

function isProtected(path, queuePacket) {
  return queuePacket.doNotChange.some((entry) => scopeAllows(path, entry));
}

function normalizeAcceptanceCoverage(value, queuePacket) {
  if (!Array.isArray(value)) throw new Error('acceptanceCoverage_must_be_array');
  if (value.length !== queuePacket.acceptance.length) throw new Error('acceptanceCoverage_count');
  const seen = new Set();
  const normalized = value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`acceptanceCoverage_${index}_must_be_object`);
    }
    const keys = Object.keys(item);
    if (keys.length !== 2 || !keys.includes('acceptance') || !keys.includes('coveredBy')) {
      throw new Error(`acceptanceCoverage_${index}_shape`);
    }
    const acceptance = cleanString(item.acceptance, `acceptanceCoverage_${index}_acceptance`, { max: 1200 });
    const coveredBy = cleanStringList(
      item.coveredBy,
      `acceptanceCoverage_${index}_coveredBy`,
      { required: true, maxItems: 16 },
    );
    if (!queuePacket.acceptance.includes(acceptance)) throw new Error(`acceptanceCoverage_unknown:${acceptance}`);
    if (seen.has(acceptance)) throw new Error(`acceptanceCoverage_duplicate:${acceptance}`);
    seen.add(acceptance);
    return { acceptance, coveredBy };
  });
  for (const clause of queuePacket.acceptance) {
    if (!seen.has(clause)) throw new Error(`acceptanceCoverage_missing:${clause}`);
  }
  return normalized;
}

function evidenceIndex(context) {
  if (!Array.isArray(context)) throw new Error('context_must_be_array');
  const index = new Map();
  for (let i = 0; i < context.length; i += 1) {
    const item = context[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`context_${i}_must_be_object`);
    const id = cleanString(item.id, `context_${i}_id`, { max: 240 });
    if (index.has(id)) throw new Error(`context_duplicate_id:${id}`);
    index.set(id, item);
  }
  return index;
}

function refClass(ref) {
  const colon = ref.indexOf(':');
  return colon > 0 ? ref.slice(0, colon) : '';
}

function validateEvidenceRef(ref, index, name) {
  if (!index.has(ref)) throw new Error(`${name}_unknown_ref:${ref}`);
  const type = refClass(ref);
  if (!EVIDENCE_REF_CLASSES.has(type)) throw new Error(`${name}_untyped_ref:${ref}`);
  return type;
}

function normalizeClaim(raw, index, knownEvidence) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`claim_${index}_must_be_object`);
  const allowed = new Set([
    'id', 'kind', 'statement', 'status', 'evidenceRefs', 'counterEvidenceRefs',
    'discriminatingTestRefs', 'nextDiscriminator',
  ]);
  rejectUnknownKeys(raw, allowed, `claim_${index}`);
  const claim = {
    id: cleanString(raw.id, `claim_${index}_id`, { max: 120 }),
    kind: cleanString(raw.kind, `claim_${index}_kind`, { max: 40 }),
    statement: cleanString(raw.statement, `claim_${index}_statement`, { max: 4000 }),
    status: cleanString(raw.status, `claim_${index}_status`, { max: 40 }),
    evidenceRefs: cleanStringList(raw.evidenceRefs ?? [], `claim_${index}_evidenceRefs`, { maxItems: 64 }),
    counterEvidenceRefs: cleanStringList(raw.counterEvidenceRefs ?? [], `claim_${index}_counterEvidenceRefs`, { maxItems: 64 }),
    discriminatingTestRefs: cleanStringList(raw.discriminatingTestRefs ?? [], `claim_${index}_discriminatingTestRefs`, { maxItems: 64 }),
    nextDiscriminator: cleanString(raw.nextDiscriminator, `claim_${index}_nextDiscriminator`, { max: 2000, optional: true }),
  };
  if (!CLAIM_KINDS.has(claim.kind)) throw new Error(`claim_${index}_kind_invalid`);
  if (!CLAIM_STATUSES.has(claim.status)) throw new Error(`claim_${index}_status_invalid`);

  for (const ref of claim.evidenceRefs) validateEvidenceRef(ref, knownEvidence, `claim_${index}_evidenceRefs`);
  for (const ref of claim.counterEvidenceRefs) {
    const type = validateEvidenceRef(ref, knownEvidence, `claim_${index}_counterEvidenceRefs`);
    if (type !== 'counter') throw new Error(`claim_${index}_counterEvidenceRefs_wrong_type:${ref}`);
  }
  for (const ref of claim.discriminatingTestRefs) {
    const type = validateEvidenceRef(ref, knownEvidence, `claim_${index}_discriminatingTestRefs`);
    if (type !== 'test') throw new Error(`claim_${index}_discriminatingTestRefs_wrong_type:${ref}`);
  }

  const evidenceTypes = new Set(claim.evidenceRefs.map(refClass));
  if (claim.kind === CLAIM_KIND.ROOT_CAUSE && claim.status === CLAIM_STATUS.ESTABLISHED) {
    if (!evidenceTypes.has('actual')) throw new Error(`claim_${index}_root_cause_actual_required`);
    if (claim.counterEvidenceRefs.length === 0) throw new Error(`claim_${index}_root_cause_counter_required`);
    if (claim.discriminatingTestRefs.length === 0) throw new Error(`claim_${index}_root_cause_discriminating_test_required`);
  }
  if (claim.kind === CLAIM_KIND.ROOT_CAUSE && claim.status !== CLAIM_STATUS.ESTABLISHED && !claim.nextDiscriminator) {
    throw new Error(`claim_${index}_root_cause_next_discriminator_required`);
  }
  return claim;
}

function normalizeClaims(value, knownEvidence) {
  if (!Array.isArray(value)) throw new Error('claims_must_be_array');
  if (value.length > 64) throw new Error('claims_too_many');
  const claims = value.map((claim, index) => normalizeClaim(claim, index, knownEvidence));
  const seen = new Set();
  for (const claim of claims) {
    if (seen.has(claim.id)) throw new Error(`claim_duplicate_id:${claim.id}`);
    seen.add(claim.id);
  }
  return claims;
}

function hasRefType(refs, type) {
  return refs.some((ref) => refClass(ref) === type);
}

export function validateEvidenceClaims(input = {}, context = []) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('evidence_claim_input_must_be_object');
    const knownEvidence = evidenceIndex(context);
    const mode = cleanString(input.mode ?? 'DESIGN_DECISION', 'evidence_mode', { max: 80 });
    const disposition = cleanString(input.disposition, 'evidence_disposition', { max: 40 });
    const claims = normalizeClaims(input.claims ?? [], knownEvidence);
    const selectedCauseClaimId = cleanString(
      input.selectedCauseClaimId,
      'selectedCauseClaimId',
      { max: 120, optional: true },
    );
    const decisionBasisRefs = cleanStringList(input.decisionBasisRefs ?? [], 'decisionBasisRefs', { maxItems: 64 });
    for (const ref of decisionBasisRefs) validateEvidenceRef(ref, knownEvidence, 'decisionBasisRefs');

    const mutatingPlan = disposition === 'PLAN' && Array.isArray(input.filesToChange) && input.filesToChange.length > 0;
    if (mutatingPlan) {
      if (!(hasRefType(decisionBasisRefs, 'user') || hasRefType(decisionBasisRefs, 'authority'))) {
        throw new Error('mutating_plan_user_or_authority_basis_required');
      }
      if (!(hasRefType(decisionBasisRefs, 'actual') || hasRefType(decisionBasisRefs, 'test'))) {
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
      if (selectedCause.status !== CLAIM_STATUS.ESTABLISHED) throw new Error('root_cause_plan_established_cause_required');
    }

    if (selectedCause && selectedCause.status === CLAIM_STATUS.ESTABLISHED && mutatingPlan) {
      const selectedRefs = new Set([
        ...selectedCause.evidenceRefs,
        ...selectedCause.counterEvidenceRefs,
        ...selectedCause.discriminatingTestRefs,
      ]);
      if (!decisionBasisRefs.some((ref) => selectedRefs.has(ref))) {
        throw new Error('mutating_plan_selected_cause_basis_not_bound');
      }
    }

    return { ok: true, claims, selectedCauseClaimId, decisionBasisRefs };
  } catch (error) {
    return fail(error.message);
  }
}

export function buildSolRequest(reasoningPacket, options = {}) {
  const unpacked = unpackReasoningPacket(reasoningPacket);
  if (!unpacked.ok) return fail(`reasoning_packet_${unpacked.reason}`);

  try {
    const mode = cleanString(options.mode ?? 'DESIGN_DECISION', 'mode', { max: 80 });
    if (!MODES.has(mode)) throw new Error('mode_not_allowed');
    const question = cleanString(options.question, 'question', { max: 8000 });
    const request = {
      protocolVersion: SOL_REASONING_PROTOCOL_VERSION,
      kind: REQUEST_KIND,
      requestId: '',
      taskId: unpacked.queuePacket.taskId,
      workUnitKey: unpacked.queuePacket.workUnitKey,
      acquireKey: unpacked.queuePacket.acquireKey,
      reasoningPacketFingerprint: unpacked.fingerprint,
      mode,
      question,
      returnSchema: SOL_REASONING_RESPONSE_SCHEMA,
    };
    request.requestId = deriveRequestId(request);
    return {
      ok: true,
      request,
      queuePacket: unpacked.queuePacket,
      context: unpacked.context,
    };
  } catch (error) {
    return fail(error.message);
  }
}

export function validateSolRequest(input, reasoningPacket) {
  const unpacked = unpackReasoningPacket(reasoningPacket);
  if (!unpacked.ok) return fail(`reasoning_packet_${unpacked.reason}`);
  try {
    rejectUnknownKeys(input, REQUEST_KEYS, 'request');
    const request = {
      protocolVersion: cleanString(input.protocolVersion, 'protocolVersion', { max: 120 }),
      kind: cleanString(input.kind, 'kind', { max: 40 }),
      requestId: cleanString(input.requestId, 'requestId', { max: 120 }),
      taskId: cleanString(input.taskId, 'taskId', { max: 240 }),
      workUnitKey: cleanString(input.workUnitKey, 'workUnitKey', { max: 240 }),
      acquireKey: cleanString(input.acquireKey, 'acquireKey', { max: 300 }),
      reasoningPacketFingerprint: cleanString(
        input.reasoningPacketFingerprint,
        'reasoningPacketFingerprint',
        { max: 120 },
      ),
      mode: cleanString(input.mode, 'mode', { max: 80 }),
      question: cleanString(input.question, 'question'),
      returnSchema: cleanString(input.returnSchema, 'returnSchema', { max: 120 }),
    };
    if (request.protocolVersion !== SOL_REASONING_PROTOCOL_VERSION) throw new Error('protocol_version');
    if (request.kind !== REQUEST_KIND) throw new Error('request_kind');
    if (!MODES.has(request.mode)) throw new Error('mode_not_allowed');
    if (request.returnSchema !== SOL_REASONING_RESPONSE_SCHEMA) throw new Error('return_schema');
    for (const key of ['taskId', 'workUnitKey', 'acquireKey']) {
      if (request[key] !== unpacked.queuePacket[key]) throw new Error(`request_identity_mismatch:${key}`);
    }
    if (request.reasoningPacketFingerprint !== unpacked.fingerprint) {
      throw new Error('request_reasoning_fingerprint_mismatch');
    }
    if (request.requestId !== deriveRequestId(request)) throw new Error('request_id_mismatch');
    return { ok: true, request, queuePacket: unpacked.queuePacket, context: unpacked.context };
  } catch (error) {
    return fail(error.message);
  }
}

export function validateSolResponse(input, requestInput, reasoningPacket) {
  const requestChecked = validateSolRequest(requestInput, reasoningPacket);
  if (!requestChecked.ok) return fail(`request_${requestChecked.reason}`);
  const { request, queuePacket, context } = requestChecked;

  try {
    rejectUnknownKeys(input, RESPONSE_KEYS, 'response');
    const evidenceChecked = validateEvidenceClaims({
      mode: request.mode,
      disposition: input.disposition,
      filesToChange: input.filesToChange,
      claims: input.claims,
      selectedCauseClaimId: input.selectedCauseClaimId,
      decisionBasisRefs: input.decisionBasisRefs,
    }, context);
    if (!evidenceChecked.ok) throw new Error(`evidence_${evidenceChecked.reason}`);

    const response = {
      protocolVersion: cleanString(input.protocolVersion, 'protocolVersion', { max: 120 }),
      kind: cleanString(input.kind, 'kind', { max: 40 }),
      requestId: cleanString(input.requestId, 'requestId', { max: 120 }),
      taskId: cleanString(input.taskId, 'taskId', { max: 240 }),
      workUnitKey: cleanString(input.workUnitKey, 'workUnitKey', { max: 240 }),
      acquireKey: cleanString(input.acquireKey, 'acquireKey', { max: 300 }),
      reasoningPacketFingerprint: cleanString(
        input.reasoningPacketFingerprint,
        'reasoningPacketFingerprint',
        { max: 120 },
      ),
      disposition: cleanString(input.disposition, 'disposition', { max: 40 }),
      cause: cleanStringList(input.cause, 'cause', { required: true }),
      claims: evidenceChecked.claims,
      selectedCauseClaimId: evidenceChecked.selectedCauseClaimId,
      decisionBasisRefs: evidenceChecked.decisionBasisRefs,
      decision: cleanString(input.decision, 'decision'),
      filesToChange: cleanStringList(input.filesToChange, 'filesToChange'),
      doNotTouch: cleanStringList(input.doNotTouch, 'doNotTouch'),
      implementationOrder: cleanStringList(input.implementationOrder, 'implementationOrder'),
      tests: cleanStringList(input.tests, 'tests'),
      rollback: cleanStringList(input.rollback, 'rollback'),
      uncertainties: cleanStringList(input.uncertainties, 'uncertainties'),
      evidenceRequests: cleanStringList(input.evidenceRequests, 'evidenceRequests'),
      acceptanceCoverage: normalizeAcceptanceCoverage(input.acceptanceCoverage, queuePacket),
    };

    if (response.protocolVersion !== SOL_REASONING_PROTOCOL_VERSION) throw new Error('protocol_version');
    if (response.kind !== RESPONSE_KIND) throw new Error('response_kind');
    if (!DISPOSITIONS.has(response.disposition)) throw new Error('disposition_not_allowed');
    for (const key of ['requestId', 'taskId', 'workUnitKey', 'acquireKey', 'reasoningPacketFingerprint']) {
      if (response[key] !== request[key]) throw new Error(`response_correlation_mismatch:${key}`);
    }

    for (const path of response.filesToChange) {
      if (!isWithinMutableScope(path, queuePacket)) throw new Error(`file_outside_mutable_scope:${path}`);
      if (isProtected(path, queuePacket)) throw new Error(`file_protected:${path}`);
      if (response.doNotTouch.some((entry) => scopeAllows(path, entry))) {
        throw new Error(`file_response_do_not_touch_overlap:${path}`);
      }
    }
    for (const protectedEntry of queuePacket.doNotChange) {
      if (!response.doNotTouch.includes(protectedEntry)) {
        throw new Error(`missing_do_not_touch:${protectedEntry}`);
      }
    }

    if (response.disposition === 'PLAN' && response.filesToChange.length > 0) {
      if (response.implementationOrder.length === 0) throw new Error('plan_implementation_order_required');
      if (response.tests.length === 0) throw new Error('plan_tests_required');
      if (response.rollback.length === 0) throw new Error('plan_rollback_required');
    }
    if (response.disposition === 'NEEDS_EVIDENCE' && response.evidenceRequests.length === 0) {
      throw new Error('needs_evidence_requests_required');
    }
    if (response.disposition === 'NO_CHANGE') {
      if (response.filesToChange.length > 0) throw new Error('no_change_files_forbidden');
      if (response.implementationOrder.length > 0) throw new Error('no_change_implementation_forbidden');
    }

    return { ok: true, response, queuePacket, context };
  } catch (error) {
    return fail(error.message);
  }
}

function parseFencedJson(text, fence) {
  if (typeof text !== 'string') return fail('body_must_be_string');
  const escaped = fence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...text.matchAll(new RegExp('```' + escaped + '\\s*\\n([\\s\\S]*?)\\n```', 'gm'))];
  if (matches.length !== 1) return fail(matches.length === 0 ? `missing_fence:${fence}` : `multiple_fences:${fence}`);
  try {
    const value = JSON.parse(matches[0][1]);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('payload_must_be_object');
    return { ok: true, value };
  } catch (error) {
    return fail(`invalid_json:${error.message}`);
  }
}

export function parseSolResponse(text, request, reasoningPacket) {
  const parsed = parseFencedJson(text, 'sol-reasoning-response');
  if (!parsed.ok) return parsed;
  return validateSolResponse(parsed.value, request, reasoningPacket);
}

function responseTemplate(request, queuePacket) {
  return {
    protocolVersion: SOL_REASONING_PROTOCOL_VERSION,
    kind: RESPONSE_KIND,
    requestId: request.requestId,
    taskId: request.taskId,
    workUnitKey: request.workUnitKey,
    acquireKey: request.acquireKey,
    reasoningPacketFingerprint: request.reasoningPacketFingerprint,
    disposition: 'PLAN',
    cause: ['plain-language explanation; non-authoritative'],
    claims: [],
    selectedCauseClaimId: '',
    decisionBasisRefs: [],
    decision: 'single bounded decision',
    filesToChange: [],
    doNotTouch: queuePacket.doNotChange,
    implementationOrder: [],
    tests: [],
    rollback: [],
    uncertainties: [],
    evidenceRequests: [],
    acceptanceCoverage: queuePacket.acceptance.map((acceptance) => ({
      acceptance,
      coveredBy: ['how this clause will be satisfied or verified'],
    })),
  };
}

export function buildSolPrompt(reasoningPacket, options = {}) {
  const built = buildSolRequest(reasoningPacket, options);
  if (!built.ok) return built;
  const compact = typeof reasoningPacket === 'string' ? reasoningPacket : JSON.stringify(reasoningPacket);
  const requestJson = JSON.stringify(built.request);
  const templateJson = JSON.stringify(responseTemplate(built.request, built.queuePacket), null, 2);
  const prompt = [
    'Act only as the reasoning/decision side of a split executor loop.',
    'Do not claim execution, file mutation, tests run, deployment, or product success.',
    'Do not expand mutable scope. Do not emit shell commands, secrets, credentials, or a second task identity.',
    'Treat prose explanations and cause text as non-authoritative. Executable decisions must cite frozen context IDs.',
    'Evidence IDs are typed by prefix: user:, authority:, actual:, test:, counter:. Never invent an ID that is absent from the packet.',
    'A mutating PLAN needs user: or authority: basis plus actual: or test: basis.',
    'In ROOT_CAUSE mode, PLAN requires one selected ROOT_CAUSE claim with status ESTABLISHED, actual evidence, counterevidence, and a discriminating test result. A plausible story is not an established cause.',
    'If causal alternatives have not been discriminated, return NEEDS_EVIDENCE, keep the cause as HYPOTHESIS/UNKNOWN, and name the next discriminator.',
    'Writable or convenient state is not evidence that it is the correct repair surface.',
    'Cover every acceptance clause. Return exactly one fenced JSON block named sol-reasoning-response and no second response block.',
    '',
    'REQUEST:',
    requestJson,
    '',
    'REASONING_PACKET:',
    compact,
    '',
    'RESPONSE_SHAPE:',
    '```sol-reasoning-response',
    templateJson,
    '```',
  ].join('\n');
  return { ok: true, request: built.request, prompt, queuePacket: built.queuePacket };
}
