#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BOUNDED_PATCH_SCHEMA = 'gameroad-bounded-patch-v1';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label}_OBJECT_REQUIRED`);
  }
  return value;
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label}_NON_EMPTY_STRING_REQUIRED`);
  }
  return value;
}

function countExact(haystack, needle) {
  let count = 0;
  let cursor = 0;
  while (true) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) return count;
    count += 1;
    cursor = found + needle.length;
  }
}

function validateSha(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new TypeError(`${label}_SHA256_REQUIRED`);
  }
  return value.toLowerCase();
}

export function normalizeBoundedPatchSpec(rawSpec) {
  const spec = assertPlainObject(rawSpec, 'SPEC');
  if (spec.schemaVersion !== BOUNDED_PATCH_SCHEMA) {
    throw new TypeError('SPEC_SCHEMA_UNSUPPORTED');
  }
  const expectedSourceSha256 = validateSha(spec.expectedSourceSha256, 'EXPECTED_SOURCE');
  const expectedOutputSha256 = spec.expectedOutputSha256 == null
    ? null
    : validateSha(spec.expectedOutputSha256, 'EXPECTED_OUTPUT');
  if (!Array.isArray(spec.operations) || spec.operations.length === 0) {
    throw new TypeError('OPERATIONS_REQUIRED');
  }
  const ids = new Set();
  const operations = spec.operations.map((raw, index) => {
    const op = assertPlainObject(raw, `OP_${index}`);
    const id = assertNonEmptyString(op.id, `OP_${index}_ID`);
    if (ids.has(id)) throw new TypeError(`OP_ID_DUPLICATE:${id}`);
    ids.add(id);
    const before = assertNonEmptyString(op.before, `OP_${id}_BEFORE`);
    if (typeof op.after !== 'string') throw new TypeError(`OP_${id}_AFTER_STRING_REQUIRED`);
    if (before === op.after) throw new TypeError(`OP_NOOP_FORBIDDEN:${id}`);
    if (op.expectedCount !== 1) throw new TypeError(`OP_EXPECTED_COUNT_MUST_BE_ONE:${id}`);
    return Object.freeze({ id, before, after: op.after, expectedCount: 1 });
  });
  return Object.freeze({
    schemaVersion: BOUNDED_PATCH_SCHEMA,
    expectedSourceSha256,
    expectedOutputSha256,
    operations: Object.freeze(operations),
  });
}

export function applyBoundedPatch(sourceText, rawSpec) {
  if (typeof sourceText !== 'string') throw new TypeError('SOURCE_TEXT_REQUIRED');
  const spec = normalizeBoundedPatchSpec(rawSpec);
  const sourceSha256 = sha256(sourceText);
  if (sourceSha256 !== spec.expectedSourceSha256) {
    throw new Error(`SOURCE_SHA256_MISMATCH:expected=${spec.expectedSourceSha256}:actual=${sourceSha256}`);
  }

  const ranges = spec.operations.map((op) => {
    const count = countExact(sourceText, op.before);
    if (count !== 1) throw new Error(`ANCHOR_COUNT_MISMATCH:${op.id}:expected=1:actual=${count}`);
    const start = sourceText.indexOf(op.before);
    return { ...op, start, end: start + op.before.length };
  }).sort((a, b) => a.start - b.start);

  for (let index = 1; index < ranges.length; index += 1) {
    const previous = ranges[index - 1];
    const current = ranges[index];
    if (current.start < previous.end) {
      throw new Error(`ANCHOR_RANGE_OVERLAP:${previous.id}:${current.id}`);
    }
  }

  let outputText = sourceText;
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    outputText = `${outputText.slice(0, range.start)}${range.after}${outputText.slice(range.end)}`;
  }
  if (outputText === sourceText) throw new Error('PATCH_PRODUCED_NO_CHANGE');

  const outputSha256 = sha256(outputText);
  if (spec.expectedOutputSha256 && outputSha256 !== spec.expectedOutputSha256) {
    throw new Error(`OUTPUT_SHA256_MISMATCH:expected=${spec.expectedOutputSha256}:actual=${outputSha256}`);
  }

  return Object.freeze({
    sourceText,
    outputText,
    sourceSha256,
    outputSha256,
    changedOperationIds: Object.freeze(ranges.map((range) => range.id)),
  });
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function atomicWrite(target, text) {
  const absolute = path.resolve(target);
  const temporary = `${absolute}.gameroad-bounded-patch-${process.pid}.tmp`;
  await writeFile(temporary, text, 'utf8');
  await rename(temporary, absolute);
}

export async function runBoundedPatchCli(argv) {
  const sourcePath = argValue(argv, '--source');
  const specPath = argValue(argv, '--spec');
  const outputPath = argValue(argv, '--out');
  const checkOnly = argv.includes('--check');
  if (!sourcePath || !specPath) {
    throw new TypeError('USAGE: --source <path> --spec <path> [--out <path>] [--check]');
  }
  if (!checkOnly && !outputPath) {
    throw new TypeError('OUTPUT_PATH_REQUIRED_UNLESS_CHECK');
  }
  const [sourceText, specText] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(specPath, 'utf8'),
  ]);
  let rawSpec;
  try {
    rawSpec = JSON.parse(specText);
  } catch {
    throw new TypeError('SPEC_JSON_INVALID');
  }
  const result = applyBoundedPatch(sourceText, rawSpec);
  if (!checkOnly) await atomicWrite(outputPath, result.outputText);
  return Object.freeze({
    ok: true,
    checkOnly,
    sourceSha256: result.sourceSha256,
    outputSha256: result.outputSha256,
    changedOperationIds: result.changedOperationIds,
    outputPath: checkOnly ? null : path.resolve(outputPath),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runBoundedPatchCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`GAMEROAD_BOUNDED_PATCH_REJECTED ${error.message}\n`);
      process.exitCode = 1;
    });
}
