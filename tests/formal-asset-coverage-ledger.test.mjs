import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testHere = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testHere, '..');
const ledgerPath = path.join(repoRoot, 'browser/formal-asset-coverage-ledger.json');
const buildPath = path.join(repoRoot, 'deploy/cloudflare/scripts/build.mjs');

const CLASSIFICATIONS = new Set([
  'FORMAL_ASSET',
  'CANDIDATE',
  'MOCK_APPEARANCE',
  'PROVISIONAL',
  'MISSING',
]);

// 実行側が参照する公開用の素材の道。列挙の根拠は列1第2まとまりの調べメモ。
// cards-deck-presentation-core / home-shell-presentation-core /
// setup-forest-stage-runtime-mount / GAMEROAD.html のショップ画面 /
// saasuna-battle-motion-core / partner-saasuna-bustup-visuals が読むもの。
const REFERENCED_PUBLIC_PATHS = [
  'assets/visual/effects/card-transfer-burst-sprite-v1.png',
  'assets/visual/effects/home-border-light-overlay-v1.png',
  'assets/visual/effects/setup-action-state-light-sprite-v1.png',
  'assets/visual/effects/setup-forest-sun-patch-4x4-v1.png',
  'assets/visual/effects/setup-forest-humid-air-veil-v1.png',
  'assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png',
  'assets/visual/effects/records-selection-sweep-sprite-v1.png',
  'assets/visual/shop-pack-ornament-v1.png',
  'assets/visual/provisional/saasuna-battle-keyframes-r1.png',
  'assets/visual/battle-power-energy.jpg',
  'assets/visual/cards/dcg-ze-kuu.jpg',
  'assets/visual/home/home-illustration-landscape.webp',
  'assets/visual/home/home-illustration-portrait.webp',
  'assets/shop/fanart/saasuna-sleeve-snow-blue-v1.jpg',
  'assets/visual/battle-ui/launcher-r22/charged-flame.png',
  'assets/visual/battle-ui/launcher-r22/receiver.png',
  'assets/visual/battle-ui/launcher-r22/clamp.png',
  'assets/visual/battle-ui/wood-frame-r1.png',
  'assets/visual/battle-vfx/throw-thin.png',
  'assets/visual/battle-vfx/impact-cyan.png',
  'click_002.ogg',
  'cardSlide6.ogg',
  'cardPlace1.ogg',
  ...[
    'GAMEROAD_SAASUNA_NAV_01_HAPPY_WAVE_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_02_CURIOUS_CONFUSED_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_03_SHH_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_04_GUIDE_PRESENT_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_05_IDLE_GENTLE_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_06_SURPRISED_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_07_TOUCH_CRY_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_08_HAPPY_SMILE_TRANSPARENT_20260915.png',
    'GAMEROAD_SAASUNA_NAV_09_SAD_DOWNCAST_TRANSPARENT_20260915.png',
  ].map((name) => `assets/partners/saasuna/${name}`),
  ...[
    'waiting-bg.webp',
    'ui-chrome.webp',
    'partner-picker.webp',
    'picker-modal.webp',
    'picker-tile-selected.webp',
    'button-primary.webp',
    'button-secondary.webp',
    'action-ring.webp',
    'waiting-vfx.webp',
  ].map((name) => `assets/visual/rank-match/${name}`),
];

async function loadLedger() {
  const text = await readFile(ledgerPath, 'utf8');
  const ledger = JSON.parse(text);
  assert.equal(ledger.schema, 'gameroad.formal-asset-coverage-ledger.v1');
  assert.equal(ledger.taskId, 'IMAGE_ASSET_FULL-01');
  assert.ok(Array.isArray(ledger.entries));
  assert.ok(ledger.entries.length > 0);
  return ledger;
}

async function loadBuildOutputs() {
  const text = await readFile(buildPath, 'utf8');
  const outputs = new Set();
  for (const match of text.matchAll(/output:\s*'([^']+)'/g)) outputs.add(match[1]);
  return outputs;
}

