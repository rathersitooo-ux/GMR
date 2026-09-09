from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
TEST = Path('tests/battle-camera-live-integration.test.mjs')
text = HTML.read_text(encoding='utf-8')

if 'gameroad-battle-camera-live-r5c' in text:
    raise SystemExit(0)

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, got {count}')
    text = text.replace(old, new, 1)

# Add the one-action return control to existing screen-space Battle rail.
replace_once(
    '<div class="battleRail"><button class="railBtn" id="detailsBtn" aria-label="対戦情報">情報</button><button class="railBtn" id="dangerBtn" aria-label="移動可能範囲">範囲</button><button class="railBtn warn" id="leaveMatch">退出</button></div>',
    '<div class="battleRail"><button class="railBtn" id="detailsBtn" aria-label="対戦情報">情報</button><button class="railBtn" id="dangerBtn" aria-label="移動可能範囲">範囲</button><button class="railBtn" id="cameraReturnBtn" aria-label="操作キャラへカメラを戻す" title="操作キャラへ戻る">自分</button><button class="railBtn warn" id="leaveMatch">退出</button></div>',
    'battle rail',
)

# Keep free-camera view state beside the existing projection state; rules/path state remain untouched.
replace_once(
    "let fieldGL=null,fieldProgram=null,fieldProjection=new Map(),fieldMVP=null,fieldCameraState=null,fieldViewSize={w:1,h:1},routeDrag=null,fieldResizeQueued=false,fieldLastStats={mode:'none',vertices:0,grassTufts:0,lowPerf:false};",
    "let fieldGL=null,fieldProgram=null,fieldProjection=new Map(),fieldMVP=null,fieldCameraState=null,grBattleCameraView=null,grBattleCameraRenderQueued=false,fieldViewSize={w:1,h:1},routeDrag=null,fieldResizeQueued=false,fieldLastStats={mode:'none',vertices:0,grassTufts:0,lowPerf:false};",
    'field camera state declaration',
)

# JS projection and WebGL projection must share the same pitch or DOM hit targets drift away from terrain.
replace_once(
    "function project3(w){const c=fieldCameraState;if(!c)return null;const eye=c.eye,rx=w.x-eye[0],ry=(w.y||0)-eye[1],rz=w.z-eye[2],q=Math.SQRT1_2,cx=rx,cy=q*ry-q*rz,cz=-q*ry-q*rz;if(cz<=.08)return null;const t=Math.tan(Math.PI/10.2),nx=cx/(cz*t*c.aspect),ny=cy/(cz*t);return{x:(nx*.5+.5)*100,y:(c.yBase-ny*c.yGain)*100}}",
    "function project3(w){const c=fieldCameraState;if(!c)return null;const eye=c.eye,rx=w.x-eye[0],ry=(w.y||0)-eye[1],rz=w.z-eye[2],pitch=Number.isFinite(c.pitchRad)?c.pitchRad:Math.PI/4,cp=Math.cos(pitch),sp=Math.sin(pitch),cx=rx,cy=cp*ry-sp*rz,cz=-sp*ry-cp*rz;if(cz<=.08)return null;const t=Math.tan(Math.PI/10.2),nx=cx/(cz*t*c.aspect),ny=cy/(cz*t);return{x:(nx*.5+.5)*100,y:(c.yBase-ny*c.yGain)*100}}",
    'project3 pitch',
)

shader_old = "uniform vec3 uEye;uniform vec3 uLight;uniform vec4 uView;varying vec3 vColor;varying float vFog;void main(){vec3 r=p-uEye;float q=.70710678;float cx=r.x;float cy=q*r.y-q*r.z;float cz=max(.08,-q*r.y-q*r.z);"
shader_new = "uniform vec3 uEye;uniform vec3 uLight;uniform vec4 uView;uniform vec2 uPitch;varying vec3 vColor;varying float vFog;void main(){vec3 r=p-uEye;float cp=uPitch.x;float sp=uPitch.y;float cx=r.x;float cy=cp*r.y-sp*r.z;float cz=max(.08,-sp*r.y-cp*r.z);"
replace_once(shader_old, shader_new, 'WebGL pitch shader')

