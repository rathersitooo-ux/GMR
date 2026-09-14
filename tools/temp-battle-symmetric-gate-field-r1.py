from pathlib import Path

HTML_PATH = Path('browser/GAMEROAD.html')
TEST_PATH = Path('tests/browser-static-check.mjs')
html = HTML_PATH.read_text(encoding='utf-8')
test = TEST_PATH.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)


def replace_between(text, start, end, replacement, label):
    i = text.find(start)
    if i < 0:
        raise SystemExit(f'{label}: start anchor missing')
    j = text.find(end, i + len(start))
    if j < 0:
        raise SystemExit(f'{label}: end anchor missing')
    if text.find(start, i + len(start)) >= 0 and text.find(start, i + len(start)) < j:
        raise SystemExit(f'{label}: nested/duplicate start anchor')
    return text[:i] + replacement + '\n' + text[j:]

# Setup: expose an additive field selector. Existing content/mode controls stay intact.
html = replace_once(
    html,
    '<div class="k">FORMAT</div><div class="modeRow"><button class="modeBtn on" data-mode="2p">二人</button>',
    '<div class="k">FIELD</div><div class="fieldRow" role="toolbar" aria-label="フィールド選択"><button class="fieldBtn on" data-field="FIELD-01">草原</button><button class="fieldBtn" data-field="FIELD-10">新フィールド</button></div><div class="k">FORMAT</div><div class="modeRow"><button class="modeBtn on" data-mode="2p">二人</button>',
    'setup field selector',
)
html = replace_once(
    html,
    '.contentRow{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
    '.fieldRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:7px}.fieldBtn{min-height:44px;border:1px solid var(--line);background:#0d2a22;font-weight:1000}.fieldBtn.on{border-color:var(--a);background:#17483b;box-shadow:0 0 0 1px rgba(160,239,213,.14) inset}.contentRow{display:grid;grid-template-columns:1fr 1fr;gap:7px}',
    'field selector style',
)

# Field identity is saveable but does not create a second Battle/rules engine.
html = replace_once(
    html,
    "const state={screen:'home'",
    "const BATTLE_FIELD_CURRENT_ID='FIELD-01';\nconst BATTLE_FIELD_SYMMETRIC_GATE_ID='FIELD-10';\nfunction normalizeBattleFieldId(value){return value===BATTLE_FIELD_SYMMETRIC_GATE_ID?BATTLE_FIELD_SYMMETRIC_GATE_ID:BATTLE_FIELD_CURRENT_ID}\nfunction currentBattleFieldId(){return normalizeBattleFieldId(state.match?.fieldId??state.setupField)}\nfunction symmetricFieldActive(){return currentBattleFieldId()===BATTLE_FIELD_SYMMETRIC_GATE_ID}\nconst state={screen:'home'",
    'field identity constants',
)
html = replace_once(
    html,
    "setupMode:'2p',setupContent:'road_shield',match:null",
    "setupMode:'2p',setupContent:'road_shield',setupField:BATTLE_FIELD_CURRENT_ID,match:null",
    'state setupField',
)
html = replace_once(
    html,
    "setupMode:state.setupMode,setupContent:state.setupContent,deck:",
    "setupMode:state.setupMode,setupContent:state.setupContent,setupField:normalizeBattleFieldId(state.setupField),deck:",
    'save setupField',
)
html = replace_once(
    html,
    "if(['2p','4p','2v2'].includes(d.setupMode))state.setupMode=d.setupMode;if(['road_shield','honey_hunt'].includes(d.setupContent))state.setupContent=d.setupContent;if((d.v===2||d.v===3)",
    "if(['2p','4p','2v2'].includes(d.setupMode))state.setupMode=d.setupMode;if(['road_shield','honey_hunt'].includes(d.setupContent))state.setupContent=d.setupContent;if([BATTLE_FIELD_CURRENT_ID,BATTLE_FIELD_SYMMETRIC_GATE_ID].includes(d.setupField))state.setupField=d.setupField;if((d.v===2||d.v===3)",
    'restore setupField',
)
html = replace_once(
    html,
    "state.setupMode='2p';state.setupContent='road_shield';state.selectedPartnerId=",
    "state.setupMode='2p';state.setupContent='road_shield';state.setupField=BATTLE_FIELD_CURRENT_ID;state.selectedPartnerId=",
    'reset setupField',
)
html = replace_once(
    html,
    "async function renderSetupShell(){const c=playerCharInfo();$('#setupGoalTitle')&&($('#setupGoalTitle').textContent='一列7枚');$$('.modeBtn').forEach(b=>{const on=b.dataset.mode===state.setupMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});$$('.contentBtn').forEach(b=>{const on=b.dataset.content===state.setupContent;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});setupMount=await mountChar('#setupRuntime',c.id,'idle')}",
    "async function renderSetupShell(){const c=playerCharInfo();$('#setupGoalTitle')&&($('#setupGoalTitle').textContent='一列7枚');$$('.modeBtn').forEach(b=>{const on=b.dataset.mode===state.setupMode;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});$$('.contentBtn').forEach(b=>{const on=b.dataset.content===state.setupContent;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});$$('.fieldBtn').forEach(b=>{const on=b.dataset.field===normalizeBattleFieldId(state.setupField);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});setupMount=await mountChar('#setupRuntime',c.id,'idle')}",
    'render field selector',
)
html = replace_once(
    html,
    "$$('.contentBtn').forEach(b=>b.addEventListener('click',()=>{state.setupContent=b.dataset.content;$$('.contentBtn').forEach(x=>x.classList.toggle('on',x===b));save();renderSetupShell()}));",
    "$$('.contentBtn').forEach(b=>b.addEventListener('click',()=>{state.setupContent=b.dataset.content;$$('.contentBtn').forEach(x=>x.classList.toggle('on',x===b));save();renderSetupShell()}));\n$$('.fieldBtn').forEach(b=>b.addEventListener('click',()=>{state.setupField=normalizeBattleFieldId(b.dataset.field);save();renderSetupShell()}));",
    'field selector input',
)

