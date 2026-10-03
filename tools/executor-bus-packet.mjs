#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SCHEMA_VERSION = 'gameroad-executor-bus-v1';
const MAX_TEXT = 8000;
const MAX_ITEM = 1200;
const MAX_LIST = 64;
const RESULT_STATUSES = new Set(['RETURNED', 'BLOCKED', 'NO_CHANGE', 'FAILED']);
export const ACCEPTANCE_KINDS = new Set([
  'focused_test',
  'runtime_evidence',
  'human_review',
  'external_evidence',
]);
const ACCEPTANCE_CHECK_KEYS = new Set(['id', 'kind', 'description', 'required', 'target']);
export const BROWSER_FULL_INTERACTION_TARGET = 'browser-full-interaction';
const FORBIDDEN_KEYS = new Set([
  'command', 'commands', 'shell', 'script', 'run', 'exec', 'password', 'secret', 'secrets',
  'token', 'apiKey', 'api_key', 'credential', 'credentials', 'privateKey', 'private_key',
]);

function fail(reason) {
  return { ok: false, reason };
}

function cleanString(value, key, { max = MAX_TEXT, optional = false } = {}) {
  if (value == null && optional) return '';
  if (typeof value !== 'string') throw new Error(`${key}_must_be_string`);
  const out = value.trim();
  if (!out && !optional) throw new Error(`${key}_required`);
  if (out.length > max) throw new Error(`${key}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${key}_nul`);
  return out;
}

function cleanList(value, key, { required = false } = {}) {
  if (!Array.isArray(value)) throw new Error(`${key}_must_be_array`);
  if (required && value.length === 0) throw new Error(`${key}_required`);
  if (value.length > MAX_LIST) throw new Error(`${key}_too_many`);
  const out = value.map((item, index) => cleanString(item, `${key}_${index}`, { max: MAX_ITEM }));
  if (new Set(out).size !== out.length) throw new Error(`${key}_duplicate`);
  return out;
}

function rejectForbiddenKeys(object) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return;
  for (const key of Object.keys(object)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`forbidden_key:${key}`);
  }
}

function cleanAcceptanceChecks(value, exactMutableResources) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('acceptanceChecks_must_be_array');
  if (value.length > MAX_LIST) throw new Error('acceptanceChecks_too_many');
  const seen = new Set();
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`acceptanceChecks_${index}_must_be_object`);
    }
    rejectForbiddenKeys(item);
    for (const key of Object.keys(item)) {
      if (!ACCEPTANCE_CHECK_KEYS.has(key)) {
        throw new Error(`acceptanceChecks_${index}_unknown_key:${key}`);
      }
    }
    const id = cleanString(item.id, `acceptanceChecks_${index}_id`, { max: 160 });
    if (seen.has(id)) throw new Error(`acceptanceChecks_duplicate_id:${id}`);
    seen.add(id);
    const kind = cleanString(item.kind, `acceptanceChecks_${index}_kind`, { max: 40 });
    if (!ACCEPTANCE_KINDS.has(kind)) throw new Error(`acceptanceChecks_${index}_kind_invalid`);
    const description = cleanString(item.description, `acceptanceChecks_${index}_description`, { max: MAX_ITEM });
    const required = item.required == null ? true : item.required;
    if (typeof required !== 'boolean') throw new Error(`acceptanceChecks_${index}_required_must_be_boolean`);
    const target = cleanString(item.target ?? '', `acceptanceChecks_${index}_target`, { max: MAX_ITEM, optional: true });
    if (kind === 'focused_test') {
      if (!target.startsWith('tests/') || !target.endsWith('.test.mjs')) {
        throw new Error(`acceptanceChecks_${index}_focused_test_target_invalid`);
      }
      if (!exactMutableResources.includes(target)) {
        throw new Error(`acceptanceChecks_${index}_focused_test_target_not_mutable`);
      }
    }
    if (kind === 'runtime_evidence' && target !== BROWSER_FULL_INTERACTION_TARGET) {
      throw new Error(`acceptanceChecks_${index}_runtime_target_unsupported`);
    }
    return { id, kind, description, required, target };
  });
}