test('台帳の全項目に持ち主がある（持ち主なし0件）', async () => {
  const ledger = await loadLedger();
  const ids = new Set();
  for (const entry of ledger.entries) {
    assert.equal(typeof entry.id, 'string');
    assert.ok(entry.id.length > 0, 'entry id must not be empty');
    assert.equal(ids.has(entry.id), false, `duplicate ledger entry id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(
      CLASSIFICATIONS.has(entry.classification),
      `unknown classification for ${entry.id}: ${entry.classification}`,
    );
    assert.equal(typeof entry.ownerTask, 'string', `missing ownerTask: ${entry.id}`);
    assert.ok(entry.ownerTask.length > 0, `missing ownerTask: ${entry.id}`);
    assert.match(entry.ownerTask, /^[A-Z0-9_-]+$/, `ownerTask shape: ${entry.id}`);
    assert.ok(Array.isArray(entry.files), `files must be an array: ${entry.id}`);
    assert.ok(Array.isArray(entry.publicOutputs), `publicOutputs must be an array: ${entry.id}`);
    if (entry.classification === 'MISSING') {
      assert.equal(entry.files.length, 0, `MISSING entry must not claim a file: ${entry.id}`);
      assert.equal(entry.publicOutputs.length, 0, `MISSING entry must not claim an output: ${entry.id}`);
    }
    if (entry.classification === 'FORMAL_ASSET') {
      assert.equal(typeof entry.evidence, 'string', `FORMAL_ASSET needs evidence: ${entry.id}`);
      assert.ok(entry.evidence.length > 0, `FORMAL_ASSET needs evidence: ${entry.id}`);
    }
  }
});

test('ファイルがある項目は写しにあり、公開用の出力は組み立て一覧にある', async () => {
  const ledger = await loadLedger();
  const buildOutputs = await loadBuildOutputs();
  for (const entry of ledger.entries) {
    for (const file of entry.files) {
      await access(path.join(repoRoot, file));
    }
    if (entry.publicOutputs.length > 0) {
      assert.equal(
        entry.files.length,
        entry.publicOutputs.length,
        `files/publicOutputs count mismatch: ${entry.id}`,
      );
      for (const output of entry.publicOutputs) {
        assert.ok(buildOutputs.has(output), `public output missing from build list: ${output} (${entry.id})`);
      }
    }
    if (entry.files.length > 0 && entry.publicOutputs.length === 0) {
      assert.ok(
        (entry.note ?? '').includes('未接続')
          || (typeof entry.embeddedIn === 'string' && entry.embeddedIn.length > 0),
        `unshipped file entry must say 未接続 or name embeddedIn: ${entry.id}`,
      );
    }
  }
});

test('埋め込み接続の項目は、埋め込み先のファイルが写しにある', async () => {
  const ledger = await loadLedger();
  for (const entry of ledger.entries) {
    if (typeof entry.embeddedIn === 'string' && entry.embeddedIn.length > 0) {
      await access(path.join(repoRoot, entry.embeddedIn));
    }
  }
});

test('出どころ記録（SOURCES.md）がある項目は、その記録ファイルが写しにある', async () => {
  const ledger = await loadLedger();
  for (const entry of ledger.entries) {
    if (!(entry.source ?? '').includes('SOURCES.md')) continue;
    const candidates = [];
    for (const file of entry.files) {
      candidates.push(file.replace(/\.[^.]+$/, '.SOURCES.md'));
      candidates.push(path.join(path.dirname(file), 'SOURCES.md'));
    }
    let found = false;
    for (const candidate of candidates) {
      try {
        await access(path.join(repoRoot, candidate));
        found = true;
        break;
      } catch {
        // 次の候補を見る
      }
    }
    assert.ok(found, `SOURCES.md missing for ${entry.id}`);
  }
});

test('実行側が参照する素材の道は台帳にある（UNKNOWN=0）', async () => {
  const ledger = await loadLedger();
  const shipped = new Set();
  for (const entry of ledger.entries) {
    for (const output of entry.publicOutputs) shipped.add(output);
  }
  const missing = REFERENCED_PUBLIC_PATHS.filter((p) => !shipped.has(p));
  assert.deepEqual(missing, [], `runtime-referenced public paths missing from ledger: ${missing.join(', ')}`);
});