# Route SVG gets a non-interactive topology layer. Gate and GOAL visuals live here and never become nodes.
html = replace_once(
    html,
    '<g id="rangeSurfaceLayer"></g><polyline id="routeLine"></polyline>',
    '<g id="fieldTopologyLayer" aria-hidden="true"></g><g id="rangeSurfaceLayer"></g><polyline id="routeLine"></polyline>',
    'topology svg layer',
)
html = replace_once(
    html,
    '.routeSvg{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none}.rangeSurface{',
    '.routeSvg{position:absolute;inset:0;width:100%;height:100%;z-index:4;pointer-events:none}.fieldTopologyLine{fill:none;stroke:rgba(231,244,238,.56);stroke-width:1.35;vector-effect:non-scaling-stroke;stroke-linecap:round}.fieldProgressionSpine{stroke:rgba(231,244,238,.32);stroke-dasharray:2.2 2.8}.fieldGateBoundary{stroke:rgba(190,229,241,.9);stroke-width:1.8}.fieldGoalBand{stroke:rgba(255,235,154,.92);stroke-width:2}.fieldGoalMarker{fill:#fff6c4;stroke:#705c19;stroke-width:.8;vector-effect:non-scaling-stroke}.rangeSurface{',
    'topology svg styles',
)

# Accepted symmetric shared-field topology. Gate deliberately has NO node/cell/stop identity.
topology_block = r'''const SYMMETRIC_FIELD_NODE_IDS=Object.freeze([
  'F:U:0','F:U:1','F:U:2','F:U:3','F:U:4','F:U:5','F:U:6','F:U:7','F:U:8',
  'F:D:0','F:D:1','F:D:2','F:D:3','F:D:4','F:D:5','F:D:6','F:D:7','F:D:8',
  'F:L:0','F:L:1','F:L:2','F:L:3','F:R:0','F:R:1','F:R:2','F:R:3'
]);
const SYMMETRIC_FIELD_EDGES=Object.freeze([
  ['F:U:0','F:U:1'],['F:U:1','F:U:2'],['F:U:2','F:U:3'],['F:U:3','F:U:4'],['F:U:4','F:U:5'],['F:U:5','F:U:6'],['F:U:6','F:U:7'],['F:U:7','F:U:8'],
  ['F:D:0','F:D:1'],['F:D:1','F:D:2'],['F:D:2','F:D:3'],['F:D:3','F:D:4'],['F:D:4','F:D:5'],['F:D:5','F:D:6'],['F:D:6','F:D:7'],['F:D:7','F:D:8'],
  ['F:U:1','F:D:1'],['F:U:3','F:D:3'],['F:U:4','F:D:4'],['F:U:5','F:D:5'],['F:U:7','F:D:7'],
  ['F:U:0','F:L:0'],['F:U:1','F:L:0'],['F:U:0','F:L:1'],['F:L:0','F:L:1'],['F:L:0','F:L:2'],['F:L:1','F:L:2'],['F:L:1','F:L:3'],['F:L:2','F:L:3'],['F:L:2','F:D:0'],['F:L:3','F:D:1'],['F:U:2','F:L:2'],['F:D:2','F:L:3'],
  ['F:U:8','F:R:0'],['F:U:7','F:R:0'],['F:U:8','F:R:1'],['F:R:0','F:R:1'],['F:R:0','F:R:2'],['F:R:1','F:R:2'],['F:R:1','F:R:3'],['F:R:2','F:R:3'],['F:R:2','F:D:8'],['F:R:3','F:D:7'],['F:U:6','F:R:2'],['F:D:6','F:R:3']
].map(pair=>Object.freeze(pair)));
const SYMMETRIC_FIELD_PORTS=Object.freeze({
  'P1:L':'F:U:0','P1:C':'F:L:0','P1:R':'F:U:1',
  'P2:L':'F:L:2','P2:C':'F:U:2','P2:R':'F:U:3',
  'P3:L':'F:U:5','P3:C':'F:U:6','P3:R':'F:R:2',
  'P4:L':'F:U:7','P4:C':'F:R:0','P4:R':'F:U:8'
});
const SYMMETRIC_FIELD_START_ID='F:D:4';
const SYMMETRIC_FIELD_GATE_BOUNDARY_Z=-3.1;
const SYMMETRIC_FIELD_GOAL_BAND_Z=-12.75;
const SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS=9;
function battleFieldStartPosition(fieldId){return normalizeBattleFieldId(fieldId)===BATTLE_FIELD_SYMMETRIC_GATE_ID?SYMMETRIC_FIELD_START_ID:'C:0:0'}
function symmetricFieldNodeIds(){return [...SYMMETRIC_FIELD_NODE_IDS]}
function symmetricFieldNeighbors(id){const out=[];for(const [a,b] of SYMMETRIC_FIELD_EDGES){if(a===id)out.push(b);else if(b===id)out.push(a)}return out}
function symmetricFieldWorld(id){const parts=id.split(':'),band=parts[1],index=Number(parts[2]);if(band==='U'&&Number.isInteger(index)&&index>=0&&index<=8)return{x:(index-4)*1.8,z:-1.9,y:.24};if(band==='D'&&Number.isInteger(index)&&index>=0&&index<=8)return{x:(index-4)*1.8,z:2.7,y:.24};const side={L:{0:[-8.1,-.9],1:[-9.25,.25],2:[-8.35,1.55],3:[-6.75,.8]},R:{0:[8.1,-.9],1:[9.25,.25],2:[8.35,1.55],3:[6.75,.8]}}[band]?.[index];return side?{x:side[0],z:side[1],y:.24}:null}
function symmetricLaneIndex(owner,lane){const p=Number(String(owner).slice(1))-1,l={L:0,C:1,R:2}[lane];return Number.isInteger(p)&&p>=0&&p<4&&Number.isInteger(l)?p*3+l:null}
function symmetricShieldRoadWorld(owner,lane,depth=0){const index=symmetricLaneIndex(owner,lane);if(index===null)return null;return{x:(index-5.5)*1.45,z:-4.05-(Math.max(0,depth)*1.04),y:.24}}
'''
html = replace_once(
    html,
    'function refill(p){while(p.hand.length<3&&p.deck.length)p.hand.push(p.deck.shift())}\nfunction laneDepth(p,l){return p.lanes[l].length}',
    topology_block + "function refill(p){while(p.hand.length<3&&p.deck.length)p.hand.push(p.deck.shift())}\nfunction laneDepth(p,l){return p.lanes[l].length}",
    'topology constants',
)

