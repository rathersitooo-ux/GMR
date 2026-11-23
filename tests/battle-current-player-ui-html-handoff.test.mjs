import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const characterBinding = await readFile(new URL('../browser/battle-board-naki-4p-visual-binding.mjs', import.meta.url), 'utf8');
const visualEntry = await readFile(new URL('../browser/battle-board-visual-explanation-runtime-mount.mjs', import.meta.url), 'utf8');
const liveAdapter = await readFile(new URL('../browser/battle-current-player-ui-live-adapter.mjs', import.meta.url), 'utf8');
const build = await readFile(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

test('public Battle reaches the current-player UI adapter through an already-live visual entrypoint', () => {
  assert.ok(html.includes("import './battle-board-naki-4p-visual-binding.mjs'"));
  assert.ok(characterBinding.includes("import './battle-board-visual-explanation-runtime-mount.mjs'"));
  assert.ok(visualEntry.includes("import './battle-current-player-ui-live-adapter.mjs'"));
});

test('the reused current-player adapter still auto-mounts rather than requiring gameplay-owner changes', () => {
  assert.ok(liveAdapter.includes('function autoMount()'));
  assert.ok(liveAdapter.includes('mountBattleCurrentPlayerUiLiveAdapter(globalThis)'));
  assert.ok(liveAdapter.includes("globalThis.document.addEventListener?.('DOMContentLoaded', autoMount, { once: true })"));
});

test('Cloudflare public package already ships the compositor and live adapter dependency pair', () => {
  assert.ok(build.includes("browser/battle-current-player-ui-runtime.mjs"));
  assert.ok(build.includes("browser/battle-current-player-ui-live-adapter.mjs"));
});
