import test from 'node:test';
import assert from 'node:assert/strict';

import {
  JIT_EVIDENCE_SCHEMA_VERSION,
  compileJitEvidencePacket,
} from '../tools/jit-evidence-compiler.mjs';

function base(overrides = {}) {
  return {
    schemaVersion: JIT_EVIDENCE_SCHEMA_VERSION,
    decisionQuestion: 'Can the current WorkUnit mutate safely and satisfy its consumer?',
    maxContextBytes: 5000,
    requiredHotIds: ['authority', 'actual', 'consumer', 'acceptance'],
    issues: [],
    relations: [],
    evidence: [
      { id: 'authority', tier: 'HOT', state: 'CURRENT_AUTHORITY', role: 'AUTHORITY', text: 'current authority', priority: 100 },
      { id: 'actual', tier: 'HOT', state: 'CURRENT_ARTIFACT', role: 'ACTUAL', text: 'current actual', priority: 90 },
      { id: 'consumer', tier: 'HOT', state: 'CURRENT_ARTIFACT', role: 'CONSUMER', text: 'named consumer', priority: 80 },
      { id: 'acceptance', tier: 'HOT', state: 'CURRENT_AUTHORITY', role: 'ACCEPTANCE', text: 'acceptance evidence', priority: 70 },
    ],
    ...overrides,
  };
}

test('fails closed when a required HOT item is missing', () => {
  const input = base();
  input.evidence = input.evidence.filter((item) => item.id !== 'actual');
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'required_hot_missing:actual');
});

test('fails closed when required HOT evidence is stale or non-current', () => {
  const input = base();
  input.evidence = input.evidence.map((item) => item.id === 'authority'
    ? { ...item, state: 'CANDIDATE', claimMode: 'REFERENCE' }
    : item);
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'required_hot_not_current:authority');
});

test('rejects non-current evidence classified as HOT even when optional', () => {
  const input = base();
  input.evidence.push({
    id: 'stale-hot', tier: 'HOT', state: 'CANDIDATE', claimMode: 'REFERENCE',
    text: 'candidate should not be in HOT', required: false,
  });
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'hot_not_current:stale-hot');
});

test('defers COLD while an unavailable WARM candidate still needs retrieval', () => {
  const input = base({
    issues: [{ id: 'cause', material: true }],
    relations: [
      { fromIssue: 'cause', toEvidence: 'warm-missing', material: true },
      { fromIssue: 'cause', toEvidence: 'cold-history', material: true },
    ],
  });
  input.evidence.push(
    { id: 'warm-missing', tier: 'WARM', state: 'CURRENT_EXECUTION_EVIDENCE', available: false, text: '', resolves: ['cause'] },
    { id: 'cold-history', tier: 'COLD', state: 'HISTORICAL', text: 'historical fallback', resolves: ['cause'] },
  );
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'NEEDS_EVIDENCE');
  assert.equal(result.coldDeferredForWarm, true);
  assert.deepEqual(result.nextRetrievalIds, ['warm-missing']);
  assert.deepEqual(result.includedByTier.COLD, []);
});

test('never auto-includes QUARANTINE evidence even when it is high priority and material', () => {
  const input = base({
    issues: [{ id: 'risk', material: true }],
    relations: [{ fromIssue: 'risk', toEvidence: 'retired', material: true }],
  });
  input.evidence.push({
    id: 'retired', tier: 'QUARANTINE', state: 'RETIRED', role: 'HISTORY',
    text: 'old answer', priority: 1000, resolves: ['risk'],
  });
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NEEDS_EVIDENCE');
  assert.deepEqual(result.omitted.quarantine, ['retired']);
  assert.equal(result.contextItems.some((item) => item.id === 'retired'), false);
});

test('expands WARM only from material unresolved issues and omits unrelated WARM evidence', () => {
  const input = base({
    issues: [{ id: 'dependency-gap', material: true }],
    relations: [{ fromIssue: 'dependency-gap', toEvidence: 'warm-dependency', material: true }],
  });
  input.evidence.push(
    { id: 'warm-dependency', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'caller/use-site', resolves: ['dependency-gap'], priority: 20 },
    { id: 'warm-unrelated', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'unrelated nearby fact', priority: 999 },
  );
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'READY');
  assert.ok(result.includedByTier.WARM.includes('warm-dependency'));
  assert.ok(result.omitted.notReached.includes('warm-unrelated'));
});

