import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtimeSource = await readFile(new URL('../browser/rank-match-entry-runtime.mjs', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../browser/rank-match-entry-core.mjs', import.meta.url), 'utf8');
const mountSource = await readFile(new URL('../browser/home-boot-runtime-mount.mjs', import.meta.url), 'utf8');

test('runtime deletes the Home rank text selectors', () => {
  assert.match(runtimeSource, /\.codexRankLabel/);
  assert.match(runtimeSource, /\.codexBattleCrest strong/);
  assert.match(runtimeSource, /removeHomeRankText/);
});

test('runtime uses the generated reference texture and reference-aligned anchors', () => {
  assert.match(coreSource, /rank-match-waiting-skin-v1\.webp/);
  assert.match(runtimeSource, /projectRankMatchWaitingLayout/);
  assert.match(runtimeSource, /RANK_MATCH_ENTRY_SCHEMA/);
});

test('runtime is mounted from the active Home module and exposes live search events', () => {
  assert.match(mountSource, /mountRankMatchEntryRuntime/);
  assert.match(runtimeSource, /gameroad:rank-match-search-start/);
  assert.match(runtimeSource, /gameroad:rank-match-search-cancel/);
  assert.match(runtimeSource, /GAMEROAD_RANK_MATCH_SEARCH/);
});
