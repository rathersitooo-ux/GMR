import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEvidenceClaims } from '../tools/sol-evidence-claim-gate.mjs';

const context = [
  { id: 'user:directive', text: 'User requested the bounded repair.' },
  { id: 'authority:current', text: 'Current authority permits the bounded target.' },
  { id: 'actual:symptom', text: 'The observed symptom is reproducible.' },
  { id: 'test:ab', text: 'A/B discriminator changes only factor X and the symptom follows X.' },
  { id: 'counter:alt', text: 'Alternative Y remains plausible until the A/B result excludes it.' },
];

function establishedRootCause() {
  return {
    id: 'cause-x',
    kind: 'ROOT_CAUSE',
    statement: 'Factor X causes the observed failure in the bounded environment.',
    status: 'ESTABLISHED',
    evidenceRefs: ['actual:symptom', 'test:ab'],
    counterEvidenceRefs: ['counter:alt'],
    discriminatingTestRefs: ['test:ab'],
    nextDiscriminator: '',
  };
}

function plan(overrides = {}) {
  return {
    mode: 'ROOT_CAUSE',
    disposition: 'PLAN',
    filesToChange: ['src/a.mjs'],
    claims: [establishedRootCause()],
    selectedCauseClaimId: 'cause-x',
    decisionBasisRefs: ['user:directive', 'actual:symptom', 'test:ab'],
    ...overrides,
  };
}

test('accepts established root cause only when evidence is structurally bound', () => {
  const checked = validateEvidenceClaims(plan(), context);
  assert.equal(checked.ok, true);
  assert.equal(checked.selectedCauseClaimId, 'cause-x');
});

test('rejects invented evidence references', () => {
  const candidate = establishedRootCause();
  candidate.evidenceRefs = ['actual:not-in-packet', 'test:ab'];
  const checked = validateEvidenceClaims(plan({ claims: [candidate] }), context);
  assert.equal(checked.ok, false);
  assert.match(checked.reason, /unknown_ref:actual:not-in-packet/);
});

test('rejects established root cause without a discriminating test', () => {
  const candidate = establishedRootCause();
  candidate.discriminatingTestRefs = [];
  const checked = validateEvidenceClaims(plan({ claims: [candidate] }), context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'claim_0_root_cause_discriminating_test_required');
});

test('rejects established root cause without explicit counterevidence', () => {
  const candidate = establishedRootCause();
  candidate.counterEvidenceRefs = [];
  const checked = validateEvidenceClaims(plan({ claims: [candidate] }), context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'claim_0_root_cause_counter_required');
});

test('rejects ROOT_CAUSE PLAN that promotes a hypothesis to a fix', () => {
  const candidate = {
    id: 'guess-x',
    kind: 'ROOT_CAUSE',
    statement: 'X is plausible but not discriminated from Y.',
    status: 'HYPOTHESIS',
    evidenceRefs: ['actual:symptom'],
    counterEvidenceRefs: ['counter:alt'],
    discriminatingTestRefs: [],
    nextDiscriminator: 'Run the X-vs-Y A/B test.',
  };
  const checked = validateEvidenceClaims(plan({
    claims: [candidate],
    selectedCauseClaimId: 'guess-x',
  }), context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'root_cause_plan_established_cause_required');
});

test('allows unresolved causal hypotheses only when execution does not proceed', () => {
  const candidate = {
    id: 'guess-x',
    kind: 'ROOT_CAUSE',
    statement: 'X is one live hypothesis.',
    status: 'HYPOTHESIS',
    evidenceRefs: ['actual:symptom'],
    counterEvidenceRefs: ['counter:alt'],
    discriminatingTestRefs: [],
    nextDiscriminator: 'Run the X-vs-Y A/B test.',
  };
  const checked = validateEvidenceClaims({
    mode: 'ROOT_CAUSE',
    disposition: 'NEEDS_EVIDENCE',
    filesToChange: [],
    claims: [candidate],
    selectedCauseClaimId: 'guess-x',
    decisionBasisRefs: ['actual:symptom'],
  }, context);
  assert.equal(checked.ok, true);
});

test('rejects mutating plan justified only by writable actual state', () => {
  const checked = validateEvidenceClaims(plan({
    mode: 'DESIGN_DECISION',
    selectedCauseClaimId: '',
    claims: [],
    decisionBasisRefs: ['actual:symptom'],
  }), context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'mutating_plan_user_or_authority_basis_required');
});

test('rejects mutating plan justified only by user intent without actual or test evidence', () => {
  const checked = validateEvidenceClaims(plan({
    mode: 'DESIGN_DECISION',
    selectedCauseClaimId: '',
    claims: [],
    decisionBasisRefs: ['user:directive'],
  }), context);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'mutating_plan_actual_or_test_basis_required');
});

test('accepts bounded non-causal mutation with user or authority plus actual evidence', () => {
  const checked = validateEvidenceClaims(plan({
    mode: 'DESIGN_DECISION',
    selectedCauseClaimId: '',
    claims: [],
    decisionBasisRefs: ['authority:current', 'actual:symptom'],
  }), context);
  assert.equal(checked.ok, true);
});

test('regression: global behavior request plus writable project file cannot justify project mutation', () => {
  const regressionContext = [
    { id: 'user:global-behavior', text: 'User requested a global assistant behavior change.' },
    { id: 'actual:project-drive-writable', text: 'GAMEROAD Drive is writable.' },
    { id: 'counter:surface-mismatch', text: 'Writable project state is not evidence of global behavior authority.' },
  ];
  const unsupported = {
    id: 'drive-is-root',
    kind: 'ROOT_CAUSE',
    statement: 'The project Drive is the root cause and correct repair surface.',
    status: 'ESTABLISHED',
    evidenceRefs: ['actual:project-drive-writable'],
    counterEvidenceRefs: ['counter:surface-mismatch'],
    discriminatingTestRefs: [],
    nextDiscriminator: '',
  };
  const checked = validateEvidenceClaims({
    mode: 'ROOT_CAUSE',
    disposition: 'PLAN',
    filesToChange: ['project/ops-rule'],
    claims: [unsupported],
    selectedCauseClaimId: 'drive-is-root',
    decisionBasisRefs: ['user:global-behavior', 'actual:project-drive-writable'],
  }, regressionContext);
  assert.equal(checked.ok, false);
  assert.equal(checked.reason, 'claim_0_root_cause_discriminating_test_required');
});
