from pathlib import Path

HTML_PATH = Path('browser/GAMEROAD.html')
BUILD_PATH = Path('deploy/cloudflare/scripts/build.mjs')
TEST_PATH = Path('tests/battle-controlled-character-html-handoff.test.mjs')

html = HTML_PATH.read_text(encoding='utf-8')
build = BUILD_PATH.read_text(encoding='utf-8')

if '__GAMEROAD_CONTROLLED_CHARACTER_4P_SOURCE__' in html:
    raise SystemExit('R8 source bridge already present; refusing duplicate patch')
if 'gameroad-controlled-character-4p-live-r8' in html:
    raise SystemExit('R8 module already present; refusing duplicate patch')
if 'battle-board-naki-4p-visual-binding.mjs' in html:
    raise SystemExit('4P board binding already imported in HTML; inspect before patching')

classic_anchor = 'function movementFacing(fromId,toId,p){'
if html.count(classic_anchor) != 1:
    raise SystemExit(f'unexpected movementFacing anchor count: {html.count(classic_anchor)}')

classic_bridge = r'''const grControlledCharacter4pLiveState={warningShown:false};
function grControlledCharacter4pSource(){const m=state.match;if(!m||!Array.isArray(m.players)||m.players.length!==4)return null;const participants=m.players.map(p=>({participantId:p.id,characterId:String(p.character||''),positionKey:p.position}));if(participants.some(row=>!row.participantId||!row.characterId))return null;return{matchId:String(m.id||''),participants,reducedMotion:!!state.settings.reduceMotion,lowPerformance:!!state.settings.lowPerf}}
window.__GAMEROAD_CONTROLLED_CHARACTER_4P_SOURCE__=grControlledCharacter4pSource;
function grControlledCharacter4pEvent(p,type,detail={}){const emit=window.__GAMEROAD_CONTROLLED_CHARACTER_4P_EVENT__;if(typeof emit!=='function')return null;try{return emit(p?.id,{type,...detail})}catch(e){if(!grControlledCharacter4pLiveState.warningShown){grControlledCharacter4pLiveState.warningShown=true;console.warn('controlled-character-4p-live-event',e)}return null}}
'''
html = html.replace(classic_anchor, classic_bridge + classic_anchor, 1)

start = html.find('async function animateResolvedPath(p){')
end_anchor = '\nfunction setupBattleDetails()'
end = html.find(end_anchor, start)
if start < 0 or end < 0:
    raise SystemExit('animateResolvedPath seam not found')
old_animate = html[start:end]
for required in [
    "const path=p.plan?.path||[p.position]",
    "p.position=to",
    "if(human)",
    "renderField3D();renderBoard();await updateBattleAvatar()",
    "if(dur)await new Promise(r=>setTimeout(r,dur))",
]:
    if required not in old_animate:
        raise SystemExit(f'animateResolvedPath precondition missing: {required}')

new_animate = r'''async function animateResolvedPath(p){const path=p.plan?.path||[p.position],human=p.human,dur=(state.settings.reduceMotion||state.settings.lowPerf)?0:145;if(path.length<2){p.position=path.at(-1)||p.position;collectEndpointHoney(p);grControlledCharacter4pEvent(p,'SETTLE',{positionKey:p.position});if(human)await setBattleRuntimeState('idle');else{renderField3D();renderBoard()}return}let facing=battleMount?.facingName||'right';if(human){facing=movementFacing(path[0],path[1],p);await setBattleRuntimeState('move',facing)}for(let i=1;i<path.length;i++){const from=path[i-1],to=path[i],nextFacing=movementFacing(from,to,p);p.position=to;if(human&&nextFacing!==facing)await setBattleRuntimeState('move',nextFacing);facing=nextFacing;grControlledCharacter4pEvent(p,'MOVE_ACCEPTED',{toPositionKey:to,facing});renderField3D();renderBoard();if(human)await updateBattleAvatar();if(dur)await new Promise(r=>setTimeout(r,dur))}collectEndpointHoney(p);grControlledCharacter4pEvent(p,'SETTLE',{positionKey:p.position});if(human)await setBattleRuntimeState('idle',facing);else{renderField3D();renderBoard()}}'''
html = html[:start] + new_animate + html[end:]

module_anchor = '<script type="module" src="./profile-presentation-runtime-mount.mjs"></script>'
if html.count(module_anchor) != 1:
    raise SystemExit(f'unexpected profile module anchor count: {html.count(module_anchor)}')