export function parseFencedJson(text, fenceName) {
  if (typeof text !== 'string') return fail('body_must_be_string');
  const escaped = fenceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('```' + escaped + '\\s*\\n([\\s\\S]*?)\\n```', 'm');
  const match = text.match(re);
  if (!match) return fail(`missing_fence:${fenceName}`);
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    return fail(`invalid_json:${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('payload_must_be_object');
  return { ok: true, value: parsed };
}

export function normalizeQueuePacket(input) {
  try {
    rejectForbiddenKeys(input);
    if (input.schemaVersion !== SCHEMA_VERSION) throw new Error('schema_version');
    if (input.kind !== 'queue') throw new Error('kind_queue_required');
    const packet = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'queue',
      taskId: cleanString(input.taskId, 'taskId', { max: 240 }),
      workUnitKey: cleanString(input.workUnitKey, 'workUnitKey', { max: 240 }),
      acquireKey: cleanString(input.acquireKey, 'acquireKey', { max: 300 }),
      baseRef: cleanString(input.baseRef, 'baseRef', { max: 160 }),
      exactMutableResources: cleanList(input.exactMutableResources, 'exactMutableResources', { required: true }),
      doNotChange: cleanList(input.doNotChange ?? [], 'doNotChange'),
      procedure: cleanList(input.procedure ?? [], 'procedure'),
      userEndState: cleanString(input.userEndState, 'userEndState'),
      realOutputTarget: cleanString(input.realOutputTarget, 'realOutputTarget'),
      acceptance: cleanList(input.acceptance, 'acceptance', { required: true }),
      acceptanceChecks: [],
      resumeCondition: cleanString(input.resumeCondition, 'resumeCondition'),
      executorCapabilityHint: cleanString(input.executorCapabilityHint ?? '', 'executorCapabilityHint', { max: 500, optional: true }),
    };
    packet.acceptanceChecks = cleanAcceptanceChecks(input.acceptanceChecks, packet.exactMutableResources);
    if (packet.acceptanceChecks.length) {
      const descriptions = packet.acceptanceChecks.map((item) => item.description);
      if (descriptions.length !== packet.acceptance.length
          || descriptions.some((description, index) => description !== packet.acceptance[index])) {
        throw new Error('acceptanceChecks_must_classify_every_acceptance_item');
      }
    }
    const overlap = packet.exactMutableResources.filter((item) => packet.doNotChange.includes(item));
    if (overlap.length) throw new Error(`mutable_do_not_change_overlap:${overlap.join(',')}`);
    return { ok: true, packet };
  } catch (error) {
    return fail(error.message);
  }
}

export function normalizeResultPacket(input, queuePacket) {
  try {
    rejectForbiddenKeys(input);
    if (input.schemaVersion !== SCHEMA_VERSION) throw new Error('schema_version');
    if (input.kind !== 'result') throw new Error('kind_result_required');
    const packet = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'result',
      taskId: cleanString(input.taskId, 'taskId', { max: 240 }),
      workUnitKey: cleanString(input.workUnitKey, 'workUnitKey', { max: 240 }),
      acquireKey: cleanString(input.acquireKey, 'acquireKey', { max: 300 }),
      status: cleanString(input.status, 'status', { max: 40 }),
      evidence: cleanList(input.evidence, 'evidence', { required: true }),
      unresolved: cleanList(input.unresolved ?? [], 'unresolved'),
      producedRefs: cleanList(input.producedRefs ?? [], 'producedRefs'),
      nextAction: cleanString(input.nextAction ?? '', 'nextAction', { optional: true }),
    };
    if (!RESULT_STATUSES.has(packet.status)) throw new Error('result_status');
    for (const key of ['taskId', 'workUnitKey', 'acquireKey']) {
      if (!queuePacket || packet[key] !== queuePacket[key]) throw new Error(`identity_mismatch:${key}`);
    }
    return { ok: true, packet };
  } catch (error) {
    return fail(error.message);
  }
}

function writeJson(path, value) {
  fs.writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function runCli(argv) {
  const mode = argv[0];
  const outPath = argValue(argv, '--out');
  const statusPath = argValue(argv, '--status');
  const bodyPath = argValue(argv, '--body-file');
  const queueBodyPath = argValue(argv, '--queue-body-file');
  const resultBodyPath = argValue(argv, '--result-body-file');
  let result;

  if (mode === 'queue') {
    const parsed = parseFencedJson(fs.readFileSync(bodyPath, 'utf8'), 'executor-bus');
    result = parsed.ok ? normalizeQueuePacket(parsed.value) : parsed;
  } else if (mode === 'result') {
    const queueParsed = parseFencedJson(fs.readFileSync(queueBodyPath, 'utf8'), 'executor-bus');
    if (!queueParsed.ok) result = queueParsed;
    else {
      const queue = normalizeQueuePacket(queueParsed.value);
      if (!queue.ok) result = queue;
      else {
        const resultParsed = parseFencedJson(fs.readFileSync(resultBodyPath, 'utf8'), 'executor-result');
        result = resultParsed.ok ? normalizeResultPacket(resultParsed.value, queue.packet) : resultParsed;
      }
    }
  } else {
    result = fail('mode_must_be_queue_or_result');
  }

  if (result.ok && outPath) writeJson(outPath, result.packet);
  if (statusPath) writeJson(statusPath, { ok: result.ok, reason: result.reason ?? 'accepted' });
  if (!result.ok) {
    console.error(`EXECUTOR_BUS_REJECTED ${result.reason}`);
    return 1;
  }
  console.log(`EXECUTOR_BUS_ACCEPTED ${mode}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv.slice(2));
}