html = replace_once(
    html,
    "function posType(id){if(id.startsWith('C:'))return'center';if(id.startsWith('S:'))return'shield';if(id.startsWith('R:'))return'road';return'corner'}",
    "function posType(id){if(id.startsWith('C:')||id.startsWith('F:'))return'center';if(id.startsWith('S:'))return'shield';if(id.startsWith('R:'))return'road';return'corner'}",
    'field posType',
)
html = replace_once(
    html,
    "function centerIds(){const a=[];for(let r=-1;r<=1;r++)for(let c=-1;c<=1;c++)a.push(`C:${r}:${c}`);return a}",
    "function centerIds(){if(symmetricFieldActive())return symmetricFieldNodeIds();const a=[];for(let r=-1;r<=1;r++)for(let c=-1;c<=1;c++)a.push(`C:${r}:${c}`);return a}",
    'field centerIds',
)
html = replace_once(
    html,
    "function activeNodes(){const s=new Set(centerIds());['K:NW','K:NE','K:SW','K:SE'].forEach(id=>s.add(id));state.match.players.forEach(p=>{['L','C','R'].forEach(l=>{s.add(shieldId(p.id,l));for(let d=1;d<=p.lanes[l].length&&d<=7;d++)s.add(roadId(p.id,l,d))})});return s}",
    "function activeNodes(){const s=new Set(centerIds());if(!symmetricFieldActive())['K:NW','K:NE','K:SW','K:SE'].forEach(id=>s.add(id));state.match.players.forEach(p=>{['L','C','R'].forEach(l=>{s.add(shieldId(p.id,l));for(let d=1;d<=p.lanes[l].length&&d<=7;d++)s.add(roadId(p.id,l,d))})});return s}",
    'field activeNodes',
)
html = replace_once(
    html,
    "function centerPort(owner,lane,viewer){const arm=projectionFor(viewer)[owner];const laneIx={L:-1,C:0,R:1}[lane];if(arm==='N')return`C:-1:${laneIx}`;if(arm==='S')return`C:1:${-laneIx}`;if(arm==='W')return`C:${-laneIx}:-1`;return`C:${laneIx}:1`}",
    "function centerPort(owner,lane,viewer){if(symmetricFieldActive())return SYMMETRIC_FIELD_PORTS[`${owner}:${lane}`]||null;const arm=projectionFor(viewer)[owner];const laneIx={L:-1,C:0,R:1}[lane];if(arm==='N')return`C:-1:${laneIx}`;if(arm==='S')return`C:1:${-laneIx}`;if(arm==='W')return`C:${-laneIx}:-1`;return`C:${laneIx}:1`}",
    'field ports',
)

