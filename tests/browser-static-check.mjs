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
  if (html.includes('PLAN_ACCEPTED')) errors.push('legacy post-card PLAN_ACCEPTED confirmation is present');
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
    [/\.battle\.dedicatedBattlePhase\s+\.battlePhaseSurface\{[^}]*pointer-events:none!important[^}]*background:transparent!important[^}]*\}/i, 'dedicated battle phase surface is not presentation-only'],
    [/\.battle\.dedicatedBattlePhase\s+\.battlePhaseBackdrop\{[^}]*display:none!important[^}]*\}/i, 'dedicated battle phase backdrop is still taking over the board'],
    [/\.battle\.dedicatedBattlePhase\s+\.battlePhaseResolutionSlot\s+\.battleResolution\{[^}]*pointer-events:auto!important[^}]*\}/i, 'dedicated battle resolution controls are not interactive'],
    [/new\s+MutationObserver\(syncShell\)/, 'dedicated battle phase is not observing public battle-resolution DOM'],
    [/GameRoadThreeCharRuntime/, 'Naki cut-in is not using the public character runtime'],
    [/characterId\s*:\s*["']partner\.naki["']/, 'Naki character is not wired to dedicated battle phase'],
    [/state\s*:\s*["']dot_break_entry["']/, 'Naki dot_break_entry state is not wired to dedicated battle phase'],
    [/__GAMEROAD_BATTLE_PHASE_R2__/, 'missing dedicated battle phase runtime probe'],
  ];
  for (const [pattern, message] of dedicatedBattleContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/\.battle\.dedicatedBattlePhase\s+\.battleMap[^\{]*\{[^\}]*visibility\s*:\s*hidden\s*!important/i.test(html)) {
    errors.push('battle board remains hidden during dedicated battle phase');
  }

  const cameraReturnIds = html.match(/id=["']cameraReturnBtn["']/g) ?? [];
if (cameraReturnIds.length !== 1) errors.push(`camera return control count is ${cameraReturnIds.length}, expected 1`);
const battleRailMatch = html.match(/<div class=["']battleRail["']>([\s\S]*?)<\/div>/i);
if (battleRailMatch?.[1]?.includes('cameraReturnBtn')) errors.push('camera return control is inside persistent battle rail');
if (!/<button[^>]*class=["']cameraReturnControl["'][^>]*id=["']cameraReturnBtn["'][^>]*hidden[^>]*aria-hidden=["']true["'][^>]*tabindex=["']-1["']/i.test(html)) {
  errors.push('camera return control is not default-hidden/non-focusable outside the rail');
}
if (!/#cameraReturnBtn\[hidden\]\{display:none!important\}/.test(html)) errors.push('camera return hidden state does not guarantee zero footprint');
if ((html.match(/cameraState\.mode==='MANUAL_INSPECT';returnControl\.hidden=!manual/g) ?? []).length < 2) errors.push('camera return visibility is not bound to MANUAL_INSPECT at both camera projection points');
if (!/__GAMEROAD_BATTLE_CAMERA_FIELD_ADAPTER__/.test(html) || !/mountBattleCameraLiveRuntime/.test(html)) errors.push('camera live adapter/runtime mount is missing');
if (!/authority:\{gameplay:false,movement:false,target:false,legality:false,stateWrite:false\}/.test(html)) errors.push('camera field adapter lost gameplay-write firewall');
  if (!/#battleMap\[data-camera-mode=["']MANUAL_INSPECT["']\] \.battleRail\{opacity:0;pointer-events:none!important;visibility:hidden\}/.test(html)) errors.push('battle rail does not yield visual and input ownership during manual camera inspect');
  const otherThreeHudStart = html.indexOf('function hudPublicPeers(m)');
  const otherThreeHudEnd = html.indexOf('function hudRenderTelemetryDrawer', otherThreeHudStart);
  const otherThreeHudBlock = otherThreeHudStart >= 0 && otherThreeHudEnd > otherThreeHudStart
    ? html.slice(otherThreeHudStart, otherThreeHudEnd)
    : '';
  if (!/function hudPublicPeers\(m\)\{const viewers=m\?\.players\?\.filter\(p=>p\.human===true\)\?\?\[\];if\(viewers\.length!==1\)return\[\];const viewerId=viewers\[0\]\.id;return m\.players\.filter\(p=>p\.id!==viewerId\)\}/.test(html)) {
    errors.push('public peer HUD is not viewer-relative/fail-closed');
  }
  if (!/const peers=hudPublicPeers\(m\);root\.innerHTML='';\s*peers\.forEach\(p=>/.test(otherThreeHudBlock)) {
    errors.push('public player chips are not rendered from viewer-relative peers');
  }
  if (!/royalRoot\.replaceChildren\(\);peers\.forEach\(p=>/.test(otherThreeHudBlock)) {
    errors.push('public royal strip is not rendered from the same viewer-relative peers');
  }
  if (otherThreeHudBlock.includes("p.human?' you'")) {
    errors.push('viewer self peer-role marker remains in other-player HUD renderer');
  }
  const renderPlayersStart = html.indexOf('function renderPlayers(){');
  const renderPlayersEnd = html.indexOf('function resolutionOriginLabel', renderPlayersStart);
  const renderPlayersBlock = renderPlayersStart >= 0 && renderPlayersEnd > renderPlayersStart
    ? html.slice(renderPlayersStart, renderPlayersEnd)
    : '';
  if (!renderPlayersBlock.includes("${p.human?`<div>手札 ${p.hand.length} / 山札 ${p.deck.length} / チップ ${p.chip.length}</div>`:''}")) {
    errors.push('Battle detail drawer does not fail closed on opponent hand/deck/chip counts');
  }
  if (!/id=["']publicTurnHud["'][^>]*aria-label=["']他プレイヤーの公開状態["']/.test(html)) {
    errors.push('public peer HUD lacks viewer-relative Japanese accessibility label');
  }
  if (!/id=["']royalUsageStrip["'][^>]*aria-label=["']他プレイヤーのロイヤルカード使用数["']/.test(html)) {
    errors.push('public royal peer strip lacks viewer-relative Japanese accessibility label');
  }
  if (!/<style id=["']gameroad-other3-public-hud-r1["']>[\s\S]*?\.battle \.publicTurnHud\{left:auto!important;right:8px!important;top:76px!important;/.test(html)) {
    errors.push('other-player public HUD is not anchored at the right-top presentation zone');
  }
  if (!/peers:\(\)=>state\.match\?hudPublicPeers\(state\.match\)\.map\(p=>p\.id\):\[\]/.test(html)) {
    errors.push('public HUD QA probe does not expose viewer-relative peer ids');
  }
  errors.push(...collectHomeVisualShellErrors(html));
  const centralWorldLiveContracts = [
    [/id=["']battleCentralWorldLiveHost["'][^>]*class=["']battleCentralWorldLiveHost["'][^>]*aria-label=["']フラノラ盤面の進行表示["']/, 'central Flanora live presentation host is missing'],
    [/BATTLE_CENTRAL_WORLD_LIVE_MOUNT_R8/, 'central Flanora live mount marker is missing'],
    [/import\(["']\.\/battle-new-base-board-live-presentation-composer\.mjs["']\)/, 'existing central board presentation composer is not live-mounted'],
    [/function battleCentralWorldStraightSnapshotR8\(m\)[\s\S]*?for\(const id of BATTLE_CENTRAL_WORLD_LAYOUT_R8\.participantIds\)[\s\S]*?for\(const lane of \['L','C','R'\]\)/, 'central world live mount does not preserve exact P1..P4 x L/C/R authoritative lane order'],
    [/syncBattleCentralWorldPresentation\(m\);renderBoardPlayers\(\);renderRouteLine\(\)/, 'legacy renderBoard cadence does not sync the existing central world presentation'],
    [/authority:Object\.freeze\(\{gameplay:false,movement:false,target:false,legality:false,result:false,stateWrite:false\}\)/, 'central world live mount lost its gameplay authority firewall'],
    [/\.battleCentralWorldLiveHost\{position:absolute;inset:3% 3% 18%;pointer-events:none;/, 'central world presentation host can take Battle input ownership'],
    [/BATTLE_BOARD_WORLD_FIELD_LIVE_HTML_R19/, 'live Battle field does not declare the R19 world-field handoff'],
    [/battleCentralWorldRuntimeR8\?\.worldFieldRenderModel\?\.\(/, 'live renderField3D does not consume the existing world-field renderer model'],
    [/requestAnimationFrame\(\(\)=>\{if\(state\.match\)renderField3D\(\)\}\)/, 'central world mount does not request a field redraw after the world-field model becomes available'],
    [/liveGoalLabel\.textContent=['\"]GOAL['\"]/, 'shared GOAL has no player-visible label in the live Battle field'],
    [/#battleMap\[data-central-world-live=['\"]1['\"]\] #board \.node:not\(\.reachable\):not\(\.path\):not\(\.currentPosition\):not\(\.nextStep\)/, 'legacy future board scaffolding is still player-visible after the central world mount'],
  ];
  for (const [pattern, message] of centralWorldLiveContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if ((html.match(/id=["']battleCentralWorldLiveHost["']/g) ?? []).length !== 1) {
    errors.push('central Flanora live presentation host is duplicated');
  }
  if ((html.match(/mountBattleNewBaseBoardLivePresentation\s*\(/g) ?? []).length !== 1) {
    errors.push('central world live composer has more than one mount call');
  }
  if (/createFlanoraMapLayout\s*\(/.test(html) || /createNewBaseGoalPathLayout\s*\(/.test(html)) {
    errors.push('HTML reimplements central board/GOAL projection instead of consuming the existing composer');
  }
  if (/visualGraphWorld\s*\(/.test(html)) errors.push('HTML uses the retired duplicate visual-graph projection instead of worldFieldRenderModel');
  const correctedBattleResourceContracts = [
    [/const hand=deck\.splice\(0,7\);/, 'fresh Battle ordinary hand is not initialized to seven'],
    [/function refill\(p\)\{while\(p\.hand\.length<3&&p\.deck\.length\)p\.hand\.push\(p\.deck\.shift\(\)\)\}/, 'post-use refill target is no longer three'],
    [/manaCurrent:7,manaMax:10,honey:0,chip:/, 'numeric Mana 7/10 and player-owned Honey balance are not initialized'],
    [/function currentPlacementRanks\(m=state\.match\)/, 'current placement ranking was not made reusable for round income'],
    [/position:p\.position,manaCurrent:Number\(p\.manaCurrent\)\|\|0,manaMax:Number\(p\.manaMax\)\|\|10,honey:Number\(p\.honey\)\|\|0,chip:/, 'friend projection drops numeric Mana or player-owned Honey'],
    [/function awakeManaFromHoney\(/, 'Honey Hunt node-Honey Mana wake authority was removed'],
  ];
  for (const [pattern, message] of correctedBattleResourceContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/recoverRoundStartManaByPlacement/.test(html) || /位のためマナ回復\+/.test(html)) {
    errors.push('superseded rank-based turn-start Mana recovery remains');
  }
  if (/function awardRoundStartHoney\(/.test(html)) errors.push('legacy round-start Honey income remains');
  if (/function takeManaByPower\(/.test(html) || /\.mana\?*\.length/.test(html) || /Array\.isArray\(me\?*\.mana\)/.test(html)) {
  errors.push('physical Mana card zone or length-derived Mana remains');
}
if (/デッキから置いたトランプカード|show-all-seven-real-mana-slots/.test(html)) {
  errors.push('physical Mana card identity remains player-facing');
}
  if (/p\.awake\s*=\s*Math\.min\(\s*p\.mana\.length\s*,\s*p\.awake\s*\+\s*1\s*\)/.test(html)) {
    errors.push('legacy generic no-effect-road Mana +1 wake remains');
  }

  const resultRankPresentationContracts = [
    [/import\(['"]\.\/result-presentation-core\.mjs['"]\)/, 'Result rank presentation core is not mounted in live Result'],
    [/projectResultRankPresentation\(me\?\.rank\)/, 'human Result rank does not project authoritative formal rank'],
    [/d\.dataset\.formalRank=String\(presentation\.formalRank\)/, 'Result ranking rows do not mirror projected formal rank'],
    [/d\.dataset\.rankColorRole=presentation\.rankColorRole/, 'Result ranking rows do not project rank color role'],
    [/class=\"resultOutcome\"/, 'Result ranking rows do not expose corrected outcome label'],
  ];
  for (const [pattern, message] of resultRankPresentationContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/d\.innerHTML=`<b>\$\{x\.rank\}位 /.test(html)) {
    errors.push('legacy visible per-row numeric rank wording remains in live Result');
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
