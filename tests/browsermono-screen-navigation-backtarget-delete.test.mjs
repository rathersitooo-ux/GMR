import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  transformBrowserMonoScreenNavigationBackTarget,
  verifyBrowserMonoBackTargetDeletion
} from '../scripts/apply-browsermono-screen-navigation-backtarget-delete.mjs';

const LEGACY_MOUNT = `<script type="module">
import { resolveScreenNavigation } from "./screen-navigation-core.mjs";
const existingScreenNavigationBridge=globalThis.GAMEROAD_SCREEN_NAVIGATION;
if(existingScreenNavigationBridge && existingScreenNavigationBridge.resolve!==resolveScreenNavigation){
  throw new Error("GAMEROAD_SCREEN_NAVIGATION is already occupied by an incompatible bridge");
}
if(!existingScreenNavigationBridge){
  Object.defineProperty(globalThis,"GAMEROAD_SCREEN_NAVIGATION",{
    value:Object.freeze({resolve:resolveScreenNavigation}),
    enumerable:false,
    configurable:false,
    writable:false
  });
}
</script>`;

const LEGACY_DECLARATION = `const GAMEROAD_NAV_FALLBACK_PARENT={
  gacha:'shop',
  cards:'home',
  note:'semicolon;inside-string'
};\n`;

const LEGACY_BACK = `function back(){
  const entry=state.history.pop();
  const target=entry?.screen || GAMEROAD_NAV_FALLBACK_PARENT[state.screen] || 'home';
  return target;
}`;

function fixture({ mount = LEGACY_MOUNT, declaration = LEGACY_DECLARATION, back = LEGACY_BACK } = {}) {
  return `<!doctype html>\n${mount}\n<script>\n${declaration}${back}\n</script>`;
}

test('transforms the legacy mount, fallback declaration, and back-target expression exactly once', () => {
  const { output, counts } = transformBrowserMonoScreenNavigationBackTarget(fixture());
  assert.deepEqual(counts, { mountCount: 1, declarationCount: 1, backTargetCount: 1 });
  assert.doesNotMatch(output, /GAMEROAD_NAV_FALLBACK_PARENT/);
  assert.match(output, /import \{ createScreenNavigationRuntimeBridge \}/);
  assert.match(output, /value:runtimeScreenNavigationBridge/);
  assert.match(output, /globalThis\.GAMEROAD_SCREEN_NAVIGATION\.resolveBackTarget\(state\.screen,entry\)/);
  assert.equal(verifyBrowserMonoBackTargetDeletion(output), true);
});

test('accepts compact whitespace and double-quoted home in the legacy back expression', () => {
  const compact = LEGACY_BACK.replace(
    "entry?.screen || GAMEROAD_NAV_FALLBACK_PARENT[state.screen] || 'home'",
    'entry?.screen||GAMEROAD_NAV_FALLBACK_PARENT[ state.screen ]||"home"'
  );
  const { output } = transformBrowserMonoScreenNavigationBackTarget(fixture({ back: compact }));
  assert.match(output, /GAMEROAD_SCREEN_NAVIGATION\.resolveBackTarget\(state\.screen,entry\)/);
});

test('fails closed when the legacy fallback declaration is missing or duplicated', () => {
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ declaration: '' })),
    /exactly one legacy fallback declaration, found 0/
  );
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ declaration: LEGACY_DECLARATION + LEGACY_DECLARATION })),
    /exactly one legacy fallback declaration, found 2/
  );
});

test('fails closed when the legacy back-target expression is missing or duplicated', () => {
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ back: 'function back(){return "home";}' })),
    /exactly one legacy back-target expression, found 0/
  );
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ back: `${LEGACY_BACK}\n${LEGACY_BACK}` })),
    /exactly one legacy back-target expression, found 2/
  );
});

test('fails closed when the legacy navigation mount is missing or duplicated', () => {
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ mount: '' })),
    /exactly one legacy navigation mount, found 0/
  );
  assert.throws(
    () => transformBrowserMonoScreenNavigationBackTarget(fixture({ mount: `${LEGACY_MOUNT}\n${LEGACY_MOUNT}` })),
    /exactly one legacy navigation mount, found 2/
  );
});

test('--check validates without writing the input file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'browsermono-r7-'));
  const inputPath = join(dir, 'GAMEROAD.html');
  const source = fixture();
  await writeFile(inputPath, source, 'utf8');

  const scriptPath = fileURLToPath(new URL('../scripts/apply-browsermono-screen-navigation-backtarget-delete.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath, '--check', '--input', inputPath], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    mode: 'check',
    input: inputPath,
    output: null,
    changed: true,
    mountCount: 1,
    declarationCount: 1,
    backTargetCount: 1
  });
  assert.equal(await readFile(inputPath, 'utf8'), source);
});
