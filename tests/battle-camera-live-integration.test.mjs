import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const html=fs.readFileSync(new URL('../browser/GAMEROAD.html',import.meta.url),'utf8');
test('existing camera runtime is mounted into current Battle field without a second engine',()=>{
  assert.match(html,/id="gameroad-battle-camera-live"/);
  assert.match(html,/import \{ mountBattleCameraLiveRuntime \} from '\.\/battle-camera-live-runtime\.mjs'/);
  assert.match(html,/function grBattleCameraSource\(\)/);
  assert.match(html,/controlledWorldPoint:\{x:w\.x,y:w\.z\}/);
  assert.match(html,/if\(grBattleCameraView\)\{/);
  assert.match(html,/followDistance=profile\.kind==='portrait'\?12:profile\.kind==='short-landscape'\?9\.5:11/);
  assert.doesNotMatch(html,/new THREE|THREE\.|new .*CameraController/);
});
test('manual camera keeps DOM and WebGL projection on the same pitch',()=>{
  assert.match(html,/pitch=Number\.isFinite\(c\.pitchRad\)\?c\.pitchRad:Math\.PI\/4/);
  assert.match(html,/uniform vec2 uPitch/);
  assert.match(html,/gl\.uniform2f\(gl\.getUniformLocation\(fieldProgram,'uPitch'\),Math\.cos\(pitch\),Math\.sin\(pitch\)\)/);
  assert.match(html,/angle:\{min:28,max:62\}/);
});
test('camera return has zero FOLLOW footprint and becomes reachable only in manual inspect',()=>{
  assert.match(html,/id="cameraReturnBtn"[^>]+hidden>自分<\/button>/);
  assert.match(html,/#cameraReturnBtn\{display:none;pointer-events:none\}/);
  assert.match(html,/#cameraReturnBtn\[data-camera-mode="MANUAL_INSPECT"\]\{display:flex;pointer-events:auto;/);
  assert.match(html,/returnControl\.hidden=cameraState\.mode!=='MANUAL_INSPECT'/);
  assert.match(html,/isScreenUiTarget\(target\)/);
  assert.match(html,/target\.closest\('button,select,input,textarea,a,\[role="button"\]'\)/);
  assert.match(html,/returnControlElement:returnControl/);
});
test('camera follows authoritative controlled position but owns no gameplay state',()=>{
  assert.match(html,/if\(p\?\.human\)window\.__GAMEROAD_BATTLE_CAMERA_LIVE__\?\.syncFromGame\?\.\(\)/);
  assert.match(html,/authority:\{gameplay:false,movement:false,target:false,legality:false,stateWrite:false\}/);
  assert.match(html,/MANUAL_INSPECT/);
  assert.match(html,/syncControlledPoint\(source\.controlledWorldPoint\)/);
  const start=html.indexOf('function grBattleCameraSource()');
  const end=html.indexOf('function fieldProject',start);
  assert.ok(start>=0&&end>start);
  const adapter=html.slice(start,end);
  assert.doesNotMatch(adapter,/(?:state\.match\.target|me\.position|me\.plan\.path)\s*=/);
});
