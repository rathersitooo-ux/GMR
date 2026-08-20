#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED = Object.freeze({
  schemaRef: './gameroad-fixed-knowledge-witness.schema.json',
  schemaVersion: 1,
  mode: 'MIRROR_ONLY',
  canonical: Object.freeze({
    system: 'google_drive',
    ops_rules_document_id: '1za9b6DOzyLaNZQfWVAJFmAxTetraYrHnkpJ33vEkBwE',
    common_entry_document_id: '17xKynlDewWeYHK1xsObex70VoR7YPh6Kn06y57HZV_s',
    user_provenance_task_id: 'OPS-USER-RULE-PROVENANCE-GATE-001',
    knowledge_compiler_file_id: '1ITrvIhGlC0eN8QrZ3onNJXKO7UFrqLYC',
  }),
  lockClasses: Object.freeze(['USER_LOCK', 'ARTIFACT_LOCK', 'VERIFIED_LOCK']),
  contract: Object.freeze({
    version: 1,
    user_lock_creation_authority: 'USER_EXPLICIT_ONLY',
    unknown_or_invalid_lock: 'FAIL_CLOSED_REVERIFY',
    user_lock_drift: 'USER_DECISION_REQUIRED',
    artifact_or_verified_drift: 'REVERIFY_REQUIRED',
  }),
  policy: Object.freeze({
    drive_is_canonical: true,
    github_is_witness_only: true,
    no_dual_canonical: true,
    user_raw_values_mirrored: false,
    ai_may_mint_user_lock: false,
  }),
});

function fail(message) {
  throw new Error(`fixed-knowledge witness invalid: ${message}`);
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
}

function assertExactKeys(object, expectedKeys, label) {
  assertPlainObject(object, label);
  const actual = Object.keys(object).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys drifted: expected=${expected.join(',')} actual=${actual.join(',')}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, label) {
  if (!Array.isArray(actual) || actual.length !== expected.length ||
      actual.some((value, index) => value !== expected[index])) {
    fail(`${label} expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`);
  }
}

function rejectForbiddenPayloadKeys(value, trace = '$') {
  const forbidden = new Set([
    'user_raw',
    'raw_identity',
    'fixed_value',
    'claim_value',
    'individual_lock_value',
  ]);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenPayloadKeys(entry, `${trace}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) {
      fail(`forbidden individual fixed payload key ${trace}.${key}`);
    }
    rejectForbiddenPayloadKeys(entry, `${trace}.${key}`);
  }
}

export function validateFixedKnowledgeWitness(witness, schema) {
  assertExactKeys(
    witness,
    ['$schema', 'schema_version', 'mode', 'purpose', 'canonical', 'fixed_knowledge_contract', 'policy'],
    'witness',
  );
  assertEqual(witness.$schema, EXPECTED.schemaRef, 'witness.$schema');
  assertEqual(witness.schema_version, EXPECTED.schemaVersion, 'witness.schema_version');
  assertEqual(witness.mode, EXPECTED.mode, 'witness.mode');
  if (typeof witness.purpose !== 'string' || witness.purpose.length === 0) {
    fail('witness.purpose must be non-empty');
  }

  assertExactKeys(witness.canonical, Object.keys(EXPECTED.canonical), 'witness.canonical');
  for (const [key, expected] of Object.entries(EXPECTED.canonical)) {
    assertEqual(witness.canonical[key], expected, `witness.canonical.${key}`);
  }

  assertExactKeys(
    witness.fixed_knowledge_contract,
    ['version', 'lock_classes', 'user_lock_creation_authority', 'unknown_or_invalid_lock', 'user_lock_drift', 'artifact_or_verified_drift'],
    'witness.fixed_knowledge_contract',
  );
  assertEqual(witness.fixed_knowledge_contract.version, EXPECTED.contract.version, 'contract.version');
  assertArrayEqual(witness.fixed_knowledge_contract.lock_classes, EXPECTED.lockClasses, 'contract.lock_classes');
  for (const [key, expected] of Object.entries(EXPECTED.contract)) {
    if (key !== 'version') {
      assertEqual(witness.fixed_knowledge_contract[key], expected, `contract.${key}`);
    }
  }

  assertExactKeys(witness.policy, Object.keys(EXPECTED.policy), 'witness.policy');
  for (const [key, expected] of Object.entries(EXPECTED.policy)) {
    assertEqual(witness.policy[key], expected, `witness.policy.${key}`);
  }
  rejectForbiddenPayloadKeys(witness);

  assertPlainObject(schema, 'schema');
  assertEqual(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', 'schema.$schema');
  assertEqual(schema.additionalProperties, false, 'schema.additionalProperties');
  assertPlainObject(schema.properties, 'schema.properties');
  assertEqual(schema.properties.$schema?.const, EXPECTED.schemaRef, 'schema.properties.$schema.const');
  assertEqual(schema.properties.schema_version?.const, EXPECTED.schemaVersion, 'schema.properties.schema_version.const');
  assertEqual(schema.properties.mode?.const, EXPECTED.mode, 'schema.properties.mode.const');

  const canonicalProps = schema.properties.canonical?.properties;
  assertPlainObject(canonicalProps, 'schema canonical properties');
  for (const [key, expected] of Object.entries(EXPECTED.canonical)) {
    assertEqual(canonicalProps[key]?.const, expected, `schema canonical ${key} const`);
  }

  const contractProps = schema.properties.fixed_knowledge_contract?.properties;
  assertPlainObject(contractProps, 'schema contract properties');
  assertEqual(contractProps.version?.const, EXPECTED.contract.version, 'schema contract version const');
  const prefixItems = contractProps.lock_classes?.prefixItems;
  assertArrayEqual(prefixItems?.map((item) => item?.const), EXPECTED.lockClasses, 'schema lock class consts');
  assertEqual(contractProps.lock_classes?.items, false, 'schema lock_classes.items');
  for (const [key, expected] of Object.entries(EXPECTED.contract)) {
    if (key !== 'version') {
      assertEqual(contractProps[key]?.const, expected, `schema contract ${key} const`);
    }
  }

  const policyProps = schema.properties.policy?.properties;
  assertPlainObject(policyProps, 'schema policy properties');
  for (const [key, expected] of Object.entries(EXPECTED.policy)) {
    assertEqual(policyProps[key]?.const, expected, `schema policy ${key} const`);
  }

  return {
    valid: true,
    schema_version: witness.schema_version,
    lock_classes: [...witness.fixed_knowledge_contract.lock_classes],
    canonical_system: witness.canonical.system,
  };
}

export function readAndValidateFixedKnowledgeWitness(witnessPath, schemaPath) {
  const witness = JSON.parse(fs.readFileSync(witnessPath, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return validateFixedKnowledgeWitness(witness, schema);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const witnessPath = process.argv[2] ?? 'data/gameroad-fixed-knowledge-witness.json';
  const schemaPath = process.argv[3] ?? 'data/gameroad-fixed-knowledge-witness.schema.json';
  try {
    const result = readAndValidateFixedKnowledgeWitness(witnessPath, schemaPath);
    process.stdout.write(`fixed-knowledge witness verified: ${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