neighbors_new = r'''function neighbors(id,viewer){
 const act=activeNodes(),out=[];
 if(id.startsWith('F:')){
  for(const n of symmetricFieldNeighbors(id))if(act.has(n))out.push(n);
  state.match.players.forEach(p=>['L','C','R'].forEach(l=>{const sh=shieldId(p.id,l);if(centerPort(p.id,l,viewer)===id&&act.has(sh))out.push(sh)}));
  return [...new Set(out)].filter(x=>act.has(x));
 }
 const proj=projectionFor(viewer),ownerFor=arm=>state.match.players.find(p=>proj[p.id]===arm)?.id,cornerDefs={'K:NW':[['N','L'],['W','R']],'K:NE':[['N','R'],['E','L']],'K:SW':[['S','R'],['W','L']],'K:SE':[['S','L'],['E','R']]},cornerRoads=k=>(cornerDefs[k]||[]).map(([arm,lane])=>{const owner=ownerFor(arm);return owner?roadId(owner,lane,1):null}).filter(Boolean);
 if(id.startsWith('C:')){const [,rs,cs]=id.split(':'),r=+rs,c=+cs;[[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([rr,cc])=>{const x=`C:${rr}:${cc}`;if(act.has(x))out.push(x)});state.match.players.forEach(p=>['L','C','R'].forEach(l=>{const sh=shieldId(p.id,l);if(centerPort(p.id,l,viewer)===id&&act.has(sh))out.push(sh)}))}
 else if(id.startsWith('K:')){cornerRoads(id).forEach(x=>{if(act.has(x))out.push(x)})}
 else if(id.startsWith('S:')){const [,owner,lane]=id.split(':');const port=centerPort(owner,lane,viewer);if(port)out.push(port);const r1=roadId(owner,lane,1);if(act.has(r1))out.push(r1)}
 else if(id.startsWith('R:')){const {owner,lane,depth}=parseRoad(id);if(depth===1){out.push(shieldId(owner,lane));if(!symmetricFieldActive())Object.keys(cornerDefs).forEach(k=>{if(cornerRoads(k).includes(id))out.push(k)})}const a=roadId(owner,lane,depth-1),b=roadId(owner,lane,depth+1);if(depth>1&&act.has(a))out.push(a);if(depth<7&&act.has(b))out.push(b)}
 return [...new Set(out)].filter(x=>act.has(x))
}'''
html = replace_between(html, 'function neighbors(id,viewer){', 'function shortest(', neighbors_new, 'neighbors topology')

