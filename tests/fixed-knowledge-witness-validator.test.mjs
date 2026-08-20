import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { validateFixedKnowledgeWitness } from '../tools/fixed-knowledge-witness-validator.mjs';

const witness = JSON.parse(fs.readFileSync(new URL('../data/gameroad-fixed-knowledge-witness.json', import.meta.url), 'utf8'));
const schema = JSON.parse(fs.readFileSync(new URL('../data/gameroad-fixed-knowledge-witness.schema.json', import.meta.url), 'utf8'));

function clone(value) {
  return structuredClone(value);
}

test('accepts the current MIRROR_ONLY fixed-knowledge witness', () => {
  const result = validateFixedKnowledgeWitness(clone(witness), clone(schema));
  assert.equal(result.valid, true);
  assert.deepEqual(result.lock_classes, ['USER_LOCK', 'ARTIFACT_LOCK', 'VERIFIED_LOCK']);
  assert.equal(result.canonical_system, 'google_drive');
});

test('fails closed if AI is allowed to mint USER_LOCK', () => {
  const changed = clone(witness);
  changed.policy.ai_may_mint_user_lock = true;
  assert.throws(() => validateFixedKnowledgeWitness(changed, clone(schema)), /ai_may_mint_user_lock/);
});

test('fails closed if a lock class is removed or reordered', () => {
  const changed = clone(witness);
  changed.fixed_knowledge_contract.lock_classes = ['ARTIFACT_LOCK', 'VERIFIED_LOCK'];
  assert.throws(() => validateFixedKnowledgeWitness(changed, clone(schema)), /lock_classes/);
});

test('fails closed if canonical authority moves away from Drive', () => {
  const changed = clone(witness);
  changed.canonical.system = 'github';
  assert.throws(() => validateFixedKnowledgeWitness(changed, clone(schema)), /canonical.system/);
});

test('rejects an individual USER_RAW-like payload inside the witness', () => {
  const changed = clone(witness);
  changed.policy.user_raw = 'must never be mirrored';
  assert.throws(() => validateFixedKnowledgeWitness(changed, clone(schema)), /keys drifted|forbidden/);
});

test('fails closed if the schema stops enforcing witness-only policy', () => {
  const changedSchema = clone(schema);
  changedSchema.properties.policy.properties.github_is_witness_only.const = false;
  assert.throws(() => validateFixedKnowledgeWitness(clone(witness), changedSchema), /github_is_witness_only/);
});

test('fails closed if schema lock constants drift', () => {
  const changedSchema = clone(schema);
  changedSchema.properties.fixed_knowledge_contract.properties.lock_classes.prefixItems[0].const = 'AI_LOCK';
  assert.throws(() => validateFixedKnowledgeWitness(clone(witness), changedSchema), /lock class consts/);
});
