import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NEW_BASE_MATCH_PARTICIPANT_COUNT,
  NEW_BASE_MATCH_ROAD_DEPTH,
  NEW_BASE_MATCH_SHIELD_COUNT,
  NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT,
  bindNewBaseShieldRoadOwnership,
  projectNewBaseMatchParticipants,
} from '../browser/new-base-match-ownership-adapter.mjs';

function free4pMatch() {
  return {
    format: 'FREE4P',
    seats: [
      { slot: 2, kind: 'HUMAN', clientId: 'H3', team: null },
      { slot: 0, kind: 'HUMAN', clientId: 'H1', team: null },
      { slot: 3, kind: 'AI', aiId: 'AI4', team: null },
      { slot: 1, kind: 'HUMAN', clientId: 'H2', team: null },
    ],
  };
}

function team2v2Match() {
  return {
    format: 'TEAM2V2',
    seats: [
      { slot: 3, kind: 'AI', aiId: 'AI4', team: 0 },
      { slot: 1, kind: 'HUMAN', clientId: 'H2', team: 0 },
      { slot: 0, kind: 'HUMAN', clientId: 'H1', team: 1 },
      { slot: 2, kind: 'AI', aiId: 'AI3', team: 1 },
    ],
  };
}

function makeShieldAnchors(projection) {
  const shields = [];
  const participants = projection.participants.map((participant, participantIndex) => {
    const shieldIds = [];
    for (let shieldIndex = 1; shieldIndex <= NEW_BASE_MATCH_SHIELDS_PER_PARTICIPANT; shieldIndex += 1) {
      const shieldId = `SHIELD:${participant.participantId}:${shieldIndex}`;
      shieldIds.push(shieldId);
      shields.push({
        shieldId,
        participantId: participant.participantId,
        team: participant.teamId,
        participantIndex,
        shieldIndex,
      });
    }
    return {
      participantId: participant.participantId,
      team: participant.teamId,
      participantIndex,
      shieldIds,
    };
  });
  return {
    shieldIds: shields.map((shield) => shield.shieldId),
    shields,
    participants,
  };
}

function makeRoadColumns(shieldIds) {
  return shieldIds.map((shieldId, columnIndex) => ({
    shieldId,
    columnIndex,
    slots: Array.from({ length: NEW_BASE_MATCH_ROAD_DEPTH }, (_, slotIndex) => ({
      slotId: `ROAD_SLOT:${shieldId}:${slotIndex + 1}`,
      shieldId,
      columnIndex,
      depth: slotIndex + 1,
    })),
  }));
}

function compose(match) {
  const projection = projectNewBaseMatchParticipants(match);
  const shieldAnchors = makeShieldAnchors(projection);
  const roadColumns = makeRoadColumns(shieldAnchors.shieldIds);
  return { projection, shieldAnchors, roadColumns };
}

test('projects current FREE4P seats into four stable teamless seat-owned participants', () => {
  const projection = projectNewBaseMatchParticipants(free4pMatch());

  assert.equal(NEW_BASE_MATCH_PARTICIPANT_COUNT, 4);
  assert.equal(projection.format, 'FREE4P');
  assert.deepEqual(
    projection.participants.map(({ slot, seatId, participantId, playerId, playerKind, teamId }) => ({
      slot, seatId, participantId, playerId, playerKind, teamId,
    })),
    [
      { slot: 0, seatId: 'SLOT:0', participantId: 'SLOT:0', playerId: 'H1', playerKind: 'HUMAN', teamId: null },
      { slot: 1, seatId: 'SLOT:1', participantId: 'SLOT:1', playerId: 'H2', playerKind: 'HUMAN', teamId: null },
      { slot: 2, seatId: 'SLOT:2', participantId: 'SLOT:2', playerId: 'H3', playerKind: 'HUMAN', teamId: null },
      { slot: 3, seatId: 'SLOT:3', participantId: 'SLOT:3', playerId: 'AI4', playerKind: 'AI', teamId: null },
    ],
  );
  assert.deepEqual(projection.shieldParticipants, [
    { id: 'SLOT:0', team: null },
    { id: 'SLOT:1', team: null },
    { id: 'SLOT:2', team: null },
    { id: 'SLOT:3', team: null },
  ]);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.participants[0].shieldParticipant), true);
});

