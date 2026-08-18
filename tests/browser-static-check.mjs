import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CORE_SCREENS = ['home', 'cards', 'characters', 'setup', 'battle', 'result', 'shop'];

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function isExecutableScript(attrs) {
  const type = (attrValue(attrs, 'type') ?? '').trim().toLowerCase();
  if (!type) return true;
  return new Set([
    'text/javascript',
    'application/javascript',
    'text/ecmascript',
    'application/ecmascript',
    'module',
  ]).has(type);
}

function collectStaticErrors(html) {
  const errors = [];
  if (!/<!doctype\s+html\b/i.test(html)) errors.push('missing HTML doctype');

  for (const marker of ['<<<<<<<', '=======', '>>>>>>>']) {
    if (html.includes(marker)) errors.push(`merge-conflict marker present: ${marker}`);
  }

  for (const screen of CORE_SCREENS) {
    const re = new RegExp(`<section\\b[^>]*\\bdata-screen\\s*=\\s*["']${screen}["']`, 'i');
    if (!re.test(html)) errors.push(`missing core screen: ${screen}`);
  }

  if (!/\bdata-go\s*=/i.test(html)) errors.push('no data-go navigation targets found');
  if (!/dataset\.go/.test(html) || !/navigateDetail\s*\(/.test(html)) {
    errors.push('data-go navigation wiring is missing');
  }

  const screenNavigationContracts = [
    [
      /import\s*\{\s*resolveScreenNavigation\s*\}\s*from\s*["']\.\/screen-navigation-core\.mjs["']\s*;/,
      'screen navigation core is not production-mounted',
    ],
    [/globalThis\.GAMEROAD_SCREEN_NAVIGATION/, 'screen navigation bridge is missing'],
    [
      /bridge\.resolve\(state\.screen\s*,\s*target\)/,
      'navigateDetail does not delegate navigation decision to the screen navigation core',
    ],
  ];
  for (const [pattern, message] of screenNavigationContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/if\s*\(\s*!target\s*\|\|\s*target\s*===\s*state\.screen\s*\)\s*return\s*;/.test(html)) {
    errors.push('legacy inline screen navigation decision responsibility is present');
  }

  const hatePresenceContracts = [
    [/import\(['"]\.\/hate-peer-presence-core\.mjs['"]\)/, 'HATE peer presence core is not mounted in production Browser'],
    [/FRIEND_TRANSPORT_PRESENCE_TYPE=['"]transport_presence['"]/, 'reserved transport presence type is missing'],
    [/m\.type===FRIEND_TRANSPORT_PRESENCE_TYPE/, 'server transport presence is not handled by the host'],
    [/friendApplyTransportPresence\(m\)/, 'server presence frame is not passed to authoritative presence core'],
    [/a\.s\.connected=friendPresenceEligible\(cid\)/, 'join does not project authoritative presence eligibility'],
    [/s\.connected=friendPresenceEligible\(cid\)/, 'sync does not project authoritative presence eligibility'],
    [/FRIEND_PRESENCE\.states\.delete\(cid\)/, 'explicit leave does not reset peer presence session state'],
    [/FRIEND_PRESENCE\.states\.clear\(\)/, 'friend-room reset does not clear peer presence session state'],
  ];
  for (const [pattern, message] of hatePresenceContracts) {
    if (!pattern.test(html)) errors.push(message);
  }

  const dedicatedBattleContracts = [
    [/id=["']battlePhaseSurface["']/, 'missing dedicated battle phase surface'],
    [/id=["']battlePhaseResolutionSlot["']/, 'missing dedicated battle phase resolution slot'],
    [/BROWSER-BATTLE-PHASE-PRESENTATION-INTEGRATION-001-R2-DEDICATED-SURFACE/, 'missing dedicated battle phase R2 marker'],
    [/BATTLE-PHASE-R2-CUTIN-HOLD/, 'missing Naki cut-in secrecy hold'],
    [/\.battle\.dedicatedBattlePhase\s+\.battleMap[^\{]*\{[^\}]*visibility\s*:\s*hidden\s*!important[^\}]*pointer-events\s*:\s*none\s*!important/i, 'battle board is not disabled during dedicated battle phase'],
    [/new\s+MutationObserver\(syncShell\)/, 'dedicated battle phase is not observing public battle-resolution DOM'],
    [/GameRoadThreeCharRuntime/, 'Naki cut-in is not using the public character runtime'],
    [/characterId\s*:\s*["']partner\.naki["']/, 'Naki character is not wired to dedicated battle phase'],
    [/state\s*:\s*["']dot_break_entry["']/, 'Naki dot_break_entry state is not wired to dedicated battle phase'],
    [/__GAMEROAD_BATTLE_PHASE_R2__/, 'missing dedicated battle phase runtime probe'],
  ];
  for (const [pattern, message] of dedicatedBattleContracts) {
    if (!pattern.test(html)) errors.push(message);
  }

  const dedicatedScriptMatch = html.match(
    /<script\s+id=["']gameroad-battle-phase-presentation-r2-dedicated-script["'][^>]*>([\s\S]*?)<\/script\s*>/i,
  );
  if (!dedicatedScriptMatch) {
    errors.push('missing dedicated Battle Phase script body');
  } else {
    const dedicatedScript = dedicatedScriptMatch[1];
    for (const forbidden of [
      'const baseRenderBattle=renderBattle',
      'const baseSetBattlePresentation=setBattlePresentation',
      "mountChar('#battlePhaseNaki",
      'state.match',
    ]) {
      if (dedicatedScript.includes(forbidden)) {
        errors.push(`dedicated battle phase leaks into private runtime scope: ${forbidden}`);
      }
    }
  }

  return errors;
}

async function syntaxErrors(html) {
  const errors = [];
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const executable = scripts.filter((m) => isExecutableScript(m[1] ?? ''));
  if (executable.length === 0) return ['no executable script blocks found'];

  const dir = await mkdtemp(join(tmpdir(), 'gameroad-browser-ci-'));
  try {
    for (let i = 0; i < executable.length; i += 1) {
      const attrs = executable[i][1] ?? '';
      const body = executable[i][2] ?? '';
      const type = (attrValue(attrs, 'type') ?? '').trim().toLowerCase();
      const ext = type === 'module' ? '.mjs' : '.js';
      const file = join(dir, `script-${String(i + 1).padStart(3, '0')}${ext}`);
      await writeFile(file, body, 'utf8');
      const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      if (check.status !== 0) {
        const detail = (check.stderr || check.stdout || '').trim().split('\n').slice(0, 6).join('\n');
        errors.push(`script ${i + 1} failed node --check${detail ? `:\n${detail}` : ''}`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return errors;
}

async function validateHtml(html) {
  return [...collectStaticErrors(html), ...(await syntaxErrors(html))];
}

const SCREEN_NAVIGATION_BACK_CUTOVER = Object.freeze({
  bridgeBefore: `import { resolveScreenNavigation } from "./screen-navigation-core.mjs";
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
}`,
  bridgeAfter: `import { createScreenNavigationRuntimeBridge } from "./screen-navigation-core.mjs";
const existingScreenNavigationBridge=globalThis.GAMEROAD_SCREEN_NAVIGATION;
if(existingScreenNavigationBridge){
  if(typeof existingScreenNavigationBridge.resolve!=="function" || typeof existingScreenNavigationBridge.resolveBackTarget!=="function"){
    throw new Error("GAMEROAD_SCREEN_NAVIGATION is already occupied by an incompatible bridge");
  }
}else{
  Object.defineProperty(globalThis,"GAMEROAD_SCREEN_NAVIGATION",{
    value:createScreenNavigationRuntimeBridge(),
    enumerable:false,
    configurable:false,
    writable:false
  });
}`,
  fallbackBefore: `const GAMEROAD_NAV_FALLBACK_PARENT=Object.freeze({cards:'home',characters:'home',setup:'home',missions:'home',profile:'home',shop:'home',gacha:'shop',records:'home',settings:'home'});\n`,
  backBefore: `function navigateBack(){
  const entry=gameroadNav.stack.pop();
  const target=entry?.screen||GAMEROAD_NAV_FALLBACK_PARENT[state.screen]||'home';
  show(target);
}`,
  backAfter: `function navigateBack(){
  const bridge=globalThis.GAMEROAD_SCREEN_NAVIGATION;
  if(!bridge || typeof bridge.resolveBackTarget!=="function") throw new Error("GAMEROAD screen navigation bridge is not ready");
  const entry=gameroadNav.stack.pop();
  const target=bridge.resolveBackTarget(state.screen,entry);
  show(target);
}`,
});

function replaceExactlyOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`screen navigation cutover preimage missing: ${label}`);
  const second = source.indexOf(before, first + before.length);
  if (second >= 0) throw new Error(`screen navigation cutover preimage duplicated: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function prepareScreenNavigationBackCutover(html) {
  let next = html;
  next = replaceExactlyOnce(
    next,
    SCREEN_NAVIGATION_BACK_CUTOVER.bridgeBefore,
    SCREEN_NAVIGATION_BACK_CUTOVER.bridgeAfter,
    'runtime bridge mount',
  );
  next = replaceExactlyOnce(
    next,
    SCREEN_NAVIGATION_BACK_CUTOVER.fallbackBefore,
    '',
    'legacy fallback parent map',
  );
  next = replaceExactlyOnce(
    next,
    SCREEN_NAVIGATION_BACK_CUTOVER.backBefore,
    SCREEN_NAVIGATION_BACK_CUTOVER.backAfter,
    'legacy navigateBack target resolution',
  );
  return next;
}

async function runSelfTest() {
  const brokenSyntax = `<!doctype html><section data-screen="home"></section>${CORE_SCREENS.slice(1)
    .map((x) => `<section data-screen="${x}"></section>`)
    .join('')}<button data-go="setup"></button><script>const navigateDetail=()=>{};const x={dataset:{go:'setup'}};navigateDetail(x.dataset.go);const broken = ;</script>`;
  const syntaxResult = await validateHtml(brokenSyntax);
  if (!syntaxResult.some((x) => x.includes('failed node --check'))) {
    throw new Error('self-test failed: checker did not detect deliberately broken JavaScript');
  }

  const missingScreen = `<!doctype html>${CORE_SCREENS.filter((x) => x !== 'battle')
    .map((x) => `<section data-screen="${x}"></section>`)
    .join('')}<button data-go="setup"></button><script>const navigateDetail=()=>{};const x={dataset:{go:'setup'}};navigateDetail(x.dataset.go);</script>`;
  const screenResult = await validateHtml(missingScreen);
  if (!screenResult.includes('missing core screen: battle')) {
    throw new Error('self-test failed: checker did not detect missing battle screen');
  }

  const legacyNavigation = `<!doctype html>${CORE_SCREENS
    .map((x) => `<section data-screen="${x}"></section>`)
    .join('')}<button data-go="setup"></button><script>const state={screen:'home'};function navigateDetail(target){if(!target||target===state.screen)return;}const x={dataset:{go:'setup'}};navigateDetail(x.dataset.go);</script>`;
  const legacyNavigationResult = await validateHtml(legacyNavigation);
  if (!legacyNavigationResult.includes('legacy inline screen navigation decision responsibility is present')) {
    throw new Error('self-test failed: checker did not detect restored inline navigation responsibility');
  }

  const missingNavigationMount = `<!doctype html>${CORE_SCREENS
    .map((x) => `<section data-screen="${x}"></section>`)
    .join('')}<button data-go="setup"></button><script>const state={screen:'home'};function navigateDetail(target){const bridge={resolve(){return{ok:false}}};bridge.resolve(state.screen,target);}const x={dataset:{go:'setup'}};navigateDetail(x.dataset.go);</script>`;
  const missingNavigationMountResult = await validateHtml(missingNavigationMount);
  if (!missingNavigationMountResult.includes('screen navigation core is not production-mounted')) {
    throw new Error('self-test failed: checker did not detect missing screen-navigation core mount');
  }

  const cutoverInput = [
    SCREEN_NAVIGATION_BACK_CUTOVER.bridgeBefore,
    SCREEN_NAVIGATION_BACK_CUTOVER.fallbackBefore,
    SCREEN_NAVIGATION_BACK_CUTOVER.backBefore,
  ].join('\n');
  const cutoverOutput = prepareScreenNavigationBackCutover(cutoverInput);
  if (!cutoverOutput.includes('createScreenNavigationRuntimeBridge()')) {
    throw new Error('self-test failed: cutover did not mount the R6 runtime bridge');
  }
  if (!cutoverOutput.includes('bridge.resolveBackTarget(state.screen,entry)')) {
    throw new Error('self-test failed: cutover did not delegate back-target resolution');
  }
  if (cutoverOutput.includes('GAMEROAD_NAV_FALLBACK_PARENT')) {
    throw new Error('self-test failed: cutover retained the legacy fallback parent map');
  }
  if (cutoverOutput.includes("entry?.screen||")) {
    throw new Error('self-test failed: cutover retained legacy inline back-target resolution');
  }
  for (const [label, broken] of [
    ['missing', cutoverInput.replace(SCREEN_NAVIGATION_BACK_CUTOVER.backBefore, 'function navigateBack(){}')],
    ['duplicate', `${cutoverInput}\n${SCREEN_NAVIGATION_BACK_CUTOVER.fallbackBefore}`],
  ]) {
    let failedClosed = false;
    try {
      prepareScreenNavigationBackCutover(broken);
    } catch {
      failedClosed = true;
    }
    if (!failedClosed) throw new Error(`self-test failed: cutover did not fail closed on ${label} preimage`);
  }

  console.log('SELF_TEST_PASS');
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const prepareBackCutover = args.includes('--prepare-screen-navigation-back-cutover');
const target = args.find((arg) => !arg.startsWith('--')) ?? 'browser/GAMEROAD.html';

if (selfTest) await runSelfTest();

if (prepareBackCutover) {
  const html = await readFile(target, 'utf8');
  const next = prepareScreenNavigationBackCutover(html);
  await writeFile(target, next, 'utf8');
  console.log(`SCREEN_NAVIGATION_BACK_CUTOVER_PREPARED target=${target}`);
  process.exit(0);
}

const html = await readFile(target, 'utf8');
const errors = await validateHtml(html);
if (errors.length > 0) {
  console.error(`BROWSER_STATIC_CHECK_FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const scriptCount = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].length;
console.log(`BROWSER_STATIC_CHECK_PASS target=${target} scriptBlocks=${scriptCount}`);
