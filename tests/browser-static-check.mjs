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

function collectHomeVisualShellErrors(html) {
  if (!/\bdata-codex-home-source\s*=/i.test(html)) return [];

  const errors = [];
  const homeStart = html.indexOf('<section class="screen home codexHome active"');
  const cardsStart = html.indexOf('<section class="screen cards"', homeStart);
  if (homeStart < 0 || cardsStart <= homeStart) {
    return ['unable to resolve current Home visual-shell boundary'];
  }

  const home = html.slice(homeStart, cardsStart);
  for (const forbidden of ['HOME VISUAL', 'GAMEROAD のホーム', 'ホームから各機能へ移動できます']) {
    if (home.includes(forbidden)) errors.push(`decorative Home copy is present: ${forbidden}`);
  }
  if (!/\.app:has\(\.home\.active\)>\.top \.brand\{display:none\}/.test(html)) {
    errors.push('decorative GAMEROAD brand is not hidden while Home is active');
  }
  for (const target of ['setup', 'characters', 'cards', 'shop']) {
    if (!new RegExp(`data-home-target=["']${target}["']`).test(home)) {
      errors.push(`Home primary navigation target is missing: ${target}`);
    }
  }
  for (const target of ['missions', 'gacha', 'records', 'profile', 'settings']) {
    if (!new RegExp(`data-go=["']${target}["']`).test(home)) {
      errors.push(`Home utility navigation target is missing: ${target}`);
    }
  }
  return errors;
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
      /import\s*\{[^}]*\bresolveScreenNavigation\b[^}]*\bcreateScreenTransitionRuntimeAdapter\b[^}]*\}\s*from\s*["']\.\/screen-navigation-core\.mjs["']\s*;/,
      'screen navigation core is not production-mounted',
    ],
    [/globalThis\.GAMEROAD_SCREEN_NAVIGATION/, 'screen navigation bridge is missing'],
    [
      /currentScreenTransitionRuntime\(\)\.navigate\(target\s*,\s*\{\s*reason\s*:\s*["']detail["']\s*\}\s*\)/,
      'navigateDetail does not delegate navigation through the transition runtime',
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

  errors.push(...collectHomeVisualShellErrors(html));
  const correctedBattleResourceContracts = [
    [/const hand=deck\.splice\(0,7\);/, 'fresh Battle ordinary hand is not initialized to seven'],
    [/function refill\(p\)\{while\(p\.hand\.length<3&&p\.deck\.length\)p\.hand\.push\(p\.deck\.shift\(\)\)\}/, 'post-use refill target is no longer three'],
    [/mana,awake:0,honey:0,chip:/, 'player-owned Honey balance is not initialized'],
    [/function currentPlacementRanks\(m=state\.match\)/, 'current placement ranking was not made reusable for round income'],
    [/function awardRoundStartHoney\(m\)/, 'round-start Honey income is not mounted'],
    [/grBattleReplayBegin\(state\.match\);awardRoundStartHoney\(state\.match\);initRoundRuntime\(state\.match\)/, 'round one does not award current-rank Honey before play'],
    [/m\.players\.forEach\(p=>p\.plan=null\);awardRoundStartHoney\(m\);initRoundRuntime\(m\)/, 'later rounds do not award current-rank Honey'],
    [/position:p\.position,awake:Number\(p\.awake\)\|\|0,honey:Number\(p\.honey\)\|\|0,mana:/, 'friend projection drops player-owned Honey'],
    [/function awakeManaFromHoney\(/, 'Honey Hunt node-Honey Mana wake authority was removed'],
  ];
  for (const [pattern, message] of correctedBattleResourceContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/p\.awake\s*=\s*Math\.min\(\s*p\.mana\.length\s*,\s*p\.awake\s*\+\s*1\s*\)/.test(html)) {
    errors.push('legacy generic no-effect-road Mana +1 wake remains');
  }

  const saasunaForbiddenLossTokens = [
    'attack_lose:',
    'attack_lose_royal_nonlethal:',
    'attack_lose_no_enemy_max_progress:',
    'attack_lose_disadvantage:',
    'defend_lose_nonlethal:',
  ];
  for (const token of saasunaForbiddenLossTokens) {
    if (html.includes(token)) errors.push(`embedded Saasuna defeat/loss reaction remains: ${token}`);
  }
  if (!/function saasunaBattleReaction\(\)\{[^}]*if\(!mine\)return null;if\(attacking\)return'attack_win';if\(defending\)return'defend_win';return null\}/.test(html)) {
    errors.push('embedded Saasuna battle reaction is not fail-closed for non-winning outcomes');
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

  const brokenHomeShell = '<section class="screen home codexHome active" data-codex-home-source="self-test"><div>HOME VISUAL</div><button class="codexBattleCta" data-go="setup"></button></section><section class="screen cards"></section>';
  const brokenHomeShellResult = collectHomeVisualShellErrors(brokenHomeShell);
  if (!brokenHomeShellResult.includes('decorative Home copy is present: HOME VISUAL')) {
    throw new Error('self-test failed: checker did not detect decorative Home copy');
  }

  console.log('SELF_TEST_PASS');
}

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');
const target = args.find((arg) => arg !== '--self-test') ?? 'browser/GAMEROAD.html';

if (selfTest) await runSelfTest();

const html = await readFile(target, 'utf8');
const errors = await validateHtml(html);
if (errors.length > 0) {
  console.error(`BROWSER_STATIC_CHECK_FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const scriptCount = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi)].length;
console.log(`BROWSER_STATIC_CHECK_PASS target=${target} scriptBlocks=${scriptCount}`);