node_world_new = r'''function nodeWorld(id,viewer){
 if(id.startsWith('F:'))return symmetricFieldWorld(id)||{x:0,z:0,y:.24};
 if(id.startsWith('C:')){const [,rs,cs]=id.split(':'),r=+rs,c=+cs;return{x:+cs*1.35,z:+rs*1.35,y:.24}}
 if(id.startsWith('S:')||id.startsWith('R:')){let owner,lane,depth=0;if(id.startsWith('S:')){[,owner,lane]=id.split(':');depth=0}else({owner,lane,depth}=parseRoad(id));if(symmetricFieldActive())return symmetricShieldRoadWorld(owner,lane,depth)||{x:0,z:0,y:.24};const arm=projectionFor(viewer)[owner],off={L:-1.45,C:0,R:1.45}[lane],d=2.35+depth*1.25;if(arm==='N')return{x:off,z:-d,y:.24};if(arm==='S')return{x:-off,z:d,y:.24};if(arm==='W')return{x:-d,z:-off,y:.24};return{x:d,z:off,y:.24}}
 const k={NW:{x:-10,z:-10},NE:{x:10,z:-10},SW:{x:-10,z:10},SE:{x:10,z:10}}[id.split(':')[1]];return{k,y:.2,...k}
}'''
html = replace_between(html, 'function nodeWorld(id,viewer){', 'function vsub(', node_world_new, 'nodeWorld geometry')

