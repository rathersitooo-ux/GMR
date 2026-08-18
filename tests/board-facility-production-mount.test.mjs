import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPackage } from '../deploy/cloudflare/scripts/build.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

test('production Browser mounts the facility bridge and ready-gated host seam exactly once', async () => {
  const html = await readFile(path.join(repoRoot, 'browser/GAMEROAD.html'), 'utf8');
  const classicTag = '<script src="./board-facility-state-core.classic.js"></script>';
  const mountImport = 'import { mountBoardFacilityRuntime } from "./board-facility-runtime-mount.mjs";';
  const mountCall = 'await mountBoardFacilityRuntime(globalThis);';
  const navigationImport = 'import { resolveScreenNavigation } from "./screen-navigation-core.mjs";';

  assert.equal(occurrences(html, classicTag), 1);
  assert.equal(occurrences(html, mountImport), 1);
  assert.equal(occurrences(html, mountCall), 1);
  assert.equal(occurrences(html, navigationImport), 1);

  const classicIndex = html.indexOf(classicTag);
  const mountIndex = html.indexOf(mountImport);
  const navigationIndex = html.indexOf(navigationImport);
  assert.ok(classicIndex < mountIndex, 'classic bridge must install before the host mount module runs');
  assert.ok(mountIndex < navigationIndex, 'facility mount must stay in the bounded module-loader seam');
});

test('Cloudflare public package ships facility bridge, ESM core, and runtime mount byte-identically', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gameroad-board-facility-pack-'));
  const dist = path.join(dir, 'dist');
  const manifest = await buildPackage({ dist, sourceCommit: 'board-facility-production-mount-test' });

  for (const file of [
    'board-facility-state-core.classic.js',
    'board-facility-state-core.mjs',
    'board-facility-runtime-mount.mjs',
  ]) {
    const source = await readFile(path.join(repoRoot, 'browser', file));
    const output = await readFile(path.join(dist, file));
    assert.equal(output.equals(source), true, `${file} must be copied byte-identically`);
  }

  assert.equal(
    manifest.artifacts.board_facility_classic.output,
    'board-facility-state-core.classic.js',
  );
  assert.equal(
    manifest.artifacts.board_facility_core.output,
    'board-facility-state-core.mjs',
  );
  assert.equal(
    manifest.artifacts.board_facility_runtime_mount.output,
    'board-facility-runtime-mount.mjs',
  );
});