replace_once(
    "gl.uniform4f(gl.getUniformLocation(fieldProgram,'uView'),Math.tan(Math.PI/10.2),cam.aspect,cam.yBase,cam.yGain);gl.drawArrays",
    "gl.uniform4f(gl.getUniformLocation(fieldProgram,'uView'),Math.tan(Math.PI/10.2),cam.aspect,cam.yBase,cam.yGain);const pitch=Number.isFinite(cam.pitchRad)?cam.pitchRad:Math.PI/4;gl.uniform2f(gl.getUniformLocation(fieldProgram,'uPitch'),Math.cos(pitch),Math.sin(pitch));gl.drawArrays",
    'WebGL pitch uniform',
)

# Existing automatic focus remains only as fail-soft fallback before the live runtime mounts.
field_prefix = "function fieldCamera(viewer){const profile=fieldViewportProfile(),battleFocus=fieldBattleFocusNodes(),moveFocus=fieldMoveFocusNodes(),focus=battleFocus?.length?battleFocus:moveFocus;"
field_replacement = "function fieldCamera(viewer){const profile=fieldViewportProfile();if(grBattleCameraView){const angle=Math.max(28,Math.min(62,Number(grBattleCameraView.angle)||45)),pitchRad=angle*Math.PI/180,followDistance=profile.kind==='portrait'?12:profile.kind==='short-landscape'?9.5:11,scale=Math.max(.5,Math.min(1.25,Number(grBattleCameraView.zoom)||1)),distance=followDistance/scale,radial=distance*Math.SQRT2,cx=grBattleCameraView.center.x,cz=grBattleCameraView.center.y,eye=[cx,radial*Math.sin(pitchRad),cz+radial*Math.cos(pitchRad)],center=[cx,0,cz];return{eye,center,r:distance,moveFocus:false,battleFocus:false,pitchRad,cameraMode:grBattleCameraView.mode||'FOLLOW_CONTROLLED',...profile}}const battleFocus=fieldBattleFocusNodes(),moveFocus=fieldMoveFocusNodes(),focus=battleFocus?.length?battleFocus:moveFocus;"
replace_once(field_prefix, field_replacement, 'fieldCamera live override')

# Insert authority-safe adapter immediately after existing fieldCamera and before fieldProject.
adapter_anchor = "return{eye,center,r,moveFocus:false,battleFocus:false,...profile}} function fieldProject(id,viewer)"
adapter = r'''return{eye,center,r,moveFocus:false,battleFocus:false,...profile}}
function grBattleCameraSource(){const m=state.match;if(!m||state.screen!=='battle'||!Array.isArray(m.players)||!m.players[0])return null;const me=m.players[0],w=nodeWorld(me.position,me),map=$('#battleMap'),mw=Math.max(1,map?.clientWidth||innerWidth),mh=Math.max(1,map?.clientHeight||innerHeight);return{matchId:String(m.id||''),controlledCharacterId:`${me.id}:${String(me.character||state.playerCharacterId||'controlled')}`,controlledWorldPoint:{x:w.x,y:w.z},followZoom:1,followAngle:45,limits:{x:{min:-13,max:13},y:{min:-13,max:13},zoom:{min:.5,max:1.25},angle:{min:28,max:62}},reducedMotion:!!state.settings.reduceMotion,lowPerformance:!!state.settings.lowPerf,gestureCalibration:{panWorldUnitsPerPixelX:-26/mw,panWorldUnitsPerPixelY:-26/mh,wheelZoomRate:.0015,angleDegreesPerWheelDelta:.08,angleDegreesPerPixel:.18,dragThresholdPx:5}}}
function grRefreshBattleCameraProjection(){if(state.screen!=='battle'||!state.match)return;renderField3D();const me=state.match.players[0],moveLimit=normalMoveLimitForRoad(me.plan?.roadId),reach=state.match.phase==='plan'&&me.plan?.roadId&&moveLimit>0?reachable(me,moveLimit):new Map();renderRangeSurfaces(reach,moveLimit,me);$$('#board .node').forEach(e=>{const xy=nodeXY(e.dataset.pos,me);e.style.left=xy[0]+'%';e.style.top=xy[1]+'%'});renderBoardPlayers();renderRouteLine();const visual=(state.match.phase==='plan'&&me.plan?.path?.length)?me.plan.path.at(-1):me.position,xy=nodeXY(visual,me),actor=$('#battleRuntime');if(actor){actor.style.left=xy[0]+'%';actor.style.top=xy[1]+'%'}layoutBoardPlayerTokens()}
function grBattleCameraApplyView(cameraState){if(!cameraState||!cameraState.center)return;grBattleCameraView={mode:String(cameraState.mode||'FOLLOW_CONTROLLED'),center:{x:Number(cameraState.center.x)||0,y:Number(cameraState.center.y)||0},zoom:Number(cameraState.zoom)||1,angle:Number(cameraState.angle)||45};if(grBattleCameraRenderQueued)return;grBattleCameraRenderQueued=true;requestAnimationFrame(()=>{grBattleCameraRenderQueued=false;grRefreshBattleCameraProjection()})}
window.__GAMEROAD_BATTLE_CAMERA_FIELD_ADAPTER__=Object.freeze({readSource:grBattleCameraSource,applyView:grBattleCameraApplyView,snapshot:()=>({view:grBattleCameraView?{...grBattleCameraView,center:{...grBattleCameraView.center}}:null,field:fieldCameraState?{eye:[...fieldCameraState.eye],center:[...fieldCameraState.center],pitchRad:fieldCameraState.pitchRad??Math.PI/4,cameraMode:fieldCameraState.cameraMode||null}:null,authority:{gameplay:false,movement:false,target:false,legality:false,stateWrite:false}})});
function fieldProject(id,viewer)'''
replace_once(adapter_anchor, adapter, 'field adapter')