# A screen-space topology overlay makes common-field edges, direct Gate crossings, 12 progression spines and 9-column GOAL band readable in all render fallbacks.
overlay = r'''function renderFieldTopologyOverlay(viewer){
 const layer=$('#fieldTopologyLayer');if(!layer)return;layer.replaceChildren();if(!symmetricFieldActive())return;
 const ns='http://www.w3.org/2000/svg';
 const line=(a,b,className)=>{if(!a||!b)return;const e=document.createElementNS(ns,'line');e.setAttribute('x1',a.x);e.setAttribute('y1',a.y);e.setAttribute('x2',b.x);e.setAttribute('y2',b.y);e.setAttribute('class',className);layer.appendChild(e)};
 const circle=(p,r,className)=>{if(!p)return;const e=document.createElementNS(ns,'circle');e.setAttribute('cx',p.x);e.setAttribute('cy',p.y);e.setAttribute('r',r);e.setAttribute('class',className);layer.appendChild(e)};
 for(const [a,b] of SYMMETRIC_FIELD_EDGES)line(fieldProjection.get(a),fieldProjection.get(b),'fieldTopologyLine');
 for(const owner of ['P1','P2','P3','P4'])for(const lane of ['L','C','R']){
  const port=fieldProjection.get(centerPort(owner,lane,viewer)),shield=fieldProjection.get(shieldId(owner,lane));line(port,shield,'fieldTopologyLine');
  let prior=shield;for(let depth=1;depth<=7;depth++){const next=fieldProjection.get(roadId(owner,lane,depth));line(prior,next,'fieldTopologyLine fieldProgressionSpine');prior=next}
  const roadWorld=nodeWorld(roadId(owner,lane,7),viewer),goalPoint=project3({x:roadWorld.x,y:.24,z:SYMMETRIC_FIELD_GOAL_BAND_Z});line(prior,goalPoint,'fieldTopologyLine fieldProgressionSpine');
 }
 const gateA=project3({x:-9.7,y:.24,z:SYMMETRIC_FIELD_GATE_BOUNDARY_Z}),gateB=project3({x:9.7,y:.24,z:SYMMETRIC_FIELD_GATE_BOUNDARY_Z});line(gateA,gateB,'fieldTopologyLine fieldGateBoundary');
 const goalA=project3({x:-8.2,y:.24,z:SYMMETRIC_FIELD_GOAL_BAND_Z}),goalB=project3({x:8.2,y:.24,z:SYMMETRIC_FIELD_GOAL_BAND_Z});line(goalA,goalB,'fieldTopologyLine fieldGoalBand');
 for(let index=0;index<SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS;index++)circle(project3({x:(index-4)*2.05,y:.24,z:SYMMETRIC_FIELD_GOAL_BAND_Z}),.75,'fieldGoalMarker');
}'''
html = replace_once(html, 'function renderRangeSurfaces(reach,moveLimit,viewer){', overlay + '\nfunction renderRangeSurfaces(reach,moveLimit,viewer){', 'topology overlay function')

# Do not project old corner nodes in the new field.
html = replace_once(
    html,
    "['K:NW','K:NE','K:SW','K:SE'].forEach(id=>all.push(id));",
    "if(!symmetricFieldActive())['K:NW','K:NE','K:SW','K:SE'].forEach(id=>all.push(id));",
    'renderField3D corner suppression',
)
html = replace_once(
    html,
    "['K:NW','K:NE','K:SW','K:SE'].forEach(x=>all.push(x));",
    "if(!symmetricFieldActive())['K:NW','K:NE','K:SW','K:SE'].forEach(x=>all.push(x));",
    'renderBoard corner suppression',
)

# Reproject topology during camera motion and ordinary board renders.
html = replace_once(
    html,
    "function grRefreshBattleCameraProjection(){if(state.screen!=='battle'||!state.match)return;renderField3D();const me=state.match.players[0],moveLimit=",
    "function grRefreshBattleCameraProjection(){if(state.screen!=='battle'||!state.match)return;renderField3D();const me=state.match.players[0];renderFieldTopologyOverlay(me);const moveLimit=",
    'camera topology refresh',
)
html = replace_once(
    html,
    "function renderBoard(){const board=$('#board'),me=state.match.players[0],m=state.match;renderField3D();board.innerHTML='';",
    "function renderBoard(){const board=$('#board'),me=state.match.players[0],m=state.match,map=$('#battleMap');if(map){map.dataset.battleField=currentBattleFieldId();map.setAttribute('aria-label',symmetricFieldActive()?'新フィールド。共通フィールドからGate境界を越えてシールド・進行列・GOALへつながる盤面':'草原フィールド')}renderField3D();renderFieldTopologyOverlay(me);board.innerHTML='';",
    'renderBoard field identity',
)

