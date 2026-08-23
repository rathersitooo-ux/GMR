import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const SCHEMA = 'gameroad.animation-frontier.kimodo-bvh-probe.v1';
const NPZ_SCHEMA = 'gameroad.animation-frontier.kimodo-npz-probe.v1';

function finiteNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label}_INVALID`);
  return parsed;
}

function round(value, digits = 9) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function parseMotionLines(text) {
  const marker = /\nMOTION\s*\n/i.exec(text);
  if (!marker) throw new Error('BVH_MOTION_SECTION_MISSING');
  const motion = text.slice(marker.index + marker[0].length);
  const lines = motion.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) throw new Error('BVH_MOTION_SECTION_INCOMPLETE');

  const framesMatch = /^Frames:\s*(\d+)$/i.exec(lines[0]);
  const frameTimeMatch = /^Frame\s+Time:\s*([+\-\deE.]+)$/i.exec(lines[1]);
  if (!framesMatch || !frameTimeMatch) throw new Error('BVH_TEMPORAL_HEADER_INVALID');

  const declaredFrames = Number(framesMatch[1]);
  const frameTimeSeconds = finiteNumber(frameTimeMatch[1], 'FRAME_TIME');
  if (!Number.isInteger(declaredFrames) || declaredFrames < 1) throw new Error('FRAME_COUNT_INVALID');
  if (!(frameTimeSeconds > 0)) throw new Error('FRAME_TIME_INVALID');

  const frameRows = lines.slice(2).map((line, index) => {
    const values = line.split(/\s+/).map((token) => finiteNumber(token, `FRAME_${index}_TOKEN`));
    return values;
  });

  if (frameRows.length !== declaredFrames) {
    throw new Error(`FRAME_COUNT_MISMATCH:${declaredFrames}:${frameRows.length}`);
  }
  return {declaredFrames, frameTimeSeconds, frameRows};
}

function parseHierarchy(text) {
  const hierarchyText = text.split(/\nMOTION\s*\n/i)[0];
  if (!/^HIERARCHY\b/m.test(hierarchyText)) throw new Error('BVH_HIERARCHY_MISSING');
  const jointEntries = [...hierarchyText.matchAll(/^\s*(ROOT|JOINT)\s+([^\s{]+)/gm)]
    .map((match) => ({kind: match[1], name: match[2]}));
  const channelCounts = [...hierarchyText.matchAll(/^\s*CHANNELS\s+(\d+)\b/gm)]
    .map((match) => Number(match[1]));
  const channelsPerFrame = channelCounts.reduce((sum, count) => sum + count, 0);
  if (jointEntries.length === 0 || channelsPerFrame === 0) throw new Error('BVH_HIERARCHY_EMPTY');
  return {jointEntries, channelsPerFrame};
}

function rootDisplacement(frameRows) {
  if (frameRows.length < 2 || frameRows[0].length < 3) return 0;
  const first = frameRows[0];
  const last = frameRows[frameRows.length - 1];
  return Math.hypot(last[0] - first[0], last[1] - first[1], last[2] - first[2]);
}

function meanAbsoluteFrameDelta(frameRows) {
  if (frameRows.length < 2) return 0;
  let total = 0;
  let samples = 0;
  for (let frame = 1; frame < frameRows.length; frame += 1) {
    const previous = frameRows[frame - 1];
    const current = frameRows[frame];
    const width = Math.min(previous.length, current.length);
    for (let column = 0; column < width; column += 1) {
      total += Math.abs(current[column] - previous[column]);
      samples += 1;
    }
  }
  return samples === 0 ? 0 : total / samples;
}

export function probeKimodoBvh(text, provenance = {}) {
  if (typeof text !== 'string' || text.trim() === '') throw new Error('BVH_TEXT_REQUIRED');
  const {jointEntries, channelsPerFrame} = parseHierarchy(text);
  const {declaredFrames, frameTimeSeconds, frameRows} = parseMotionLines(text);

  for (let index = 0; index < frameRows.length; index += 1) {
    if (frameRows[index].length !== channelsPerFrame) {
      throw new Error(`CHANNEL_COUNT_MISMATCH:${index}:${channelsPerFrame}:${frameRows[index].length}`);
    }
  }

  const fps = 1 / frameTimeSeconds;
  return Object.freeze({
    schema: SCHEMA,
    source: Object.freeze({
      repo: String(provenance.repo ?? ''),
      commit: String(provenance.commit ?? ''),
      path: String(provenance.path ?? ''),
      blobSha: String(provenance.blobSha ?? ''),
    }),
    format: 'bvh',
    jointEntryCount: jointEntries.length,
    firstJoint: jointEntries[0]?.name ?? null,
    channelsPerFrame,
    frames: declaredFrames,
    frameTimeSeconds: round(frameTimeSeconds, 12),
    fps: round(fps, 6),
    playbackDurationSeconds: round(declaredFrames * frameTimeSeconds, 9),
    temporalSpanSeconds: round(Math.max(0, declaredFrames - 1) * frameTimeSeconds, 9),
    rootDisplacementUnits: round(rootDisplacement(frameRows), 9),
    meanAbsoluteChannelDelta: round(meanAbsoluteFrameDelta(frameRows), 9),
    deterministic: true,
    presentationOnly: true,
  });
}

export const KIMODO_NPZ_REQUIRED_KEYS = Object.freeze([
  'posed_joints',
  'global_rot_mats',
  'local_rot_mats',
  'foot_contacts',
  'root_positions',
  'global_root_heading',
]);

export function gitBlobSha(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return createHash('sha1')
    .update(Buffer.from(`blob ${data.length}\0`))
    .update(data)
    .digest('hex');
}

function findZipEnd(bytes) {
  const minimum = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('NPZ_ZIP_EOCD_NOT_FOUND');
}

function readZipEntries(bytes) {
  const archive = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const eocd = findZipEnd(archive);
  const entryCount = archive.readUInt16LE(eocd + 10);
  let centralOffset = archive.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error(`NPZ_ZIP_CENTRAL_HEADER_INVALID:${index}`);
    }
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const fileNameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`NPZ_ZIP_LOCAL_HEADER_INVALID:${name}`);
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    let payload;
    if (method === 0) payload = compressed;
    else if (method === 8) payload = inflateRawSync(compressed);
    else throw new Error(`NPZ_ZIP_UNSUPPORTED_COMPRESSION:${method}:${name}`);
    if (payload.length !== uncompressedSize) throw new Error(`NPZ_ZIP_SIZE_MISMATCH:${name}`);
    entries.set(name, payload);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

function parseNpyHeader(bytes) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (data.length < 10 || data[0] !== 0x93 || data.subarray(1, 6).toString('ascii') !== 'NUMPY') {
    throw new Error('NPY_MAGIC_INVALID');
  }
  const major = data[6];
  const minor = data[7];
  const headerLength = major === 1 ? data.readUInt16LE(8) : data.readUInt32LE(8);
  const headerOffset = major === 1 ? 10 : 12;
  const headerEnd = headerOffset + headerLength;
  if (headerEnd > data.length) throw new Error('NPY_HEADER_TRUNCATED');
  const header = data.subarray(headerOffset, headerEnd).toString('latin1').trim();
  const descrMatch = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header);
  const fortranMatch = /['"]fortran_order['"]\s*:\s*(True|False)/.exec(header);
  const shapeMatch = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header);
  if (!descrMatch || !fortranMatch || !shapeMatch) throw new Error('NPY_HEADER_FIELDS_INVALID');
  const shape = shapeMatch[1].split(',').map((value) => value.trim()).filter(Boolean).map((value) => Number.parseInt(value, 10));
  if (shape.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('NPY_SHAPE_INVALID');
  return Object.freeze({
    version: `${major}.${minor}`,
    descr: descrMatch[1],
    fortranOrder: fortranMatch[1] === 'True',
    shape: Object.freeze(shape),
    byteLength: data.length,
  });
}

export function probeKimodoNpzArtifact(bytes, provenance = {}) {
  const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const expectedBlobSha = String(provenance.blobSha ?? '');
  const expectedByteLength = Number(provenance.byteLength);
  if (!expectedBlobSha || !Number.isSafeInteger(expectedByteLength)) throw new Error('NPZ_EXPECTED_IDENTITY_REQUIRED');
  const actualBlobSha = gitBlobSha(data);
  if (actualBlobSha !== expectedBlobSha) throw new Error(`NPZ_GIT_BLOB_SHA_MISMATCH:${actualBlobSha}:${expectedBlobSha}`);
  if (data.length !== expectedByteLength) throw new Error(`NPZ_BYTE_LENGTH_MISMATCH:${data.length}:${expectedByteLength}`);

  const arrays = {};
  for (const [name, payload] of readZipEntries(data)) {
    if (name.endsWith('.npy')) arrays[name.slice(0, -4)] = parseNpyHeader(payload);
  }
  const missingKeys = KIMODO_NPZ_REQUIRED_KEYS.filter((key) => !Object.hasOwn(arrays, key));
  if (missingKeys.length) throw new Error(`NPZ_REQUIRED_KEYS_MISSING:${missingKeys.join(',')}`);
  const posed = arrays.posed_joints;
  return Object.freeze({
    schema: NPZ_SCHEMA,
    source: Object.freeze({
      repo: String(provenance.repo ?? ''),
      commit: String(provenance.commit ?? ''),
      path: String(provenance.path ?? ''),
      blobSha: actualBlobSha,
      byteLength: data.length,
      redistributionLicense: String(provenance.redistributionLicense ?? ''),
    }),
    format: 'npz',
    arrays: Object.freeze(arrays),
    frameCount: posed.shape[0] ?? null,
    jointCount: posed.shape[1] ?? null,
    actualGeneratedArtifactVerified: true,
    retargetedToGameroad: false,
    presentationOnly: true,
  });
}

function runCli() {
  const [inputPath, provenancePath] = process.argv.slice(2);
  if (!inputPath) {
    console.error('usage: node tools/kimodo-bvh-output-probe.mjs <motion.bvh> [provenance.json]');
    process.exitCode = 2;
    return;
  }
  const text = fs.readFileSync(inputPath, 'utf8');
  const provenance = provenancePath
    ? JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
    : {path: path.resolve(inputPath)};
  process.stdout.write(`${JSON.stringify(probeKimodoBvh(text, provenance), null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runCli();
}

export const KIMODO_BVH_OUTPUT_PROBE_SCHEMA = SCHEMA;
export const KIMODO_NPZ_OUTPUT_PROBE_SCHEMA = NPZ_SCHEMA;
