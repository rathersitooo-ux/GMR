import assert from 'node:assert/strict';
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

test('camera bounds are finite and preserve an inspectable world without gameplay-state writes',()=>{
  assert.match(html,/x:\{min:-13,max:13\},y:\{min:-13,max:13\},zoom:\{min:\.5,max:1\.25\},angle:\{min:28,max:62\}/);
  assert.match(html,/panWorldUnitsPerPixelX:-26\/mw/);
  assert.match(html,/panWorldUnitsPerPixelY:-26\/mh/);
  const start=html.indexOf('function grBattleCameraSource()');
  const end=html.indexOf('function fieldProject',start);
  assert.ok(start>=0&&end>start,'camera adapter block must exist');
  const cameraAdapter=html.slice(start,end);
  assert.doesNotMatch(cameraAdapter,/(?:state\.match\.target|me\.position|me\.plan\.path)\s*=/);
});
