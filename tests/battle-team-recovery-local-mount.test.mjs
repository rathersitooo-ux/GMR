import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBattleTeamRecoveryLocalMount } from '../browser/battle-team-recovery-local-mount.mjs';
import { projectBattleRecoveryPresentation } from '../browser/battle-recovery-presentation-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 現地の2v2（P1人間＋P2相棒＝A組、P3＋P4＝B組）だけの形。
function fakeMatch(mode = '2v2') {
  return {
    id: 'M-test',
    mode,
    round: 1,
    phase: 'plan',
    lastResult: null,
    players: [
      { id: 'P1', name: 'あなた', human: true, team: 'A' },
      { id: 'P2', name: 'PLAYER 2', human: false, team: 'A' },
      { id: 'P3', name: 'PLAYER 3', human: false, team: 'B' },
      { id: 'P4', name: 'PLAYER 4', human: false, team: 'B' },
    ],
  };
}

function createMount(match, { delegated = false, synced = [] } = {}) {
  return createBattleTeamRecoveryLocalMount({
    getMatch: () => match,
    isPartnerDelegated: () => delegated,
    getHost: () => ({}),
    getPreferences: () => ({ reducedMotion: false, lowPerformance: false }),
    mountSurface: () => ({
      sync: (input) => {
        synced.push(input);
        return projectBattleRecoveryPresentation(input);
      },
    }),
    onInputLock: () => {},
  });
}

test('team recovery mounts for local 2v2: self control stays ready and hidden', () => {
  const match = fakeMatch();
  const synced = [];
  const mount = createMount(match, { synced });
  const result = mount.sync();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'READY');
  assert.equal(result.shown, false);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].status, 'READY');
  assert.equal(mount.snapshot().seats.length, 4);
  assert.equal(mount.snapshot().seats[0].controlMode, 'self');
});

test('team recovery shows waiting while the partner holds the local seat', () => {
  const match = fakeMatch();
  const synced = [];
  const mount = createMount(match, { delegated: true, synced });
  const result = mount.sync();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WAITING');
  assert.equal(result.shown, true);
  assert.equal(synced[0].status, 'WAITING');
  assert.equal(mount.snapshot().seats[0].controlMode, 'temporary_partner');
  assert.equal(mount.snapshot().seats[0].connected, false);
});

test('team recovery returns to ready when delegation ends', () => {
  const match = fakeMatch();
  let delegated = true;
  const synced = [];
  const mount = createBattleTeamRecoveryLocalMount({
    getMatch: () => match,
    isPartnerDelegated: () => delegated,
    getHost: () => ({}),
    getPreferences: () => ({ reducedMotion: false, lowPerformance: false }),
    mountSurface: () => ({
      sync: (input) => {
        synced.push(input);
        return projectBattleRecoveryPresentation(input);
      },
    }),
  });
  assert.equal(mount.sync().status, 'WAITING');
  delegated = false;
  const back = mount.sync();
  assert.equal(back.ok, true);
  assert.equal(back.status, 'READY');
  assert.equal(back.shown, false);
  assert.equal(mount.snapshot().seats[0].controlMode, 'self');
  assert.equal(mount.snapshot().seats[0].connected, true);
});

test('team recovery hides outside local 2v2 battles', () => {
  const freeForAll = fakeMatch('4p');
  const freeMount = createMount(freeForAll);
  const free = freeMount.sync();
  assert.equal(free.ok, true);
  assert.equal(free.shown, false);
  assert.equal(free.reason, 'NOT_2V2_BATTLE');
  const finished = fakeMatch();
  finished.lastResult = { ranking: [] };
  const finishedMount = createMount(finished);
  assert.equal(finishedMount.sync().reason, 'NOT_2V2_BATTLE');
  const noMatch = createBattleTeamRecoveryLocalMount({
    getMatch: () => null,
    isPartnerDelegated: () => false,
    getHost: () => ({}),
  });
  assert.equal(noMatch.sync().reason, 'NOT_2V2_BATTLE');
});

test('team recovery refuses a match without two teams of two', () => {
  const match = fakeMatch();
  match.players[3].team = 'A';
  const mount = createMount(match);
  const result = mount.sync();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'SEATS_INVALID');
});

test('battle screen wires the local team recovery mount and ships its modules', () => {
  const html = readFileSync(path.join(ROOT, 'browser/GAMEROAD.html'), 'utf8');
  assert.equal(html.split('./battle-team-recovery-local-mount.mjs').length - 1, 1);
  assert.ok(html.includes('syncTeamRecovery()'), 'renderBattle must sync team recovery');
  const build = readFileSync(path.join(ROOT, 'deploy/cloudflare/scripts/build.mjs'), 'utf8');
  for (const file of ['battle-2v2-reconnect-core.mjs', 'battle-recovery-live-adapter.mjs', 'battle-recovery-runtime-surface.mjs', 'battle-team-recovery-local-mount.mjs']) {
    assert.ok(build.includes(`source: 'browser/${file}'`), `build must ship ${file}`);
  }
});