# The existing Flanora presentation remains for the old field only; it would otherwise draw a second incompatible topology over the new field.
html = replace_once(
    html,
    "function syncBattleCentralWorldPresentation(m){const host=$('#battleCentralWorldLiveHost'),snapshot=battleCentralWorldStraightSnapshotR8(m);if(!host||!snapshot)return false;if(battleCentralWorldRuntimeR8?.mounted)",
    "function syncBattleCentralWorldPresentation(m){const host=$('#battleCentralWorldLiveHost'),snapshot=battleCentralWorldStraightSnapshotR8(m);if(!host||!snapshot)return false;const symmetric=symmetricFieldActive();host.hidden=symmetric;host.setAttribute('aria-hidden',String(symmetric));if(symmetric)return true;if(battleCentralWorldRuntimeR8?.mounted)",
    'old field overlay isolation',
)

# New matches pin the selected field and use one neutral shared start on the new common field.
html = replace_once(
    html,
    "const n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];for(let i=0;i<n;i++)ps.push(makePlayer(i,i===0,i===0?[...snapshot.deck.main]:diagnosticCpuDeck));if(snapshot.setup.mode==='2v2')",
    "const fieldId=normalizeBattleFieldId(state.setupField),n=playerCount(snapshot.setup.mode),ps=[],diagnosticCpuDeck=[...snapshot.deck.main];for(let i=0;i<n;i++)ps.push(makePlayer(i,i===0,i===0?[...snapshot.deck.main]:diagnosticCpuDeck));for(const p of ps)p.position=battleFieldStartPosition(fieldId);if(snapshot.setup.mode==='2v2')",
    'new match field start',
)
html = replace_once(
    html,
    "state.match={id:'M'+Date.now(),mode:snapshot.setup.mode,contentId:snapshot.setup.content,round:1",
    "state.match={id:'M'+Date.now(),mode:snapshot.setup.mode,contentId:snapshot.setup.content,fieldId,round:1",
    'match field identity',
)

# Player-facing position text recognizes the common field without creating a Gate position.
html = replace_once(
    html,
    "function positionLabel(id){if(id.startsWith('C:'))return '中央';if(id.startsWith('S:'))return 'シールド境界';",
    "function positionLabel(id){if(id.startsWith('C:')||id.startsWith('F:'))return '共通フィールド';if(id.startsWith('S:'))return 'シールド境界';",
    'field position label',
)

# QA receipt is read-only and explicitly proves that Gate is not represented by a node.
qa = r'''window.__GAMEROAD_SYMMETRIC_GATE_FIELD_R1__=Object.freeze({
 fieldId:BATTLE_FIELD_SYMMETRIC_GATE_ID,
 gateRole:'BOUNDARY_EDGE_ONLY',
 goalVisualColumns:SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS,
 startPosition:SYMMETRIC_FIELD_START_ID,
 nodeIds:Object.freeze([...SYMMETRIC_FIELD_NODE_IDS]),
 edges:Object.freeze(SYMMETRIC_FIELD_EDGES.map(edge=>Object.freeze([...edge]))),
 ports:SYMMETRIC_FIELD_PORTS,
 snapshot:()=>Object.freeze({selectedFieldId:currentBattleFieldId(),active:symmetricFieldActive(),gateNodeCount:SYMMETRIC_FIELD_NODE_IDS.filter(id=>id.includes('GATE')).length,topCenterHasDirectShieldPort:Object.values(SYMMETRIC_FIELD_PORTS).includes('F:U:4'),sharedNodeCount:SYMMETRIC_FIELD_NODE_IDS.length,sharedEdgeCount:SYMMETRIC_FIELD_EDGES.length,goalVisualColumns:SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS,startPosition:battleFieldStartPosition(BATTLE_FIELD_SYMMETRIC_GATE_ID),gameplayAuthority:'existing-neighbors-and-existing-shield-road-authority'})
});
'''
html = replace_once(html, 'window.__V106_FIELD_TEST__={', qa + 'window.__V106_FIELD_TEST__={', 'field QA receipt')

