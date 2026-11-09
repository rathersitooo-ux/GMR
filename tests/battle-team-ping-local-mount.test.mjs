import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createBattleTeamPingLocalMount } from '../browser/battle-team-ping-local-mount.mjs';

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

function createMount(match, presented = []) {
  return createBattleTeamPingLocalMount({
    getMatch: () => match,
    presentPing: ({ viewerId, ping }) => {
      presented.push({ viewerId, intent: ping.intent, sequence: ping.sequence });
      return true;
    },
    recordPing: () => {},
  });
}

test('team ping mounts for local 2v2: public board target is accepted and presented once per viewer', () => {
  const match = fakeMatch();
  const presented = [];
  const mount = createMount(match, presented);
  const result = mount.submit('P1', 'ATTACK_INTENT', { kind: 'board', id: 'S:P3:C' });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.ping.teamId, 'A');
  assert.equal(result.ping.targetRef.kind, 'board');
  assert.equal(result.ping.targetRef.id, 'S:P3:C');
  // 送り手と組の仲間の両方へ届けが付く。表示の回数は各1回。
  assert.deepEqual(presented.map((entry) => entry.viewerId), ['P1', 'P2']);
  assert.equal(mount.recordedEvents().length, 1);
});

test('team ping folds a duplicate intent on the same target and replaces on a different intent', () => {
  const match = fakeMatch();
  const mount = createMount(match);
  const first = mount.submit('P1', 'HELP', { kind: 'player', id: 'P2' });
  assert.equal(first.ok, true);
  const folded = mount.submit('P1', 'HELP', { kind: 'player', id: 'P2' });
  assert.equal(folded.ok, true);
  assert.equal(folded.status, 'folded');
  assert.equal(folded.notify, false);
  const replaced = mount.submit('P1', 'ACK', { kind: 'player', id: 'P2' });
  assert.equal(replaced.ok, true);
  assert.equal(replaced.status, 'replaced');
  assert.equal(mount.recordedEvents().length, 2);
});

test('team ping refuses secret targets and non-2v2 matches', () => {
  const match = fakeMatch();
  const mount = createMount(match);
  assert.equal(mount.submit('P1', 'ATTACK_INTENT', { kind: 'hand', id: 'CARD_1' }).ok, false);
  assert.equal(mount.submit('P1', 'ATTACK_INTENT', { kind: 'hand', id: 'CARD_1' }).reason, 'TARGET_NOT_PUBLIC');
  assert.equal(mount.submit('P1', 'ATTACK_INTENT', { kind: 'board', id: 'S:P9:C' }).reason, 'TARGET_NOT_PUBLIC');
  assert.equal(mount.submit('P1', 'ATTACK_INTENT', { kind: 'board', id: 'H:P1:C' }).reason, 'TARGET_NOT_PUBLIC');
  const freeForAll = fakeMatch('4p');
  const freeMount = createMount(freeForAll);
  assert.equal(freeMount.submit('P1', 'ATTENTION').reason, 'TEAM_UNRESOLVED');
  const finished = fakeMatch();
  finished.lastResult = { ranking: [] };
  const finishedMount = createMount(finished);
  assert.equal(finishedMount.submit('P1', 'ATTENTION').reason, 'ADMISSION_DENIED');
});

test('team ping read is limited to the same team', () => {
  const match = fakeMatch();
  const mount = createMount(match);
  mount.submit('P1', 'WAIT');
  assert.equal(mount.readForViewer('P2', 'A').ok, true);
  assert.equal(mount.readForViewer('P2', 'A').pings.length, 1);
  assert.equal(mount.readForViewer('P3', 'A').ok, false);
  assert.equal(mount.readForViewer('P3', 'A').reason, 'TEAM_ACCESS_DENIED');
  assert.equal(mount.readForViewer('P3', 'B').pings.length, 0);
});

test('battle screen wires the local team ping mount and ships its modules', () => {
  const html = readFileSync(path.join(ROOT, 'browser/GAMEROAD.html'), 'utf8');
  assert.equal(html.split('./battle-team-ping-local-mount.mjs').length - 1, 1);
  for (const intent of ['ATTENTION', 'ATTACK_INTENT', 'DEFEND_INTENT', 'HELP', 'WAIT', 'ACK']) {
    assert.ok(html.includes(`data-ping-intent="${intent}"`), `missing ping button ${intent}`);
  }
  assert.ok(html.includes('id="teamPingBox"'));
  const build = readFileSync(path.join(ROOT, 'deploy/cloudflare/scripts/build.mjs'), 'utf8');
  for (const file of ['battle-team-ping-core.mjs', 'battle-team-ping-live-adapter.mjs', 'battle-team-ping-local-mount.mjs']) {
    assert.ok(build.includes(`source: 'browser/${file}'`), `build must ship ${file}`);
  }
});