# Authoritative controlled-position events only sync the follow anchor; MANUAL mode is preserved by the merged core.
replace_once(
    "function grControlledCharacter4pEvent(p,type,detail={}){const emit=window.__GAMEROAD_CONTROLLED_CHARACTER_4P_EVENT__;",
    "function grControlledCharacter4pEvent(p,type,detail={}){if(p?.human)window.__GAMEROAD_BATTLE_CAMERA_LIVE__?.syncFromGame?.();const emit=window.__GAMEROAD_CONTROLLED_CHARACTER_4P_EVENT__;",
    'controlled movement camera sync',
)

replace_once(
    "show('battle');setupBattleDetails();renderBattle();return state.match}",
    "show('battle');setupBattleDetails();renderBattle();window.__GAMEROAD_BATTLE_CAMERA_LIVE__?.syncFromGame?.();return state.match}",
    'match start camera sync',
)

# Standalone module composes the merged DOM transport without gaining access to gameplay rules.
module = r'''
<style id="gameroad-battle-camera-live-r5c-style">
#battleMap[data-camera-live="r5c"]{touch-action:none}
#cameraReturnBtn[data-camera-mode="MANUAL_INSPECT"]{box-shadow:0 0 0 2px rgba(176,231,255,.58),0 6px 18px rgba(0,0,0,.28);background:rgba(17,66,82,.92)}
</style>
<script type="module" id="gameroad-battle-camera-live-r5c">
import { mountBattleCameraLiveRuntime } from './battle-camera-live-runtime.mjs';
(() => {
  const adapter=globalThis.__GAMEROAD_BATTLE_CAMERA_FIELD_ADAPTER__;
  if(!adapter||typeof adapter.readSource!=='function'||typeof adapter.applyView!=='function')return;
  let runtime=null,key='';
  const world=document.querySelector('#battleMap'),returnControl=document.querySelector('#cameraReturnBtn');
  if(!world||!returnControl)return;
  world.dataset.cameraLive='r5c';
  function isScreenUiTarget(target){if(!(target instanceof Element))return true;if(target===world||target.id==='fieldCanvas'||target.id==='board'||target.id==='boardPlayers'||target.id==='routeSvg'||target.id==='rangeSurfaceLayer'||target.id==='routeLine')return false;if(target.closest('#fieldCanvas,#routeSvg')&&!target.closest('button,select,input,textarea,a,[role="button"]'))return false;return true}
  function destroy(){runtime?.destroy?.();runtime=null;key='';delete world.dataset.cameraMode;delete returnControl.dataset.cameraMode}
  function syncFromGame(){const source=adapter.readSource();if(!source){destroy();return null}const nextKey=`${source.matchId}|${source.controlledCharacterId}`;if(!runtime||key!==nextKey){destroy();runtime=mountBattleCameraLiveRuntime({worldElement:world,returnControlElement:returnControl,controlledCharacterId:source.controlledCharacterId,controlledWorldPoint:source.controlledWorldPoint,followZoom:source.followZoom,followAngle:source.followAngle,limits:source.limits,reducedMotion:source.reducedMotion,lowPerformance:source.lowPerformance,gestureCalibration:source.gestureCalibration,isScreenUiTarget,applyView:(cameraState,meta)=>{adapter.applyView(cameraState,meta);world.dataset.cameraMode=cameraState.mode;returnControl.dataset.cameraMode=cameraState.mode}});key=nextKey}else runtime.syncControlledPoint(source.controlledWorldPoint);const state=runtime.getState();world.dataset.cameraMode=state.mode;returnControl.dataset.cameraMode=state.mode;return state}
  const api=Object.freeze({syncFromGame,returnToControlled:()=>runtime?.returnToControlled?.()||null,snapshot:()=>({mounted:!!runtime,key,state:runtime?.getState?.()||null,field:adapter.snapshot?.()||null})});
  globalThis.__GAMEROAD_BATTLE_CAMERA_LIVE__=api;
  syncFromGame();
  const battle=document.querySelector('section[data-screen="battle"]');
  if(battle)new MutationObserver(()=>{if(battle.classList.contains('active'))syncFromGame()}).observe(battle,{attributes:true,attributeFilter:['class','hidden','aria-hidden']});
})();
</script>
'''
if '</body>' not in text:
    raise SystemExit('body close anchor missing')
