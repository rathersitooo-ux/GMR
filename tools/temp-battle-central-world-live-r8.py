from pathlib import Path
import subprocess

html_path = Path('browser/GAMEROAD.html')
test_path = Path('tests/browser-static-check.mjs')
html = html_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')
marker = 'BATTLE_CENTRAL_WORLD_LIVE_MOUNT_R8'

if marker in html:
    raise SystemExit('R8 marker already present; refuse duplicate mount')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)

# 1) Presentation host lives above terrain canvas and below existing route/input layers.
markup_anchor = '<canvas id="fieldCanvas" aria-hidden="true"></canvas><svg id="routeSvg" class="routeSvg"'
markup_replacement = '<canvas id="fieldCanvas" aria-hidden="true"></canvas><div id="battleCentralWorldLiveHost" class="battleCentralWorldLiveHost" aria-label="フラノラ盤面の進行表示"></div><svg id="routeSvg" class="routeSvg"'
html = replace_once(html, markup_anchor, markup_replacement, 'battle host anchor')

# 2) Match the existing board footprint; never take pointer ownership.
css_anchor = '.battleMap:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 64px),repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 64px)}.board{position:absolute;inset:3% 3% 18%}'
css_replacement = '.battleMap:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 64px),repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 64px)}.battleCentralWorldLiveHost{position:absolute;inset:3% 3% 18%;pointer-events:none;min-width:0;min-height:0;overflow:hidden}.board{position:absolute;inset:3% 3% 18%}'
html = replace_once(html, css_anchor, css_replacement, 'battle host css anchor')

responsive_anchor = '@media(max-width:900px){.battleMap{top:48px;width:auto}.board{inset:0}'
responsive_replacement = '@media(max-width:900px){.battleMap{top:48px;width:auto}.battleCentralWorldLiveHost,.board{inset:0}'
html = replace_once(html, responsive_anchor, responsive_replacement, 'battle host responsive anchor')

# 3) Existing composer only. Exact P1..P4 x L/C/R arrays are caller-authoritative.
helper_anchor = 'function renderBoard(){'
helper = r'''/* BATTLE_CENTRAL_WORLD_LIVE_MOUNT_R8: one presentation mount; legacy renderBoard keeps all gameplay/input authority. */
const BATTLE_CENTRAL_WORLD_LAYOUT_R8=Object.freeze({participantIds:Object.freeze(['P1','P2','P3','P4']),horizontalCellCount:12,shieldLinkedLaneColumnsByParticipant:Object.freeze({P1:Object.freeze([0,1,2]),P2:Object.freeze([3,4,5]),P3:Object.freeze([6,7,8]),P4:Object.freeze([9,10,11])})});
const BATTLE_CENTRAL_WORLD_COLORS_R8=Object.freeze({P1:'#943746',P2:'#285b91',P3:'#a98520',P4:'#287253'});
let battleCentralWorldRuntimeR8=null,battleCentralWorldMountPromiseR8=null;
function battleCentralWorldStraightSnapshotR8(m){if(!m||!Array.isArray(m.players)||m.players.length!==4)return null;const byId=new Map(m.players.map(p=>[p?.id,p]));const out=[];for(const id of BATTLE_CENTRAL_WORLD_LAYOUT_R8.participantIds){const p=byId.get(id);if(!p?.lanes)return null;for(const lane of ['L','C','R']){const cards=p.lanes[lane];if(!Array.isArray(cards))return null;out.push([...cards])}}return out.length===12?out:null}
function syncBattleCentralWorldPresentation(m){const host=$('#battleCentralWorldLiveHost'),snapshot=battleCentralWorldStraightSnapshotR8(m);if(!host||!snapshot)return false;if(battleCentralWorldRuntimeR8?.mounted){const synced=battleCentralWorldRuntimeR8.syncAuthoritativeSnapshot({straightCardIdsByColumn:snapshot,participantColors:BATTLE_CENTRAL_WORLD_COLORS_R8});if(synced?.ok!==true)console.warn('battle-central-world-sync',synced?.reason||'failed');return synced?.ok===true}if(battleCentralWorldMountPromiseR8)return false;battleCentralWorldMountPromiseR8=import('./battle-new-base-board-live-presentation-composer.mjs').then(mod=>{const current=battleCentralWorldStraightSnapshotR8(state.match);if(!host.isConnected||!current||typeof mod?.mountBattleNewBaseBoardLivePresentation!=='function')return false;const runtime=mod.mountBattleNewBaseBoardLivePresentation({host,layoutInput:BATTLE_CENTRAL_WORLD_LAYOUT_R8,straightCardIdsByColumn:current,participantColors:BATTLE_CENTRAL_WORLD_COLORS_R8,reducedMotion:state.settings.reduceMotion===true,lowPerf:state.settings.lowPerf===true});if(!runtime?.mounted){console.warn('battle-central-world-mount',runtime?.reason||'failed');return false}battleCentralWorldRuntimeR8=runtime;$('#battleMap')?.setAttribute('data-central-world-live','1');globalThis.__GAMEROAD_BATTLE_CENTRAL_WORLD_LIVE__=Object.freeze({schema:'gameroad.battle-central-world-live-r8.v1',snapshot:()=>battleCentralWorldRuntimeR8?.snapshot?.()??null,authority:Object.freeze({gameplay:false,movement:false,target:false,legality:false,result:false,stateWrite:false})});return true}).catch(error=>{console.warn('battle-central-world-import',error);return false}).finally(()=>{battleCentralWorldMountPromiseR8=null});return false}
'''
html = replace_once(html, helper_anchor, helper + helper_anchor, 'renderBoard helper anchor')

