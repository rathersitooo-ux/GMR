#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SCHEMA_VERSION, normalizeQueuePacket } from './executor-bus-packet.mjs';

export const COMPACT_SCHEMA_VERSION = 'gsc1';
const COMPACT_KIND_QUEUE = 'q';
const COMPACT_KEYS = new Set(['v', 'k', 'i', 'b', 'm', 'x', 'g', 'o', 'a', 'r', 'h', 'f']);

function fail(reason, extras = {}) {
  return { ok: false, reason, ...extras };
}

function canonicalPacket(packet) {
  return JSON.stringify(packet);
}

function fingerprint(packet) {
  return createHash('sha256').update(canonicalPacket(packet), 'utf8').digest('base64url');
}

function wireMetrics(sourceJson, wire) {
  const sourceChars = sourceJson.length;
  const wireChars = wire.length;
  const sourceBytes = Buffer.byteLength(sourceJson, 'utf8');
  const wireBytes = Buffer.byteLength(wire, 'utf8');
  return {
    sourceChars,
    wireChars,
    savedChars: sourceChars - wireChars,
    sourceBytes,
    wireBytes,
    savedBytes: sourceBytes - wireBytes,
    charRatio: sourceChars === 0 ? 1 : wireChars / sourceChars,
    byteRatio: sourceBytes === 0 ? 1 : wireBytes / sourceBytes,
  };
}

function checkedBudget(value, name) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name}_must_be_positive_integer`);
  return value;
}

function validateCompactShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('compact_must_be_object');
  for (const key of Object.keys(value)) {
    if (!COMPACT_KEYS.has(key)) throw new Error(`compact_unknown_key:${key}`);
  }
  for (const key of COMPACT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`compact_missing_key:${key}`);
  }
  if (value.v !== COMPACT_SCHEMA_VERSION) throw new Error('compact_schema_version');
  if (value.k !== COMPACT_KIND_QUEUE) throw new Error('compact_kind_queue_required');
  if (!Array.isArray(value.i) || value.i.length !== 3) throw new Error('compact_identity_triplet');
  if (value.i.some((item) => typeof item !== 'string')) throw new Error('compact_identity_string');
  for (const key of ['b', 'g', 'o', 'r', 'h', 'f']) {
    if (typeof value[key] !== 'string') throw new Error(`compact_${key}_must_be_string`);
  }
  for (const key of ['m', 'x', 'a']) {
    if (!Array.isArray(value[key])) throw new Error(`compact_${key}_must_be_array`);
  }
}

export function compressQueuePacket(input, options = {}) {
  let maxWireChars;
  let maxWireBytes;
  try {
    maxWireChars = checkedBudget(options.maxWireChars, 'maxWireChars');
    maxWireBytes = checkedBudget(options.maxWireBytes, 'maxWireBytes');
  } catch (error) {
    return fail(error.message);
  }

  const checked = normalizeQueuePacket(input);
  if (!checked.ok) return fail(`source_invalid:${checked.reason}`);
  const packet = checked.packet;
  const compact = {
    v: COMPACT_SCHEMA_VERSION,
    k: COMPACT_KIND_QUEUE,
    i: [packet.taskId, packet.workUnitKey, packet.acquireKey],
    b: packet.baseRef,
    m: packet.exactMutableResources,
    x: packet.doNotChange,
    g: packet.userEndState,
    o: packet.realOutputTarget,
    a: packet.acceptance,
    r: packet.resumeCondition,
    h: packet.executorCapabilityHint,
    f: fingerprint(packet),
  };
  const sourceJson = canonicalPacket(packet);
  const wire = JSON.stringify(compact);
  const metrics = wireMetrics(sourceJson, wire);
  if (maxWireChars != null && metrics.wireChars > maxWireChars) {
    return fail(`wire_char_budget_exceeded:${metrics.wireChars}>${maxWireChars}`, { metrics });
  }
  if (maxWireBytes != null && metrics.wireBytes > maxWireBytes) {
    return fail(`wire_byte_budget_exceeded:${metrics.wireBytes}>${maxWireBytes}`, { metrics });
  }
  return { ok: true, packet: compact, wire, metrics };
}

export function decompressQueuePacket(input) {
  let compact = input;
  if (typeof compact === 'string') {
    try {
      compact = JSON.parse(compact);
    } catch (error) {
      return fail(`compact_invalid_json:${error.message}`);
    }
  }

  try {
    validateCompactShape(compact);
  } catch (error) {
    return fail(error.message);
  }

  const reconstructed = {
    schemaVersion: SCHEMA_VERSION,
    kind: 'queue',
    taskId: compact.i[0],
    workUnitKey: compact.i[1],
    acquireKey: compact.i[2],
    baseRef: compact.b,
    exactMutableResources: compact.m,
    doNotChange: compact.x,
    userEndState: compact.g,
    realOutputTarget: compact.o,
    acceptance: compact.a,
    resumeCondition: compact.r,
    executorCapabilityHint: compact.h,
  };
  const checked = normalizeQueuePacket(reconstructed);
  if (!checked.ok) return fail(`decompressed_invalid:${checked.reason}`);
  const actualFingerprint = fingerprint(checked.packet);
  if (actualFingerprint !== compact.f) {
    return fail('fingerprint_mismatch', {
      expectedFingerprint: compact.f,
      actualFingerprint,
    });
  }
  return { ok: true, packet: checked.packet, fingerprint: actualFingerprint };
}

export function measureQueuePacketCompression(input) {
  const result = compressQueuePacket(input);
  return result.ok ? { ok: true, metrics: result.metrics } : result;
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text.trim();
}

export async function runCli(argv = process.argv.slice(2)) {
  const mode = argv[0] ?? 'compress';
  const raw = await readStdin();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: 'empty_stdin' })}\n`);
    return 2;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: `invalid_json:${error.message}` })}\n`);
    return 2;
  }

  let result;
  if (mode === 'compress') result = compressQueuePacket(input);
  else if (mode === 'decompress') result = decompressQueuePacket(input);
  else if (mode === 'measure') result = measureQueuePacketCompression(input);
  else result = fail('mode_must_be_compress_decompress_or_measure');

  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  const output = mode === 'compress' ? result.packet : mode === 'decompress' ? result.packet : result.metrics;
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