text = text.replace('</body>', module + '\n</body>', 1)

HTML.write_text(text, encoding='utf-8')

TEST.write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');

test('Battle camera defaults to controlled-character live view instead of full-board overview',()=>{
  assert.match(html,/id="gameroad-battle-camera-live-r5c"/);
  assert.match(html,/import \{ mountBattleCameraLiveRuntime \} from '\.\/battle-camera-live-runtime\.mjs'/);
  assert.match(html,/function grBattleCameraSource\(\)/);
  assert.match(html,/controlledWorldPoint:\{x:w\.x,y:w\.z\}/);
  assert.match(html,/if\(grBattleCameraView\)\{/);
  assert.match(html,/followDistance=profile\.kind==='portrait'\?12:profile\.kind==='short-landscape'\?9\.5:11/);
  assert.doesNotMatch(html,/grBattleCameraView[^\n]{0,600}center:\[0,0,0\]/);
});

test('manual camera uses shared JS/WebGL pitch and keeps world/DOM projection coherent',()=>{
  assert.match(html,/pitch=Number\.isFinite\(c\.pitchRad\)\?c\.pitchRad:Math\.PI\/4/);
  assert.match(html,/uniform vec2 uPitch/);
  assert.match(html,/gl\.uniform2f\(gl\.getUniformLocation\(fieldProgram,'uPitch'\),Math\.cos\(pitch\),Math\.sin\(pitch\)\)/);
  assert.match(html,/angle:\{min:28,max:62\}/);
});

test('camera has one-action return and screen-space UI is excluded from camera gesture ownership',()=>{
  assert.match(html,/id="cameraReturnBtn"[^>]+操作キャラへカメラを戻す/);
  assert.match(html,/isScreenUiTarget\(target\)/);
  assert.match(html,/target\.closest\('button,select,input,textarea,a,\[role="button"\]'\)/);
  assert.match(html,/returnControlElement:returnControl/);
});

test('camera follows authoritative controlled position without becoming movement or legality authority',()=>{
  assert.match(html,/if\(p\?\.human\)window\.__GAMEROAD_BATTLE_CAMERA_LIVE__\?\.syncFromGame\?\.\(\)/);
  assert.match(html,/authority:\{gameplay:false,movement:false,target:false,legality:false,stateWrite:false\}/);
  assert.match(html,/MANUAL_INSPECT/);
  assert.match(html,/syncControlledPoint\(source\.controlledWorldPoint\)/);
});

test('camera bounds are finite and preserve an inspectable world without moving world objects',()=>{
  assert.match(html,/x:\{min:-13,max:13\},y:\{min:-13,max:13\},zoom:\{min:\.5,max:1\.25\},angle:\{min:28,max:62\}/);
  assert.match(html,/panWorldUnitsPerPixelX:-26\/mw/);
  assert.match(html,/panWorldUnitsPerPixelY:-26\/mh/);
  assert.doesNotMatch(html,/camera.*(?:reachable\(|legalOpponents\(|state\.match\.target\s*=)/i);
});
''', encoding='utf-8')

print('R5C camera HTML donor patched')
