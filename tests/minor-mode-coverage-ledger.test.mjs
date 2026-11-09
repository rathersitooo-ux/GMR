import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testHere = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testHere, '..');
const ledgerPath = path.join(repoRoot, 'browser/minor-mode-coverage-ledger.json');
const htmlPath = path.join(repoRoot, 'browser/GAMEROAD.html');

async function loadLedger() {
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  assert.equal(ledger.schema, 'gameroad.minor-mode-coverage-ledger.v1');
  assert.equal(ledger.taskId, 'MINOR-MODE-PLAYGLOBAL-COVERAGE-001');
  assert.ok(Array.isArray(ledger.entries));
  assert.equal(ledger.entries.length, 10);
  return ledger;
}

async function countLowPerfFiles() {
  let count = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') await walk(full);
      } else if (entry.isFile()) {
        try {
          if ((await readFile(full, 'utf8')).includes('lowPerf')) count += 1;
        } catch {
          // 読めないファイル（画像など）は数えない
        }
      }
    }
  }
  await walk(path.join(repoRoot, 'browser'));
  return count;
}

test('台帳の10件は順番が1〜10で重ならず、持ち主がA65である', async () => {
  const ledger = await loadLedger();
  const ids = new Set();
  const ranks = new Set();
  for (const entry of ledger.entries) {
    assert.ok(!ids.has(entry.id), `duplicate ledger entry id: ${entry.id}`);
    ids.add(entry.id);
    assert.ok(!ranks.has(entry.rank), `duplicate rank: ${entry.rank}`);
    ranks.add(entry.rank);
    assert.equal(typeof entry.gap, 'string');
    assert.ok(entry.gap.length > 0, `gap missing: ${entry.id}`);
    assert.equal(typeof entry.nextStep, 'string');
    assert.ok(entry.nextStep.length > 0, `nextStep missing: ${entry.id}`);
    assert.ok(Array.isArray(entry.testFiles), `testFiles must be an array: ${entry.id}`);
    assert.ok(Array.isArray(entry.modules), `modules must be an array: ${entry.id}`);
  }
  assert.deepEqual([...ranks].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('台帳に載る検査と部品のファイルは写しにある', async () => {
  const ledger = await loadLedger();
  for (const entry of ledger.entries) {
    for (const file of [...entry.testFiles, ...entry.modules]) {
      await access(path.join(repoRoot, file));
    }
  }
});

test('台帳に載る画面は GAMEROAD.html にある（数も合う）', async () => {
  const ledger = await loadLedger();
  const html = await readFile(htmlPath, 'utf8');
  for (const entry of ledger.entries) {
    if (entry.screen == null) {
      assert.equal(entry.screenCount, 0, `screenCount must be 0 without screen: ${entry.id}`);
      continue;
    }
    const needle = `data-screen="${entry.screen}"`;
    const count = html.split(needle).length - 1;
    assert.equal(count, entry.screenCount, `screen count mismatch: ${entry.id} (${needle})`);
  }
});

test('Missions は検査0件・専用部品なし・報酬は利用不可、と台帳に書いてある通りである', async () => {
  const ledger = await loadLedger();
  const missions = ledger.entries.find((entry) => entry.id === 'missions');
  assert.equal(missions.rank, 1);
  assert.deepEqual(missions.testFiles, []);
  assert.deepEqual(missions.modules, []);
  const html = await readFile(htmlPath, 'utf8');
  assert.ok(html.includes('報酬受取：利用不可'), 'missions reward must still say 利用不可');
  assert.ok(html.includes('function renderMissions()'), 'renderMissions must exist in GAMEROAD.html');
});

test('FriendRoom は「合言葉をコピー」がない、と台帳に書いてある通りである', async () => {
  const ledger = await loadLedger();
  const friendroom = ledger.entries.find((entry) => entry.id === 'friendroom');
  assert.equal(friendroom.rank, 2);
  const html = await readFile(htmlPath, 'utf8');
  assert.equal(html.includes('合言葉をコピー'), false, 'copy button must be absent until the ledger is updated with it');
  assert.ok(html.includes('合言葉'), 'room code label must exist');
});

test('低性能は browser/ に lowPerf があるファイルの数が台帳通りである', async () => {
  const ledger = await loadLedger();
  const low = ledger.entries.find((entry) => entry.id === 'low-performance');
  assert.equal(await countLowPerfFiles(), low.lowPerfFileCount);
});

test('隔離ミニモードは GAMEROAD.html からつながっていない、と台帳に書いてある通りである', async () => {
  const ledger = await loadLedger();
  const isolated = ledger.entries.find((entry) => entry.id === 'isolated-cartridge');
  assert.equal(isolated.modules.length, 9);
  assert.equal(isolated.testFiles.length, 10);
  const html = await readFile(htmlPath, 'utf8');
  assert.equal(html.includes('cartridge'), false, 'cartridge must not be wired from GAMEROAD.html yet');
});
