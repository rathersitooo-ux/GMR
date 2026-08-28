#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { SCHEMA_VERSION, normalizeQueuePacket } from './executor-bus-packet.mjs';

export const COMPACT_SCHEMA_VERSION = 'gsc1';
export const REASONING_PACKET_SCHEMA_VERSION = 'grp1';
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

function cleanContextString(value, name, { max = 12_000 } = {}) {
  if (typeof value !== 'string') throw new Error(`${name}_must_be_string`);
  const out = value.trim();
  if (!out) throw new Error(`${name}_required`);
  if (out.length > max) throw new Error(`${name}_too_long`);
  if (out.includes('\u0000')) throw new Error(`${name}_nul`);
  return out;
}

function normalizeContextItems(items) {
  if (!Array.isArray(items)) throw new Error('context_must_be_array');
  if (items.length > 256) throw new Error('context_too_many');
  const seen = new Set();
  const normalized = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`context_${index}_must_be_object`);
    const id = cleanContextString(item.id, `context_${index}_id`, { max: 160 });
    const text = cleanContextString(item.text, `context_${index}_text`);
    const priority = item.priority == null ? 0 : item.priority;
    if (!Number.isInteger(priority) || priority < -1000 || priority > 1000) {
      throw new Error(`context_${index}_priority_range`);
    }
    const required = item.required ?? false;
    if (typeof required !== 'boolean') throw new Error(`context_${index}_required_boolean`);
    const dedupeKey = `${id}\u0000${text}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push({ id, text, priority, required, index });
  }
  return normalized;
}

function reasoningFingerprint(body) {
  return createHash('sha256').update(JSON.stringify(body), 'utf8').digest('base64url');
}

function reasoningEnvelope(queueCompact, contextPairs) {
  const body = { v: REASONING_PACKET_SCHEMA_VERSION, q: queueCompact, c: contextPairs };
  return { ...body, f: reasoningFingerprint(body) };
}

export function packReasoningPacket(queueInput, contextItems = [], options = {}) {
  let maxWireBytes;
  try {
    maxWireBytes = checkedBudget(options.maxWireBytes ?? 3000, 'maxWireBytes');
  } catch (error) {
    return fail(error.message);
  }

  const compressed = compressQueuePacket(queueInput);
  if (!compressed.ok) return fail(`queue_${compressed.reason}`);

  let context;
  try {
    context = normalizeContextItems(contextItems);
  } catch (error) {
    return fail(error.message);
  }

  const required = context.filter((item) => item.required).sort((a, b) => a.index - b.index);
  const optional = context
    .filter((item) => !item.required)
    .sort((a, b) => b.priority - a.priority || a.index - b.index);
  const ordered = [...required, ...optional];
  const included = [];
  const omitted = [];

  let envelope = reasoningEnvelope(compressed.packet, []);
  let wire = JSON.stringify(envelope);
  let wireBytes = Buffer.byteLength(wire, 'utf8');
  if (wireBytes > maxWireBytes) {
    return fail(`reasoning_packet_base_budget_exceeded:${wireBytes}>${maxWireBytes}`, {
      metrics: { maxWireBytes, wireBytes, queueWireBytes: compressed.metrics.wireBytes },
    });
  }

  for (const item of ordered) {
    const candidatePairs = [...included.map((entry) => [entry.id, entry.text]), [item.id, item.text]];
    const candidateEnvelope = reasoningEnvelope(compressed.packet, candidatePairs);
    const candidateWire = JSON.stringify(candidateEnvelope);
    const candidateBytes = Buffer.byteLength(candidateWire, 'utf8');
    if (candidateBytes <= maxWireBytes) {
      included.push(item);
      envelope = candidateEnvelope;
      wire = candidateWire;
      wireBytes = candidateBytes;
      continue;
    }
    if (item.required) {
      return fail(`required_context_budget_exceeded:${item.id}`, {
        metrics: { maxWireBytes, wireBytes: candidateBytes, queueWireBytes: compressed.metrics.wireBytes },
      });
    }
    omitted.push(item);
  }

  return {
    ok: true,
    packet: envelope,
    wire,
    metrics: {
      maxWireBytes,
      wireBytes,
      queueWireBytes: compressed.metrics.wireBytes,
      includedContextCount: included.length,
      omittedContextCount: omitted.length,
      includedContextIds: included.map((item) => item.id),
      omittedContextIds: omitted.map((item) => item.id),
    },
  };
}

export function unpackReasoningPacket(input) {
  let packet = input;
  if (typeof packet === 'string') {
    try {
      packet = JSON.parse(packet);
    } catch (error) {
      return fail(`reasoning_invalid_json:${error.message}`);
    }
  }
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return fail('reasoning_must_be_object');
  const keys = Object.keys(packet);
  if (keys.some((key) => !['v', 'q', 'c', 'f'].includes(key))) return fail('reasoning_unknown_key');
  if (packet.v !== REASONING_PACKET_SCHEMA_VERSION) return fail('reasoning_schema_version');
  if (!Array.isArray(packet.c)) return fail('reasoning_context_must_be_array');
  if (typeof packet.f !== 'string') return fail('reasoning_fingerprint_must_be_string');
  for (let index = 0; index < packet.c.length; index += 1) {
    const pair = packet.c[index];
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some((part) => typeof part !== 'string' || !part.trim())) {
      return fail(`reasoning_context_pair:${index}`);
    }
  }
  const body = { v: packet.v, q: packet.q, c: packet.c };
  const actualFingerprint = reasoningFingerprint(body);
  if (actualFingerprint !== packet.f) return fail('reasoning_fingerprint_mismatch');
  const queue = decompressQueuePacket(packet.q);
  if (!queue.ok) return fail(`reasoning_queue_${queue.reason}`);
  return {
    ok: true,
    queuePacket: queue.packet,
    context: packet.c.map(([id, text]) => ({ id, text })),
    fingerprint: actualFingerprint,
  };
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
  else if (mode === 'pack-reasoning') {
    result = packReasoningPacket(input.queue, input.context ?? [], { maxWireBytes: input.maxWireBytes ?? 3000 });
  } else if (mode === 'unpack-reasoning') result = unpackReasoningPacket(input);
  else result = fail('mode_must_be_compress_decompress_measure_pack-reasoning_or_unpack-reasoning');

  if (!result.ok) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return 1;
  }
  const output = mode === 'compress' || mode === 'pack-reasoning'
    ? result.packet
    : mode === 'decompress'
      ? result.packet
      : mode === 'unpack-reasoning'
        ? { queuePacket: result.queuePacket, context: result.context, fingerprint: result.fingerprint }
        : result.metrics;
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