test('TEAM2V2 preserves authoritative team values instead of inferring teams from seat order', () => {
  const projection = projectNewBaseMatchParticipants(team2v2Match());

  assert.deepEqual(projection.participants.map((participant) => participant.teamId), ['1', '0', '1', '0']);
  assert.deepEqual(
    projection.participants.filter((participant) => participant.teamId === '1').map((participant) => participant.seatId),
    ['SLOT:0', 'SLOT:2'],
  );
  assert.deepEqual(
    projection.participants.filter((participant) => participant.teamId === '0').map((participant) => participant.seatId),
    ['SLOT:1', 'SLOT:3'],
  );
});

test('binds exactly three Shields per seat and one ROAD column per Shield while preserving owner identity', () => {
  const { shieldAnchors, roadColumns } = compose(team2v2Match());
  const ownership = bindNewBaseShieldRoadOwnership({
    match: team2v2Match(),
    shieldAnchors,
    roadColumns,
  });

  assert.equal(NEW_BASE_MATCH_SHIELD_COUNT, 12);
  assert.equal(ownership.shields.length, 12);
  assert.equal(ownership.roadColumns.length, 12);
  assert.equal(new Set(ownership.shields.map((shield) => shield.shieldId)).size, 12);

  for (const participant of ownership.participants) {
    const shields = ownership.shields.filter((shield) => shield.participantId === participant.participantId);
    assert.equal(shields.length, 3);
    assert.deepEqual(shields.map((shield) => shield.shieldIndex).sort(), [1, 2, 3]);
    assert.ok(shields.every((shield) => shield.seatId === participant.seatId));
    assert.ok(shields.every((shield) => shield.playerId === participant.playerId));
    assert.ok(shields.every((shield) => shield.teamId === participant.teamId));
  }

  for (const column of ownership.roadColumns) {
    const shield = ownership.shields.find((candidate) => candidate.shieldId === column.shieldId);
    assert.ok(shield);
    assert.equal(column.participantId, shield.participantId);
    assert.equal(column.seatId, shield.seatId);
    assert.equal(column.playerId, shield.playerId);
    assert.equal(column.teamId, shield.teamId);
    assert.equal(column.slotIds.length, 7);
  }

  assert.equal(Object.isFrozen(ownership), true);
  assert.equal(Object.isFrozen(ownership.roadColumns[0].slotIds), true);
});

test('fails closed when FREE4P contains a team or TEAM2V2 is not two authoritative teams of two', () => {
  const badFree = free4pMatch();
  badFree.seats[0].team = 0;
  assert.throws(() => projectNewBaseMatchParticipants(badFree), /FREE4P seats must remain teamless/);

  const badTeams = team2v2Match();
  badTeams.seats[0].team = 2;
  assert.throws(() => projectNewBaseMatchParticipants(badTeams), /exactly two authoritative teams of two/);
});

test('fails closed on duplicate authoritative player identity', () => {
  const match = free4pMatch();
  match.seats[3] = { slot: 1, kind: 'HUMAN', clientId: 'H1', team: null };
  assert.throws(() => projectNewBaseMatchParticipants(match), /duplicate authoritative player id: H1/);
});

test('fails closed when a Shield changes participant or team ownership', () => {
  const { shieldAnchors, roadColumns } = compose(team2v2Match());
  shieldAnchors.shields[0].team = '0';

  assert.throws(
    () => bindNewBaseShieldRoadOwnership({ match: team2v2Match(), shieldAnchors, roadColumns }),
    /team ownership mismatch/,
  );
});

test('fails closed when ROAD columns are duplicated, foreign, reordered, or structurally malformed', () => {
  const foreign = compose(free4pMatch());
  foreign.roadColumns[0].shieldId = 'FOREIGN';
  assert.throws(
    () => bindNewBaseShieldRoadOwnership({ match: free4pMatch(), shieldAnchors: foreign.shieldAnchors, roadColumns: foreign.roadColumns }),
    /must bind the corresponding known Shield id/,
  );

  const duplicate = compose(free4pMatch());
  duplicate.roadColumns[1].shieldId = duplicate.roadColumns[0].shieldId;
  assert.throws(
    () => bindNewBaseShieldRoadOwnership({ match: free4pMatch(), shieldAnchors: duplicate.shieldAnchors, roadColumns: duplicate.roadColumns }),
    /duplicate ROAD column Shield id/,
  );

  const malformed = compose(free4pMatch());
  malformed.roadColumns[0].slots[6].depth = 6;
  assert.throws(
    () => bindNewBaseShieldRoadOwnership({ match: free4pMatch(), shieldAnchors: malformed.shieldAnchors, roadColumns: malformed.roadColumns }),
    /structural identity mismatch/,
  );
});