# Static regression: field is additive, symmetric, persisted, Gate is boundary-only, and top-center is intentionally not a Shield port.
static_checks = r'''
  const symmetricGateFieldContracts = [
    [/data-field=["']FIELD-01["'][^>]*>草原<\/button>/, 'existing field choice is missing'],
    [/data-field=["']FIELD-10["'][^>]*>新フィールド<\/button>/, 'new symmetric field choice is missing'],
    [/setupField:BATTLE_FIELD_CURRENT_ID/, 'field selection is not part of current setup state'],
    [/setupField:normalizeBattleFieldId\(state\.setupField\)/, 'field selection is not persisted in the existing save pack'],
    [/const SYMMETRIC_FIELD_START_ID=['"]F:D:4['"]/, 'new field shared start is missing'],
    [/const SYMMETRIC_FIELD_GOAL_VISUAL_COLUMNS=9/, 'new field GOAL visual band is not nine columns'],
    [/const SYMMETRIC_FIELD_GATE_BOUNDARY_Z=-3\.1/, 'Gate boundary presentation is missing'],
    [/id=["']fieldTopologyLayer["']/, 'new field continuous topology layer is missing'],
    [/gateRole:['"]BOUNDARY_EDGE_ONLY['"]/, 'Gate is not explicitly boundary-only'],
    [/gateNodeCount:SYMMETRIC_FIELD_NODE_IDS\.filter\(id=>id\.includes\(['"]GATE['"]\)\)\.length/, 'Gate-node zero-count receipt is missing'],
    [/topCenterHasDirectShieldPort:Object\.values\(SYMMETRIC_FIELD_PORTS\)\.includes\(['"]F:U:4['"]\)/, 'top-center no-upward-connection receipt is missing'],
    [/for\(const p of ps\)p\.position=battleFieldStartPosition\(fieldId\)/, 'new matches do not use the selected field start'],
    [/state\.match=\{id:'M'\+Date\.now\(\),mode:snapshot\.setup\.mode,contentId:snapshot\.setup\.content,fieldId,round:1/, 'selected field identity is not pinned into the match'],
    [/if\(symmetricFieldActive\(\)\)return SYMMETRIC_FIELD_PORTS\[`\$\{owner\}:\$\{lane\}`\]\|\|null/, 'new field does not connect shared field directly to existing Shield identities'],
    [/if\(id\.startsWith\(['"]F:['"]\)\)\{[\s\S]*?symmetricFieldNeighbors\(id\)[\s\S]*?centerPort\(p\.id,l,viewer\)===id/, 'new common field movement graph is not wired into existing Shield neighbor authority'],
    [/host\.hidden=symmetric;host\.setAttribute\(['"]aria-hidden['"],String\(symmetric\)\);if\(symmetric\)return true/, 'old Flanora topology remains overlaid on the new field'],
  ];
  for (const [pattern, message] of symmetricGateFieldContracts) if (!pattern.test(html)) errors.push(message);
  const symmetricPortsStart = html.indexOf('const SYMMETRIC_FIELD_PORTS=Object.freeze({');
  const symmetricPortsEnd = html.indexOf('const SYMMETRIC_FIELD_START_ID=', symmetricPortsStart);
  const symmetricPortsBlock = symmetricPortsStart >= 0 && symmetricPortsEnd > symmetricPortsStart ? html.slice(symmetricPortsStart, symmetricPortsEnd) : '';
  if (symmetricPortsBlock.includes("'F:U:4'")) errors.push('central-top shared-field point is directly connected upward to a Shield/Gate edge');
  if (/SYMMETRIC_FIELD_(?:GATE_NODE|GATE_CELL|GATE_STOP)/.test(html)) errors.push('Gate was implemented as a node/cell/stop instead of an edge boundary');
'''
test = replace_once(test, '  errors.push(...collectHomeVisualShellErrors(html));', '  errors.push(...collectHomeVisualShellErrors(html));' + static_checks, 'static field checks')

HTML_PATH.write_text(html, encoding='utf-8')
TEST_PATH.write_text(test, encoding='utf-8')
print('patched symmetric Gate field: Gate node count=0; new field additive')
