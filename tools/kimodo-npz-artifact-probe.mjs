#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const REQUIRED_KIMODO_KEYS = Object.freeze([
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

function findEndOfCentralDirectory(bytes) {
  const signature = 0x06054b50;
  const minimumOffset = Math.max(0, bytes.length - 0xffff - 22);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === signature) return offset;
  }
  throw new Error('NPZ_ZIP_EOCD_NOT_FOUND');
}

export function readZipEntries(bytes) {
  const archive = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const eocdOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  let centralOffset = archive.readUInt32LE(eocdOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error(`NPZ_ZIP_CENTRAL_HEADER_INVALID:${index}`);
    }
    const compressionMethod = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const fileNameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(centralOffset + 42);
    const fileName = archive.subarray(centralOffset + 46, centralOffset + 46 + fileNameLength).toString('utf8');

    if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`NPZ_ZIP_LOCAL_HEADER_INVALID:${fileName}`);
    }
    const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    let payload;
    if (compressionMethod === 0) payload = compressed;
    else if (compressionMethod === 8) payload = inflateRawSync(compressed);
    else throw new Error(`NPZ_ZIP_UNSUPPORTED_COMPRESSION:${compressionMethod}:${fileName}`);

    if (payload.length !== uncompressedSize) {
      throw new Error(`NPZ_ZIP_SIZE_MISMATCH:${fileName}:${payload.length}:${uncompressedSize}`);
    }
    entries.set(fileName, payload);
    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }
  return entries;
}

export function parseNpyHeader(bytes) {
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
  if (!descrMatch || !fortranMatch || !shapeMatch) throw new Error(`NPY_HEADER_FIELDS_INVALID:${header}`);
  const shape = shapeMatch[1]
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  if (shape.some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('NPY_SHAPE_INVALID');
  return {
    version: `${major}.${minor}`,
    descr: descrMatch[1],
    fortranOrder: fortranMatch[1] === 'True',
    shape,
    dataOffset: headerEnd,
    byteLength: data.length,
  };
}

export function inspectNpz(bytes, requiredKeys = REQUIRED_KIMODO_KEYS) {
  const zipEntries = readZipEntries(bytes);
  const arrays = {};
  for (const [name, payload] of zipEntries.entries()) {
    if (!name.endsWith('.npy')) continue;
    arrays[name.slice(0, -4)] = parseNpyHeader(payload);
  }
  const missingKeys = requiredKeys.filter((key) => !Object.hasOwn(arrays, key));
  return { arrays, missingKeys };
}

async function downloadBytes(url) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`DOWNLOAD_HTTP_${response.status}:${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined) throw new Error(`INVALID_ARGUMENTS:${argv.join(' ')}`);
    options[flag.slice(2)] = value;
  }
  return options;
}

export async function probeRemoteArtifact(options) {
  const bytes = await downloadBytes(options.url);
  const actualBlobSha = gitBlobSha(bytes);
  const actualSize = bytes.length;
  const expectedSize = Number.parseInt(options['expected-size'], 10);
  const expectedBlobSha = options['expected-git-blob-sha'];
  if (!expectedBlobSha || !Number.isSafeInteger(expectedSize)) throw new Error('EXPECTED_IDENTITY_REQUIRED');
  if (actualBlobSha !== expectedBlobSha) {
    throw new Error(`GIT_BLOB_SHA_MISMATCH:${actualBlobSha}:${expectedBlobSha}`);
  }
  if (actualSize !== expectedSize) throw new Error(`BYTE_SIZE_MISMATCH:${actualSize}:${expectedSize}`);
  const inspection = inspectNpz(bytes);
  if (inspection.missingKeys.length) throw new Error(`KIMODO_REQUIRED_KEYS_MISSING:${inspection.missingKeys.join(',')}`);
  const posed = inspection.arrays.posed_joints;
  const evidence = {
    schema: 'gameroad.kimodo.actual-artifact-probe.v1',
    result: 'PASS',
    sourceUrl: options.url,
    sourceRepository: options['source-repository'] ?? null,
    sourceCommit: options['source-commit'] ?? null,
    sourcePath: options['source-path'] ?? null,
    redistributionLicense: options.license ?? null,
    byteLength: actualSize,
    gitBlobSha: actualBlobSha,
    motionSummary: {
      frameCount: posed?.shape?.[0] ?? null,
      jointCount: posed?.shape?.[1] ?? null,
    },
    arrays: inspection.arrays,
    missingKeys: inspection.missingKeys,
  };
  if (options.output) await writeFile(options.output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return evidence;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) throw new Error('--url is required');
  const evidence = await probeRemoteArtifact(options);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    console.error(`[kimodo-npz-artifact-probe] ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
}