test('does not enter COLD when WARM resolves the material frontier', () => {
  const input = base({
    issues: [{ id: 'cause', material: true }],
    relations: [
      { fromIssue: 'cause', toEvidence: 'warm-cause', material: true },
      { fromIssue: 'cause', toEvidence: 'cold-history', material: true },
    ],
  });
  input.evidence.push(
    { id: 'warm-cause', tier: 'WARM', state: 'CURRENT_EXECUTION_EVIDENCE', text: 'current failure evidence', resolves: ['cause'] },
    { id: 'cold-history', tier: 'COLD', state: 'HISTORICAL', text: 'old incident history', resolves: ['cause'] },
  );
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.includedByTier.COLD, []);
  assert.ok(result.omitted.notReached.includes('cold-history'));
});

test('enters COLD only after WARM fixpoint leaves a material issue unresolved', () => {
  const input = base({
    issues: [{ id: 'cause', material: true }],
    relations: [
      { fromIssue: 'cause', toEvidence: 'warm-symptom', material: true },
      { fromIssue: 'cause', toEvidence: 'cold-root', material: true },
    ],
  });
  input.evidence.push(
    { id: 'warm-symptom', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'symptom only' },
    { id: 'cold-root', tier: 'COLD', state: 'HISTORICAL', text: 'prior root-cause proof', resolves: ['cause'] },
  );
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.includedByTier.WARM, ['warm-symptom']);
  assert.deepEqual(result.includedByTier.COLD, ['cold-root']);
});

test('material frontier reaches a fixpoint across emitted issues without a fixed hop quota', () => {
  const input = base({
    issues: [
      { id: 'issue-1', material: true },
      { id: 'issue-2', material: true, resolved: true },
      { id: 'issue-3', material: true, resolved: true },
    ],
    relations: [
      { fromIssue: 'issue-1', toEvidence: 'warm-1', material: true },
      { fromIssue: 'issue-2', toEvidence: 'warm-2', material: true },
      { fromIssue: 'issue-3', toEvidence: 'warm-3', material: true },
    ],
  });
  input.evidence.push(
    { id: 'warm-1', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'edge 1', resolves: ['issue-1'], emitsIssues: ['issue-2'] },
    { id: 'warm-2', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'edge 2', resolves: ['issue-2'], emitsIssues: ['issue-3'] },
    { id: 'warm-3', tier: 'WARM', state: 'CURRENT_EXECUTION_EVIDENCE', text: 'edge 3', resolves: ['issue-3'] },
  );
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.includedByTier.WARM, ['warm-1', 'warm-2', 'warm-3']);
  assert.ok(result.metrics.frontierRounds >= 3);
  assert.equal(result.materialFixpoint, true);
});

test('fails when required HOT context alone exceeds the budget', () => {
  const input = base({ maxContextBytes: 50 });
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, false);
  assert.match(result.reason, /^required_context_budget_exceeded:/);
});

test('omits optional evidence on budget pressure instead of evicting required HOT evidence', () => {
  const input = base({
    maxContextBytes: 700,
    issues: [{ id: 'risk', material: true }],
    relations: [{ fromIssue: 'risk', toEvidence: 'warm-large', material: true }],
  });
  input.evidence.push({
    id: 'warm-large', tier: 'WARM', state: 'CURRENT_ARTIFACT', text: 'x'.repeat(2000), resolves: ['risk'], priority: 999,
  });
  const result = compileJitEvidencePacket(input);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'BUDGET_BLOCKED');
  assert.ok(result.omitted.budget.includes('warm-large'));
  for (const id of input.requiredHotIds) assert.ok(result.contextItems.some((item) => item.id === id));
});

test('emits unavailable material evidence as next retrieval work', () => {
  const input = base({
    issues: [{ id: 'counterexample', material: true }],
    relations: [{ fromIssue: 'counterexample', toEvidence: 'counter-source', material: true }],
  });
  input.evidence.push({
    id: 'counter-source', tier: 'WARM', state: 'CURRENT_EXECUTION_EVIDENCE', available: false,
    text: '', role: 'COUNTEREVIDENCE', priority: 50, resolves: ['counterexample'],
  });
  const result = compileJitEvidencePacket(input);
  assert.equal(result.status, 'NEEDS_EVIDENCE');
  assert.deepEqual(result.nextRetrievalIds, ['counter-source']);
});

test('contextItems are directly compatible with the existing reasoning-packet context shape', () => {
  const result = compileJitEvidencePacket(base());
  assert.equal(result.ok, true);
  for (const item of result.contextItems) {
    assert.deepEqual(Object.keys(item), ['id', 'text', 'priority', 'required']);
    assert.equal(typeof item.id, 'string');
    assert.equal(typeof item.text, 'string');
    assert.equal(typeof item.priority, 'number');
    assert.equal(typeof item.required, 'boolean');
  }
});
