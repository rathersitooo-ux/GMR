import test from 'node:test';
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
