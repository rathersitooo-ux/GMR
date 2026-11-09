import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../browser/GAMEROAD.html', import.meta.url), 'utf8');

test('battle field uses the night-arena theme from the restyled sample, not the green grassland', () => {
  // Sky / fog: deep indigo, not pale blue-green.
  assert.ok(html.includes('gl.clearColor(.10,.10,.22,1)'), 'clear colour is deep indigo');
  assert.ok(html.includes('vec3(.14,.13,.32)'), 'fog haze is deep indigo');
  assert.ok(!html.includes('gl.clearColor(.45,.66,.73,1)'), 'old pale sky is gone');
  assert.ok(!html.includes('vec3(.54,.69,.63)'), 'old greenish haze is gone');
  // Terrain: blue-dominant, not green-dominant.
  assert.ok(
    html.includes('[.10+.030*v+.020*meadow,.10+.030*v+.020*meadow,.30+.050*v+.080*meadow]'),
    'terrain colour is blue-dominant',
  );
  assert.ok(
    !html.includes('[.145+.030*v+.028*meadow,.34+.060*v+.105*meadow,.12+.025*v+.018*meadow]'),
    'old green terrain is gone',
  );
  // Trails are thin dark-gold lines, tiles are indigo, grass tufts are indigo light.
  assert.ok(
    html.includes('pushTrailSegment(arr,pts[i-1],pts[i],.45,[.30,.24,.11])'),
    'lane trails are thin dark-gold lines',
  );
  assert.ok(html.includes('[.34,.32,.60]'), 'active road tiles are indigo');
  assert.ok(html.includes('[.20,.18,.38]'), 'inactive road tiles are indigo');
  assert.ok(!html.includes('[.30,.30,.19]'), 'old brown trails are gone');
  // Battle chrome background is indigo, not dark green.
  assert.ok(html.includes('background:#0d0d26'), 'battle map background is indigo');
  assert.ok(html.includes('background:#141433'), 'field canvas background is indigo');
  assert.ok(!html.includes('background:#0a1b17'), 'old green battle background is gone');
  assert.ok(!html.includes('background:#123d3d'), 'old teal canvas background is gone');
  // Live-board drawing (used once the central world mounts) follows the same theme.
  assert.ok(html.includes('lowerColor=[.20,.18,.44]'), 'shared-field cells are indigo');
  assert.ok(html.includes('faintGoal=[.22,.20,.38]'), 'faint goal branches are indigo');
  assert.ok(!html.includes('lowerColor=[.42,.58,.47]'), 'old green shared-field colour is gone');
});

test('built-card label pool is declared before renderField3D uses it', () => {
  // The pool used to live inside renderField3D after its first use, so every
  // live-board render threw "Cannot access liveBuiltCardLabelPool before
  // initialization". It must be a single top-level declaration placed before
  // the function, so the pool survives across renders.
  const poolAt = html.indexOf('let liveBuiltCardLabelPool=[];');
  const fnAt = html.indexOf('function renderField3D(){');
  assert.ok(poolAt >= 0, 'pool declaration exists');
  assert.ok(fnAt > poolAt, 'pool is declared before renderField3D');
  assert.equal(html.split('let liveBuiltCardLabelPool=[];').length - 1, 1, 'pool declared once');
  assert.ok(html.includes('syncLiveBuiltCardLabels(builtCardLabels)'), 'labels still sync on live boards');
});

test('road tiles have a thin gold edge from the v2 gold trail colour', () => {
  // 33番の「金のふちのマス」：道のマスの下に、マスより少しだけ大きい金の板を敷く。
  // マスの色とプレイヤーの色は変えない。ふちは2か所に要る。本物の対戦では
  // 新しい盤（R8の生きた盤）が動いていて、古い描き方（fallback）の板は出ないため、
  // 生きた盤のマス（roundCells）の下にも金の板を敷く。
  // ふちの出っ張りは片側0.12（対戦のカメラの距離でも金のふちと読める幅）。
  // 色は、それぞれの盤の「金の道」と同じ金にする。古い描き方は v2 の金の道
  // [.30,.24,.11]、生きた盤の道は graphColor（明るい金）。生きた盤の
  // 下のマスは暗い色なので、明るい金の方がふちとして読める。
  assert.equal(html.split(`'tileEdge'`).length - 1, 2, 'gold tile edge exists in both render paths');
  assert.ok(
    html.includes(`active.has(id)?1.12:1.02,active.has(id)?.09:.02,active.has(id)?1.12:1.02,[.30,.24,.11],'tileEdge'`),
    'fallback: gold edge is wider than the tile by 0.12 per side',
  );
  assert.ok(
    html.includes(`box(q.x,q.y+.03,q.z,.72,.02,.72,graphColor,'tileEdge')`),
    'live board: gold edge is wider than the cell by 0.12 per side, in the live trail gold',
  );
});

test('night-arena effects mount is wired next to the other battle mounts', () => {
  // 33番の光る模様・TURNの丸い飾りの取り付け部品が、対戦画面の取り付けの列につながっている。
  assert.ok(html.includes(`import('./battle-night-arena-effects-mount.mjs')`), 'mount module is imported');
  assert.ok(html.includes(`createNightArenaRemainingEffectsMount`), 'mount is created');
  assert.ok(html.includes(`getBattleMap:()=>document.querySelector('#battleMap')`), 'mount reads the battle map');
  assert.ok(html.includes(`getPhaseHeader:()=>document.querySelector('.battlePhaseHeader')`), 'mount reads the turn header');
});

test('friend-room late entry records the battle-start unseen flag', () => {
  // 35番：参加者が遅れて入った（対戦中で1巡目でない）とき、「見られなかった」
  // （participant-entry）の旗を残す。次は題だけ出す。
  assert.ok(html.includes(`mount.recordUnseen('participant-entry')`), 'late entry records participant-entry');
  assert.ok(html.includes(`roomState==='playing'&&match.round!==1`), 'late entry is detected');
});