tail_anchor = 'board.appendChild(e)});renderBoardPlayers();renderRouteLine()}'
tail_replacement = 'board.appendChild(e)});syncBattleCentralWorldPresentation(m);renderBoardPlayers();renderRouteLine()}'
html = replace_once(html, tail_anchor, tail_replacement, 'renderBoard sync anchor')

# 4) Extend the existing static gate with bounded relation/authority assertions.
static_anchor = '  const correctedBattleResourceContracts = ['
static_block = r'''  const centralWorldLiveContracts = [
    [/id=["']battleCentralWorldLiveHost["'][^>]*class=["']battleCentralWorldLiveHost["'][^>]*aria-label=["']フラノラ盤面の進行表示["']/, 'central Flanora live presentation host is missing'],
    [/BATTLE_CENTRAL_WORLD_LIVE_MOUNT_R8/, 'central Flanora live mount marker is missing'],
    [/import\(["']\.\/battle-new-base-board-live-presentation-composer\.mjs["']\)/, 'existing central board presentation composer is not live-mounted'],
    [/function battleCentralWorldStraightSnapshotR8\(m\)[\s\S]*?for\(const id of BATTLE_CENTRAL_WORLD_LAYOUT_R8\.participantIds\)[\s\S]*?for\(const lane of \['L','C','R'\]\)/, 'central world live mount does not preserve exact P1..P4 x L/C/R authoritative lane order'],
    [/syncBattleCentralWorldPresentation\(m\);renderBoardPlayers\(\);renderRouteLine\(\)/, 'legacy renderBoard cadence does not sync the existing central world presentation'],
    [/authority:Object\.freeze\(\{gameplay:false,movement:false,target:false,legality:false,result:false,stateWrite:false\}\)/, 'central world live mount lost its gameplay authority firewall'],
    [/\.battleCentralWorldLiveHost\{position:absolute;inset:3% 3% 18%;pointer-events:none;/, 'central world presentation host can take Battle input ownership'],
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
'''
test = replace_once(test, static_anchor, static_block + static_anchor, 'browser static check anchor')

html_path.write_text(html, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')

# Fail closed if anything outside the two durable product/test files changed by this writer.
proc = subprocess.run(['git','diff','--check'], text=True, capture_output=True)
print(proc.stdout, end='')
print(proc.stderr, end='')
if proc.returncode:
    raise SystemExit(proc.returncode)

print('R8_PATCH_OK')
print('HTML_MARKER_COUNT', html.count(marker))
print('HOST_COUNT', html.count('id="battleCentralWorldLiveHost"'))
print('COMPOSER_IMPORT_COUNT', html.count("import('./battle-new-base-board-live-presentation-composer.mjs')"))
print('SYNC_CALL_COUNT', html.count('syncBattleCentralWorldPresentation(m);renderBoardPlayers();renderRouteLine()'))