live_module = r'''<style id="gameroad-controlled-character-4p-live-r8-style">
/* Preserve current Battle chrome and P1's existing continuous #battleRuntime while projecting P2-P4 on authoritative board markers. */
html body:has(.battle.active) .top{display:flex!important}
#boardPlayers .boardPlayerToken.human [data-board-controlled-character]{display:none!important}
</style>
<script type="module" id="gameroad-controlled-character-4p-live-r8">
import {
  createFourParticipantControlledCharacterMotionState,
  applyFourParticipantControlledCharacterEvent,
  projectFourParticipantControlledCharacterMotion,
} from './battle-controlled-character-4p-motion-director.mjs';
import './battle-board-naki-4p-visual-binding.mjs';

let directorState = null;
let activeMatchId = null;
let revision = 0;

function readSource() {
  const reader = globalThis.__GAMEROAD_CONTROLLED_CHARACTER_4P_SOURCE__;
  if (typeof reader !== 'function') return null;
  const source = reader();
  if (!source || !Array.isArray(source.participants) || source.participants.length !== 4) return null;
  return source;
}

function resetDirector(source) {
  directorState = createFourParticipantControlledCharacterMotionState({ participants: source.participants });
  activeMatchId = source.matchId;
  revision = 0;
}

function ensureDirector(source) {
  if (!source) {
    directorState = null;
    activeMatchId = null;
    revision = 0;
    return false;
  }
  const identityChanged = directorState && source.participants.some((row) => (
    directorState.stateByParticipant?.[row.participantId]?.characterId !== row.characterId
  ));
  if (!directorState || activeMatchId !== source.matchId || identityChanged) resetDirector(source);
  return true;
}

function projectCurrent() {
  const source = readSource();
  if (!ensureDirector(source)) return null;
  for (const row of source.participants) {
    const current = directorState.stateByParticipant?.[row.participantId];
    if (current && current.positionKey !== row.positionKey) {
      revision += 1;
      const reconciled = applyFourParticipantControlledCharacterEvent(directorState, row.participantId, {
        type: 'RECONNECT',
        revision,
        controlGeneration: 0,
        positionKey: row.positionKey,
      });
      directorState = reconciled.state;
    }
  }
  return projectFourParticipantControlledCharacterMotion(directorState, {
    reducedMotion: source.reducedMotion,
    lowPerformance: source.lowPerformance,
  });
}

function syncVisuals() {
  const projection = projectCurrent();
  const binding = globalThis.__GAMEROAD_CONTROLLED_CHARACTER_4P_BOARD_VISUAL_BINDING__;
  if (binding && typeof binding.applyProjection === 'function') binding.applyProjection(projection);
  return projection;
}

globalThis.__GAMEROAD_CONTROLLED_CHARACTER_4P_PROJECTION__ = projectCurrent;
globalThis.__GAMEROAD_CONTROLLED_CHARACTER_4P_EVENT__ = (participantId, event = {}) => {
  const source = readSource();
  if (!ensureDirector(source) || !directorState.stateByParticipant?.[participantId]) {
    return Object.freeze({ accepted: false, reason: 'FOUR_PARTICIPANT_SOURCE_UNAVAILABLE' });
  }
  revision += 1;
  const result = applyFourParticipantControlledCharacterEvent(directorState, participantId, {
    ...event,
    revision,
    controlGeneration: 0,
  });
  directorState = result.state;
  syncVisuals();
  return result;
};
globalThis.__GAMEROAD_CONTROLLED_CHARACTER_4P_SYNC__ = syncVisuals;
queueMicrotask(syncVisuals);
</script>
'''
html = html.replace(module_anchor, live_module + module_anchor, 1)

# Build must ship both existing motion modules now imported by the live HTML module.
build_lines = build.splitlines()
if "browser/battle-controlled-character-4p-motion-director.mjs" not in build:
    binding_index = next((i for i, line in enumerate(build_lines) if "source: 'browser/battle-board-naki-4p-visual-binding.mjs'" in line), None)
    if binding_index is None:
        raise SystemExit('build binding artifact seam not found')
    build_lines[binding_index + 1:binding_index + 1] = [
        "  { source: 'browser/battle-controlled-character-motion-core.mjs', output: 'battle-controlled-character-motion-core.mjs', artifact: 'battle_controlled_character_motion_core', label: 'Battle controlled character motion core' },",
        "  { source: 'browser/battle-controlled-character-4p-motion-director.mjs', output: 'battle-controlled-character-4p-motion-director.mjs', artifact: 'battle_controlled_character_4p_motion_director', label: 'Battle controlled character 4P motion director' },",
    ]
    build = '\n'.join(build_lines) + ('\n' if build.endswith('\n') else '')

