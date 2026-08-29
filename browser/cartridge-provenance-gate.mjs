import { normalizeCartridgeManifest } from './cartridge-manifest-core.mjs';
import { normalizeCartridgeProducerCandidate } from './cartridge-producer-core.mjs';

const FORMAL_RIGHTS = new Set(['SELF_CREATED', 'LICENSED', 'PUBLIC_DOMAIN']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function evaluateCartridgeProducerCandidate(input) {
  const reasons = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return deepFreeze({ ok: false, reasons: ['candidate-invalid'], candidate: null, hostCandidate: null });
  }
  if (input.authority !== 'CANDIDATE_ONLY') reasons.push('authority-not-candidate-only');

  const {
    authority: _authority,
    ...normalizableInput
  } = input;
  const producer = normalizeCartridgeProducerCandidate(normalizableInput);
  if (!producer.ok) reasons.push(...producer.reasons.map((reason) => `producer:${reason}`));

  const manifest = normalizeCartridgeManifest(input.manifest);
  if (!manifest.ok) reasons.push(...manifest.reasons.map((reason) => `manifest:${reason}`));

  const provenance = producer.candidate?.provenance;
  if (provenance?.containsPrivate === true) reasons.push('private-content-forbidden');
  if (provenance?.containsCredentials === true) reasons.push('credentials-forbidden');
  if (provenance?.useScope === 'FORMAL_REVIEW_CANDIDATE') {
    if (!FORMAL_RIGHTS.has(provenance.rightsStatus)) reasons.push('formal-review-rights-unresolved');
    if (provenance.declaredOrigin === 'UNKNOWN') reasons.push('formal-review-origin-unresolved');
  }

  const controls = producer.candidate?.controls;
  if (controls) {
    for (const field of [
      'automaticInstall',
      'automaticPublish',
      'automaticRanked',
      'automaticReward',
      'automaticCanonMutation',
      'automaticRelationshipMutation',
    ]) {
      if (controls[field] !== false) reasons.push(`side-effect-forbidden:${field}`);
    }
  }

  const uniqueReasons = [...new Set(reasons)].sort();
  if (uniqueReasons.length > 0) {
    return deepFreeze({ ok: false, reasons: uniqueReasons, candidate: producer.candidate, hostCandidate: null });
  }

  const candidate = {
    ...producer.candidate,
    manifest: manifest.manifest,
    authority: 'CANDIDATE_ONLY',
  };
  return deepFreeze({
    ok: true,
    reasons: [],
    candidate,
    hostCandidate: {
      manifest: manifest.manifest,
      producer: {
        producerKind: candidate.producerKind,
        requestId: candidate.requestId,
        sourceId: candidate.sourceId,
        provenance: candidate.provenance,
      },
      authority: 'HOST_CANDIDATE_ONLY',
      capabilityAuthority: 'REQUEST_ONLY',
      installAuthorized: false,
      publishAuthorized: false,
      rankedAuthorized: false,
      rewardAuthorized: false,
      canonMutationAuthorized: false,
      relationshipMutationAuthorized: false,
    },
  });
}

export function assertCartridgeProducerCandidateAllowed(input) {
  const result = evaluateCartridgeProducerCandidate(input);
  if (!result.ok) throw new Error(`CARTRIDGE_PROVENANCE_GATE_REJECTED:${result.reasons.join(',')}`);
  return result.hostCandidate;
}
