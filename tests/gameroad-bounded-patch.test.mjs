import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  BOUNDED_PATCH_SCHEMA,
  applyBoundedPatch,
  runBoundedPatchCli,
} from '../tools/gameroad-bounded-patch.mjs';

const sha = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const specFor = (source, operations, extra = {}) => ({
  schemaVersion: BOUNDED_PATCH_SCHEMA,
  expectedSourceSha256: sha(source),
  operations,
  ...extra,
});

test('applies multiple unique exact anchors against one pinned source', () => {
  const source = 'HEAD\nlegacy-target\nMIDDLE\nlegacy-seven-win\nTAIL\n';
  const expected = 'HEAD\ncurrent-compound\nMIDDLE\ngoal-gate\nTAIL\n';
  const result = applyBoundedPatch(source, specFor(source, [
    { id: 'target', before: 'legacy-target', after: 'current-compound', expectedCount: 1 },
    { id: 'seven', before: 'legacy-seven-win', after: 'goal-gate', expectedCount: 1 },
  ], { expectedOutputSha256: sha(expected) }));
  assert.equal(result.outputText, expected);
  assert.equal(result.sourceSha256, sha(source));
  assert.equal(result.outputSha256, sha(expected));
  assert.deepEqual([...result.changedOperationIds], ['target', 'seven']);
});

test('rejects a moved source before inspecting anchors', () => {
  const source = 'legacy-target';
  const spec = specFor(source, [
    { id: 'target', before: 'legacy-target', after: 'current', expectedCount: 1 },
  ]);
  assert.throws(() => applyBoundedPatch(`${source}\nadvanced`, spec), /SOURCE_SHA256_MISMATCH/);
});

test('rejects missing or duplicated anchors', () => {
  const missingSource = 'alpha';
  assert.throws(() => applyBoundedPatch(missingSource, specFor(missingSource, [
    { id: 'missing', before: 'beta', after: 'gamma', expectedCount: 1 },
  ])), /ANCHOR_COUNT_MISMATCH:missing:expected=1:actual=0/);

  const duplicateSource = 'x target x target x';
  assert.throws(() => applyBoundedPatch(duplicateSource, specFor(duplicateSource, [
    { id: 'duplicate', before: 'target', after: 'current', expectedCount: 1 },
  ])), /ANCHOR_COUNT_MISMATCH:duplicate:expected=1:actual=2/);
});

test('rejects overlapping anchors and no-op replacements', () => {
  const source = 'abcdef';
  assert.throws(() => applyBoundedPatch(source, specFor(source, [
    { id: 'left', before: 'abcde', after: 'LEFT', expectedCount: 1 },
    { id: 'right', before: 'cdef', after: 'RIGHT', expectedCount: 1 },
  ])), /ANCHOR_RANGE_OVERLAP:left:right/);
  assert.throws(() => applyBoundedPatch(source, specFor(source, [
    { id: 'noop', before: 'abc', after: 'abc', expectedCount: 1 },
  ])), /OP_NOOP_FORBIDDEN:noop/);
});

test('rejects wrong expected output hash', () => {
  const source = 'legacy';
  assert.throws(() => applyBoundedPatch(source, specFor(source, [
    { id: 'replace', before: 'legacy', after: 'current', expectedCount: 1 },
  ], { expectedOutputSha256: '0'.repeat(64) })), /OUTPUT_SHA256_MISMATCH/);
});

test('CLI check mode validates without writing and write mode supports atomic in-place output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-bounded-patch-'));
  const sourcePath = path.join(dir, 'GAMEROAD.html');
  const specPath = path.join(dir, 'patch.json');
  const source = '<p>legacy</p>\n';
  const expected = '<p>current</p>\n';
  await writeFile(sourcePath, source, 'utf8');
  await writeFile(specPath, JSON.stringify(specFor(source, [
    { id: 'html', before: '<p>legacy</p>', after: '<p>current</p>', expectedCount: 1 },
  ], { expectedOutputSha256: sha(expected) })), 'utf8');

  const checked = await runBoundedPatchCli(['--source', sourcePath, '--spec', specPath, '--check']);
  assert.equal(checked.checkOnly, true);
  assert.equal(await readFile(sourcePath, 'utf8'), source);

  const written = await runBoundedPatchCli(['--source', sourcePath, '--spec', specPath, '--out', sourcePath]);
  assert.equal(written.checkOnly, false);
  assert.equal(await readFile(sourcePath, 'utf8'), expected);
});