# Postconditions before writing.
assert html.count('__GAMEROAD_CONTROLLED_CHARACTER_4P_SOURCE__') >= 2
assert html.count('battle-board-naki-4p-visual-binding.mjs') == 1
assert html.count('battle-controlled-character-4p-motion-director.mjs') == 1
assert "participantId:p.id,characterId:String(p.character||''),positionKey:p.position" in html
assert "grControlledCharacter4pEvent(p,'MOVE_ACCEPTED',{toPositionKey:to,facing});renderField3D();renderBoard();if(human)await updateBattleAvatar();if(dur)" in html
assert 'html body:has(.battle.active) .top{display:flex!important}' in html
assert '#boardPlayers .boardPlayerToken.human [data-board-controlled-character]{display:none!important}' in html
assert "browser/battle-controlled-character-motion-core.mjs" in build
assert "browser/battle-controlled-character-4p-motion-director.mjs" in build

HTML_PATH.write_text(html, encoding='utf-8')
BUILD_PATH.write_text(build, encoding='utf-8')

TEST_PATH.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createFourParticipantControlledCharacterMotionState,
  applyFourParticipantControlledCharacterEvent,
  projectFourParticipantControlledCharacterMotion,
} from '../browser/battle-controlled-character-4p-motion-director.mjs';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');
const build = await readFile(new URL('../deploy/cloudflare/scripts/build.mjs', import.meta.url), 'utf8');

test('live Battle derives controlled-character identity only from participant character authority', () => {
  const start = html.indexOf('function grControlledCharacter4pSource()');
  const end = html.indexOf('window.__GAMEROAD_CONTROLLED_CHARACTER_4P_SOURCE__', start);
  assert.ok(start >= 0 && end > start);
  const source = html.slice(start, end);
  assert.match(source, /participantId:p\.id,characterId:String\(p\.character\|\|''\),positionKey:p\.position/);
  assert.doesNotMatch(source, /selectedPartnerId|partner\.naki/);
  assert.match(source, /m\.players\.length!==4\)return null/);
});

test('accepted authoritative movement renders every participant step while keeping P1 runtime path', () => {
  const start = html.indexOf('async function animateResolvedPath(p){');
  const end = html.indexOf('\nfunction setupBattleDetails()', start);
  assert.ok(start >= 0 && end > start);
  const fn = html.slice(start, end);
  assert.match(fn, /p\.position=to/);
  assert.match(fn, /grControlledCharacter4pEvent\(p,'MOVE_ACCEPTED',\{toPositionKey:to,facing\}\);renderField3D\(\);renderBoard\(\);if\(human\)await updateBattleAvatar\(\);if\(dur\)/);
  assert.match(fn, /if\(human\)await setBattleRuntimeState\('idle',facing\)/);
  assert.ok(html.includes('id="battleRuntime"'));
});

test('live mount preserves existing Battle chrome and avoids duplicate P1 character surface', () => {
  assert.ok(html.includes('html body:has(.battle.active) .top{display:flex!important}'));
  assert.ok(html.includes('#boardPlayers .boardPlayerToken.human [data-board-controlled-character]{display:none!important}'));
  assert.ok(html.includes("from './battle-controlled-character-4p-motion-director.mjs'"));
  assert.ok(html.includes("import './battle-board-naki-4p-visual-binding.mjs'"));
});

test('Cloudflare build ships the reused motion director dependency chain', () => {
  assert.ok(build.includes("browser/battle-controlled-character-motion-core.mjs"));
  assert.ok(build.includes("browser/battle-controlled-character-4p-motion-director.mjs"));
  assert.ok(build.includes("browser/battle-board-naki-4p-visual-binding.mjs"));
});

test('existing four-participant director projects a CPU accepted movement without gameplay authority', () => {
  let state = createFourParticipantControlledCharacterMotionState({
    participants: ['P1','P2','P3','P4'].map((participantId) => ({ participantId, characterId: 'character.' + participantId, positionKey: 'C:0:0' })),
  });
  const moved = applyFourParticipantControlledCharacterEvent(state, 'P3', {
    type: 'MOVE_ACCEPTED', revision: 1, controlGeneration: 0, toPositionKey: 'C:0:1', facing: 'right',
  });
  assert.equal(moved.accepted, true);
  state = moved.state;
  const projection = projectFourParticipantControlledCharacterMotion(state);
  const p3 = projection.find((row) => row.participantId === 'P3');
  assert.equal(p3.positionKey, 'C:0:1');
  assert.equal(p3.motion.phase, 'moving');
  assert.equal(p3.motion.gameplayAuthority, false);
});
''', encoding='utf-8')

print('R8 patched:', HTML_PATH, BUILD_PATH, TEST_PATH)
