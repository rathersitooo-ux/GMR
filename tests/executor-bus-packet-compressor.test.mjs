import assert from 'node:assert/strict';
import test from 'node:test';

import { SCHEMA_VERSION, normalizeQueuePacket } from '../tools/executor-bus-packet.mjs';
import {
  COMPACT_SCHEMA_VERSION,
  compressQueuePacket,
  decompressQueuePacket,
  measureQueuePacketCompression,
} from '../tools/executor-bus-packet-compressor.mjs';

function queue(overrides = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'queue',
    taskId: 'OPS-AI-EXECUTION-CAPABILITY-DISCOVERY-001',
    workUnitKey: 'COMPACT_PACKET_COMPRESSOR_R1',
    acquireKey: 'OPS-AI-PACKET-COMPRESSOR-R1-TEST',
    baseRef: 'fc9eb2ed3b10a255213d61d76488970b8f3a3e05',
    exactMutableResources: [
      'tools/executor-bus-packet-compressor.mjs',
      'tests/executor-bus-packet-compressor.test.mjs',
    ],
    doNotChange: ['tools/executor-bus-packet.mjs', '.github/workflows/**'],
    userEndState: 'Build a bounded reasoning packet without silently changing its task identity or completion conditions.',
    realOutputTarget: 'A lossless compact packet that can be verified before the Sol reasoning turn.',
    acceptance: [
      'task/work/acquire identity survives round-trip exactly',
      'mutable and do-not-change scopes survive round-trip exactly',
      'all acceptance clauses survive round-trip exactly',
      'corruption fails closed',
    ],
    resumeCondition: 'After a correlated Sol result, return execution to the current repository HEAD.',
    executorCapabilityHint: 'reasoning transport',
    ...overrides,
  };
}

test('round-trip equals the authoritative normalized queue packet', () => {
  const source = queue({ userEndState: '  Keep normalized whitespace semantics.  ' });
  const normalized = normalizeQueuePacket(source);
  const compressed = compressQueuePacket(source);
  assert.equal(compressed.ok, true);
  const restored = decompressQueuePacket(compressed.packet);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.packet, normalized.packet);
});

test('compact schema reduces representative JSON wire size', () => {
  const compressed = compressQueuePacket(queue());
  assert.equal(compressed.ok, true);
  assert.equal(compressed.packet.v, COMPACT_SCHEMA_VERSION);
  assert.ok(compressed.metrics.savedChars > 0);
  assert.ok(compressed.metrics.savedBytes > 0);
  assert.ok(compressed.metrics.charRatio < 1);
  assert.ok(compressed.metrics.byteRatio < 1);
});

test('same normalized input produces the same wire and fingerprint', () => {
  const first = compressQueuePacket(queue());
  const second = compressQueuePacket(queue());
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.wire, second.wire);
  assert.equal(first.packet.f, second.packet.f);
});

test('corrupted semantic field fails fingerprint verification', () => {
  const compressed = compressQueuePacket(queue());
  const tampered = { ...compressed.packet, g: `${compressed.packet.g} changed` };
  const restored = decompressQueuePacket(tampered);
  assert.equal(restored.ok, false);
  assert.equal(restored.reason, 'fingerprint_mismatch');
});

test('unknown compact keys fail closed', () => {
  const compressed = compressQueuePacket(queue());
  const restored = decompressQueuePacket({ ...compressed.packet, command: 'do-something' });
  assert.equal(restored.ok, false);
  assert.equal(restored.reason, 'compact_unknown_key:command');
});

test('source validation is inherited from executor-bus queue authority', () => {
  const compressed = compressQueuePacket(queue({ command: 'rm -rf /' }));
  assert.equal(compressed.ok, false);
  assert.equal(compressed.reason, 'source_invalid:forbidden_key:command');
});

test('budget overflow fails instead of truncating mandatory semantics', () => {
  const full = compressQueuePacket(queue());
  assert.equal(full.ok, true);
  const tooSmall = compressQueuePacket(queue(), { maxWireChars: full.metrics.wireChars - 1 });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.reason, /^wire_char_budget_exceeded:/);
  const exact = compressQueuePacket(queue(), { maxWireChars: full.metrics.wireChars });
  assert.equal(exact.ok, true);
});

test('UTF-8 byte budget is checked independently from character budget', () => {
  const source = queue({ userEndState: '日本語の文脈を一文字も削らずに保持する。' });
  const full = compressQueuePacket(source);
  assert.equal(full.ok, true);
  assert.ok(full.metrics.wireBytes > full.metrics.wireChars);
  const tooSmall = compressQueuePacket(source, { maxWireBytes: full.metrics.wireBytes - 1 });
  assert.equal(tooSmall.ok, false);
  assert.match(tooSmall.reason, /^wire_byte_budget_exceeded:/);
});

test('acceptance and scope arrays are preserved exactly and in order', () => {
  const source = queue({
    exactMutableResources: ['a/one', 'b/two', 'c/three'],
    doNotChange: ['x/four', 'y/five'],
    acceptance: ['first clause', 'second clause', 'third clause'],
  });
  const compressed = compressQueuePacket(source);
  const restored = decompressQueuePacket(compressed.wire);
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.packet.exactMutableResources, source.exactMutableResources);
  assert.deepEqual(restored.packet.doNotChange, source.doNotChange);
  assert.deepEqual(restored.packet.acceptance, source.acceptance);
});

test('blank optional capability hint survives round-trip', () => {
  const source = queue({ executorCapabilityHint: '' });
  const compressed = compressQueuePacket(source);
  assert.equal(compressed.ok, true);
  const restored = decompressQueuePacket(compressed.packet);
  assert.equal(restored.ok, true);
  assert.equal(restored.packet.executorCapabilityHint, '');
});

test('malformed compact identity triplet is rejected before reconstruction', () => {
  const compressed = compressQueuePacket(queue());
  const malformed = { ...compressed.packet, i: compressed.packet.i.slice(0, 2) };
  const restored = decompressQueuePacket(malformed);
  assert.equal(restored.ok, false);
  assert.equal(restored.reason, 'compact_identity_triplet');
});

test('measurement API returns the same metrics as compression', () => {
  const compressed = compressQueuePacket(queue());
  const measured = measureQueuePacketCompression(queue());
  assert.equal(measured.ok, true);
  assert.deepEqual(measured.metrics, compressed.metrics);
});
