export const BATTLE_RULE_COVERAGE_SCHEMA = 'gameroad.battle-rule-coverage.v1';

const CONCEPT_STATUSES = new Set(['KNOWN', 'UNRESOLVED', 'CONFLICTED', 'NO_EVIDENCE']);
const ACTIVATION_STATES = new Set(['ENABLED', 'INTENTIONALLY_DISABLED', 'NO_PROFILE', 'NOT_APPLICABLE']);
const PRESERVATION_DISPOSITIONS = new Set([
  'PRESERVE',
  'EXPLICIT_REPLACEMENT',
  'EXPLICIT_OBSOLETE',
  'UNASSESSED',
  'NOT_PREDECESSOR',
]);
const CHAIN_STAGES = Object.freeze([
  'authority',
  'producer',
  'stateTransition',
  'consumer',
  'playerFacing',
  'reconnect',
  'replay',
  'tests',
]);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function canonicalStringSet(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  return [...new Set(values.map((value, index) => requireString(value, `${label}[${index}]`)))].sort();
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function normalizeConcept(rawConcept) {
  if (!isPlainObject(rawConcept)) throw new TypeError('concept must be an object');
  const status = requireString(rawConcept.status, 'concept.status');
  if (!CONCEPT_STATUSES.has(status)) throw new TypeError(`unsupported concept.status: ${status}`);
  return {
    status,
    authorityRefs: canonicalStringSet(rawConcept.authorityRefs, 'concept.authorityRefs'),
    unresolvedAtoms: canonicalStringSet(rawConcept.unresolvedAtoms, 'concept.unresolvedAtoms'),
  };
}

function normalizeActivation(rawActivation) {
  if (!isPlainObject(rawActivation)) throw new TypeError('activation must be an object');
  const state = requireString(rawActivation.state, 'activation.state');
  if (!ACTIVATION_STATES.has(state)) throw new TypeError(`unsupported activation.state: ${state}`);
  return {
    state,
    profileRefs: canonicalStringSet(rawActivation.profileRefs, 'activation.profileRefs'),
    expectedInAtLeastOneProfile: rawActivation.expectedInAtLeastOneProfile === undefined
      ? false
      : requireBoolean(rawActivation.expectedInAtLeastOneProfile, 'activation.expectedInAtLeastOneProfile'),
  };
}

function normalizePreservation(rawPreservation = {}) {
  if (!isPlainObject(rawPreservation)) throw new TypeError('preservation must be an object');
  const predecessorPresent = rawPreservation.predecessorPresent === undefined
    ? false
    : requireBoolean(rawPreservation.predecessorPresent, 'preservation.predecessorPresent');
  const defaultDisposition = predecessorPresent ? 'UNASSESSED' : 'NOT_PREDECESSOR';
  const disposition = rawPreservation.disposition === undefined
    ? defaultDisposition
    : requireString(rawPreservation.disposition, 'preservation.disposition');
  if (!PRESERVATION_DISPOSITIONS.has(disposition)) {
    throw new TypeError(`unsupported preservation.disposition: ${disposition}`);
  }
  if (!predecessorPresent && disposition !== 'NOT_PREDECESSOR') {
    throw new TypeError('non-predecessor atoms must use NOT_PREDECESSOR disposition');
  }
  return {
    predecessorPresent,
    disposition,
    evidenceRefs: canonicalStringSet(rawPreservation.evidenceRefs, 'preservation.evidenceRefs'),
    successorAtomIds: canonicalStringSet(rawPreservation.successorAtomIds, 'preservation.successorAtomIds'),
  };
}

function normalizeChain(rawChain) {
  if (!isPlainObject(rawChain)) throw new TypeError('chain must be an object');
  const requiredStages = canonicalStringSet(rawChain.requiredStages, 'chain.requiredStages');
  for (const stage of requiredStages) {
    if (!CHAIN_STAGES.includes(stage)) throw new TypeError(`unsupported chain stage: ${stage}`);
  }
  const evidence = isPlainObject(rawChain.evidence) ? rawChain.evidence : {};
  const normalizedEvidence = {};
  for (const stage of CHAIN_STAGES) {
    normalizedEvidence[stage] = canonicalStringSet(evidence[stage], `chain.evidence.${stage}`);
  }
  return { requiredStages, evidence: normalizedEvidence };
}

function missingRequiredStages(chain) {
  return chain.requiredStages.filter((stage) => chain.evidence[stage].length === 0);
}

function classifyImplementation(chain) {
  if (chain.requiredStages.length === 0) return 'NOT_REQUIRED';
  const missing = missingRequiredStages(chain);
  if (missing.length === 0) return 'IMPLEMENTED';
  if (chain.requiredStages.includes('producer') && chain.evidence.producer.length === 0) return 'MISSING';
  if (
    (chain.requiredStages.includes('consumer') && chain.evidence.consumer.length === 0)
    || (chain.requiredStages.includes('playerFacing') && chain.evidence.playerFacing.length === 0)
  ) {
    return 'DISCONNECTED';
  }
  return 'PARTIAL';
}

function issue(code, axis, detail = {}) {
  return { code, axis, ...detail };
}

function preservationIssues(preservation, implementationStatus, missingStages) {
  if (!preservation.predecessorPresent) return [];
  if (preservation.disposition === 'UNASSESSED') {
    return [issue('PREDECESSOR_DISPOSITION_UNASSESSED', 'preservation')];
  }
  if (
    ['PRESERVE', 'EXPLICIT_REPLACEMENT', 'EXPLICIT_OBSOLETE'].includes(preservation.disposition)
    && preservation.evidenceRefs.length === 0
  ) {
    return [issue('PREDECESSOR_DISPOSITION_UNEVIDENCED', 'preservation', {
      disposition: preservation.disposition,
    })];
  }
  if (preservation.disposition === 'EXPLICIT_REPLACEMENT' && preservation.successorAtomIds.length === 0) {
    return [issue('PREDECESSOR_REPLACEMENT_SUCCESSOR_MISSING', 'preservation')];
  }
  if (
    preservation.disposition === 'PRESERVE'
    && ['MISSING', 'DISCONNECTED', 'PARTIAL'].includes(implementationStatus)
  ) {
    return [issue('PRESERVED_FEATURE_IMPLEMENTATION_GAP', 'preservation', {
      missingStages: [...missingStages],
    })];
  }
  return [];
}

function conceptIssues(concept) {
  if (concept.status === 'KNOWN') {
    if (concept.authorityRefs.length === 0) {
      return [issue('KNOWN_CONCEPT_WITHOUT_AUTHORITY_EVIDENCE', 'concept')];
    }
    return [];
  }
  if (concept.status === 'UNRESOLVED') {
    return [issue('CONCEPT_UNRESOLVED', 'concept', { atoms: [...concept.unresolvedAtoms] })];
  }
  if (concept.status === 'CONFLICTED') return [issue('CONCEPT_CONFLICTED', 'concept')];
  return [issue('CONCEPT_NO_EVIDENCE', 'concept')];
}

function implementationIssues(concept, activation, implementationStatus, missingStages) {
  if (concept.status !== 'KNOWN') return [];
  if (activation.state === 'INTENTIONALLY_DISABLED' || activation.state === 'NOT_APPLICABLE') return [];
  if (implementationStatus === 'IMPLEMENTED' || implementationStatus === 'NOT_REQUIRED') return [];
  return [issue(`IMPLEMENTATION_${implementationStatus}`, 'implementation', {
    missingStages: [...missingStages],
  })];
}

function activationIssues(concept, activation, implementationStatus) {
  if (activation.state === 'NO_PROFILE' && activation.expectedInAtLeastOneProfile) {
    return [issue('ACTIVATION_PROFILE_MISSING', 'activation')];
  }
  if (
    activation.state === 'ENABLED'
    && concept.status === 'KNOWN'
    && !['IMPLEMENTED', 'NOT_REQUIRED'].includes(implementationStatus)
  ) {
    return [issue('ENABLED_WITH_IMPLEMENTATION_GAP', 'activation', { implementationStatus })];
  }
  if (activation.state === 'ENABLED' && activation.profileRefs.length === 0) {
    return [issue('ENABLED_WITHOUT_PROFILE_EVIDENCE', 'activation')];
  }
  return [];
}

function overallStatus({ concept, activation, preservation, implementationStatus, issues }) {
  if (issues.some((entry) => entry.axis === 'preservation')) return 'PRESERVATION_VIOLATION';
  if (concept.status === 'CONFLICTED') return 'CONCEPT_CONFLICTED';
  if (concept.status === 'UNRESOLVED' || concept.status === 'NO_EVIDENCE') return 'CONCEPT_BLOCKED';
  if (issues.some((entry) => entry.axis === 'implementation')) return 'IMPLEMENTATION_GAP';
  if (issues.some((entry) => entry.axis === 'activation')) return 'ACTIVATION_GAP';
  if (activation.state === 'INTENTIONALLY_DISABLED' || activation.state === 'NOT_APPLICABLE') {
    return 'INTENTIONALLY_INACTIVE';
  }
  if (preservation.disposition === 'EXPLICIT_OBSOLETE') return 'EXPLICITLY_OBSOLETE';
  if (implementationStatus === 'NOT_REQUIRED' && activation.state === 'NO_PROFILE') return 'ASSESSED_INACTIVE';
  return 'COMPLETE';
}

export function assessBattleRuleAtom(rawAtom) {
  if (!isPlainObject(rawAtom)) throw new TypeError('Battle rule coverage atom must be an object');
  const atomId = requireString(rawAtom.atomId, 'atomId');
  const concept = normalizeConcept(rawAtom.concept);
  const activation = normalizeActivation(rawAtom.activation);
  const preservation = normalizePreservation(rawAtom.preservation);
  const chain = normalizeChain(rawAtom.chain);
  const missingStages = missingRequiredStages(chain);
  const implementationStatus = classifyImplementation(chain);

  const issues = [
    ...conceptIssues(concept),
    ...preservationIssues(preservation, implementationStatus, missingStages),
    ...implementationIssues(concept, activation, implementationStatus, missingStages),
    ...activationIssues(concept, activation, implementationStatus),
  ].sort((left, right) => `${left.axis}:${left.code}`.localeCompare(`${right.axis}:${right.code}`));

  const result = {
    schema: BATTLE_RULE_COVERAGE_SCHEMA,
    atomId,
    concept,
    implementation: {
      status: implementationStatus,
      requiredStages: [...chain.requiredStages],
      missingStages: [...missingStages],
      evidence: chain.evidence,
    },
    activation,
    preservation,
    overallStatus: overallStatus({ concept, activation, preservation, implementationStatus, issues }),
    issues,
    implementationActionAllowed: concept.status === 'KNOWN'
      && preservation.disposition !== 'EXPLICIT_OBSOLETE',
  };

  return deepFreeze(result);
}

export function assessBattleRuleCoverage(rawAtoms) {
  if (!Array.isArray(rawAtoms)) throw new TypeError('Battle rule coverage input must be an array');
  const seen = new Set();
  const atoms = rawAtoms.map((rawAtom) => {
    const assessment = assessBattleRuleAtom(rawAtom);
    if (seen.has(assessment.atomId)) throw new TypeError(`duplicate atomId: ${assessment.atomId}`);
    seen.add(assessment.atomId);
    return assessment;
  }).sort((left, right) => left.atomId.localeCompare(right.atomId));

  const holes = atoms
    .filter((atom) => ![
      'COMPLETE',
      'INTENTIONALLY_INACTIVE',
      'EXPLICITLY_OBSOLETE',
      'ASSESSED_INACTIVE',
    ].includes(atom.overallStatus))
    .map((atom) => ({
      atomId: atom.atomId,
      overallStatus: atom.overallStatus,
      issueCodes: atom.issues.map((entry) => entry.code),
    }));

  const counts = {};
  for (const atom of atoms) counts[atom.overallStatus] = (counts[atom.overallStatus] ?? 0) + 1;

  return deepFreeze({
    schema: BATTLE_RULE_COVERAGE_SCHEMA,
    atoms,
    holes,
    counts,
    complete: holes.length === 0,
  });
}

export const BATTLE_RULE_COVERAGE_CONTRACT = Object.freeze({
  conceptImplementationActivationIndependent: true,
  predecessorSilenceIsNotRemovalAuthority: true,
  intentionallyDisabledOptionalRuleIsNotAnOmission: true,
  codeExistenceAloneMeansImplemented: false,
  unresolvedConceptAllowsImplementationGuess: false,
  diagnosticWritesGameplay: false,
  diagnosticWritesRules: false,
  diagnosticWritesUi: false,
  diagnosticCreatesSecondTracker: false,
});
