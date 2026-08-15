import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PURSUIT_COMMITMENT_DOMAIN,
  PURSUIT_MODE_FINISHER,
  PURSUIT_MODE_NORMAL,
  PURSUIT_NO_HAND,
  PURSUIT_SECRET_ROUND_SCHEMA,
  applyHoneyWake,
  canonicalPursuitCommitmentPayload,
  commitPursuitSelection,
  createPursuitCommitment,
  createPursuitSecretRound,
  finalizePursuitSecretRound,
  getPursuitSecretRoundPublicState,
  removePursuitPhysicalMana,
  resolvePursuitCard,
  resolvePursuitRound,
  resolvePursuitTriad,
} from '../browser/pursuit-triad-core.mjs';

const HANDS = ['club', 'diamond', 'spade'];
const BEATS = { club: 'diamond', diamond: 'spade', spade: 'club' };

function independentWinnerIds(hands) {
  const unique = [...new Set(hands)];
  if (unique.length === 0 || unique.length === 3) return [];
  let winnerHand;
  if (unique.length === 1) {
    winnerHand = unique[0];
  } else {
    const [a, b] = unique;
    winnerHand = BEATS[a] === b ? a : b;
  }
  return hands.flatMap((hand, index) => hand === winnerHand ? [`p${index}`] : []);
}

function enumerateHands(playerCount, visit, prefix = []) {
  if (prefix.length === playerCount) return visit(prefix);
  for (const hand of HANDS) enumerateHands(playerCount, visit, [...prefix, hand]);
}

test('exhaustive 2p/3p/4p winner sets match an independent reference', () => {
  const expectedDistributions = {
    2: { 0: 0, 1: 6, 2: 3 },
    3: { 0: 6, 1: 9, 2: 9, 3: 3 },
    4: { 0: 36, 1: 12, 2: 18, 3: 12, 4: 3 },
  };
  for (const playerCount of [2, 3, 4]) {
    const distribution = Object.create(null);
    enumerateHands(playerCount, (hands) => {
      const selections = hands.map((hand, index) => ({ playerId: `p${index}`, hand }));
      const actual = resolvePursuitTriad(selections).winners;
      const expected = independentWinnerIds(hands);
      assert.deepEqual(actual, expected, `${playerCount}p ${hands.join('/')}`);
      distribution[actual.length] = (distribution[actual.length] ?? 0) + 1;
    });
    for (const [winnerCount, expectedCount] of Object.entries(expectedDistributions[playerCount])) {
      assert.equal(distribution[winnerCount] ?? 0, expectedCount, `${playerCount}p winners=${winnerCount}`);
    }
  }
});

test('same hand makes every participating player a winner', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'p2', hand: 'club' },
      { playerId: 'p1', hand: 'club' },
    ]).winners,
    ['p1', 'p2'],
  );
});

test('two-hand state returns every holder of the beating hand', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'a', hand: 'diamond' },
      { playerId: 'b', hand: 'club' },
      { playerId: 'c', hand: 'club' },
      { playerId: 'd', hand: 'diamond' },
    ]).winners,
    ['b', 'c'],
  );
});

test('three normal hands produce no pursuit winner', () => {
  assert.deepEqual(
    resolvePursuitTriad([
      { playerId: 'a', hand: 'club' },
      { playerId: 'b', hand: 'diamond' },
      { playerId: 'c', hand: 'spade' },
    ]).winners,
    [],
  );
});

test('no-hand is excluded from both winner and loser participation', () => {
  const result = resolvePursuitTriad([
    { playerId: 'a', hand: PURSUIT_NO_HAND },
    { playerId: 'b', hand: 'spade' },
    { playerId: 'c', hand: 'spade' },
  ]);
  assert.deepEqual(result.nonParticipants, ['a']);
  assert.deepEqual(result.participants, ['b', 'c']);
  assert.deepEqual(result.winners, ['b', 'c']);
});

test('Dark, Heart, unknown hands, duplicates, and malformed players fail closed', () => {
  for (const hand of ['dark', 'heart', 'rock', null, undefined]) {
    assert.throws(() => resolvePursuitTriad([{ playerId: 'a', hand }]), TypeError);
  }
  assert.throws(() => resolvePursuitTriad([
    { playerId: 'a', hand: 'club' },
    { playerId: 'a', hand: 'diamond' },
  ]), /duplicate playerId/);
  assert.throws(() => resolvePursuitTriad([{ playerId: '', hand: 'club' }]), TypeError);
});

test('normal and finisher addends apply only after a win', () => {
  assert.deepEqual(resolvePursuitCard({ won: true, value: 5, mode: PURSUIT_MODE_NORMAL }), {
    battleAddend: 5,
    disposition: 'battle',
  });
  assert.deepEqual(resolvePursuitCard({ won: true, value: 5, mode: PURSUIT_MODE_FINISHER }), {
    battleAddend: 10,
    disposition: 'battle',
  });
  assert.deepEqual(resolvePursuitCard({ won: false, value: 5, mode: PURSUIT_MODE_FINISHER }), {
    battleAddend: 0,
    disposition: 'subdeck',
  });
});

test('invalid pursuit values and modes fail closed', () => {
  for (const value of [0, 8, -1, 1.5, Number.NaN, Infinity]) {
    assert.throws(() => resolvePursuitCard({ won: true, value }), TypeError);
  }
  assert.throws(() => resolvePursuitCard({ won: true, value: 3, mode: 'dark' }), TypeError);
});

test('complete round keeps winners in Battle and sends nonwinners to subdeck', () => {
  const result = resolvePursuitRound({
    selections: [
      { playerId: 'a', hand: 'club' },
      { playerId: 'b', hand: 'diamond' },
      { playerId: 'c', hand: 'club' },
    ],
    cards: [
      { playerId: 'c', value: 2, mode: PURSUIT_MODE_FINISHER },
      { playerId: 'b', value: 7, mode: PURSUIT_MODE_NORMAL },
      { playerId: 'a', value: 4, mode: PURSUIT_MODE_NORMAL },
    ],
  });
  assert.deepEqual(result.outcomes, [
    { playerId: 'a', hand: 'club', won: true, value: 4, mode: 'normal', battleAddend: 4, disposition: 'battle' },
    { playerId: 'b', hand: 'diamond', won: false, value: 7, mode: 'normal', battleAddend: 0, disposition: 'subdeck' },
    { playerId: 'c', hand: 'club', won: true, value: 2, mode: 'finisher', battleAddend: 4, disposition: 'battle' },
  ]);
});

test('round rejects missing, duplicate, or nonparticipant pursuit cards', () => {
  const selections = [
    { playerId: 'a', hand: 'club' },
    { playerId: 'b', hand: PURSUIT_NO_HAND },
  ];
  assert.throws(() => resolvePursuitRound({ selections, cards: [] }), /match participating players/);
  assert.throws(() => resolvePursuitRound({ selections, cards: [
    { playerId: 'a', value: 1 },
    { playerId: 'a', value: 2 },
  ] }), /duplicate pursuit card/);
  assert.throws(() => resolvePursuitRound({ selections, cards: [{ playerId: 'b', value: 1 }] }), /non-participant|match participating players/);
});

test('physical pursuit card removal reduces max and clamps available mana', () => {
  assert.deepEqual(removePursuitPhysicalMana({ physicalManaCount: 7, availableMana: 7 }), {
    physicalManaCount: 6,
    maximumMana: 6,
    availableMana: 6,
  });
  assert.deepEqual(removePursuitPhysicalMana({ physicalManaCount: 4, availableMana: 1 }), {
    physicalManaCount: 3,
    maximumMana: 3,
    availableMana: 1,
  });
});

test('Honey wakes only existing physical mana and cannot restore lost maximum', () => {
  const afterPursuit = removePursuitPhysicalMana({ physicalManaCount: 7, availableMana: 2 });
  const afterHoney = applyHoneyWake({
    physicalManaCount: afterPursuit.physicalManaCount,
    availableMana: afterPursuit.availableMana,
    wakeCount: 99,
  });
  assert.deepEqual(afterHoney, {
    physicalManaCount: 6,
    maximumMana: 6,
    availableMana: 6,
  });
});

test('resolution is deterministic and independent of input arrival order', () => {
  const a = resolvePursuitTriad([
    { playerId: 'z', hand: 'diamond' },
    { playerId: 'a', hand: 'club' },
    { playerId: 'm', hand: PURSUIT_NO_HAND },
    { playerId: 'b', hand: 'club' },
  ]);
  const b = resolvePursuitTriad([
    { playerId: 'b', hand: 'club' },
    { playerId: 'm', hand: PURSUIT_NO_HAND },
    { playerId: 'a', hand: 'club' },
    { playerId: 'z', hand: 'diamond' },
  ]);
  assert.deepEqual(a, b);
  assert.deepEqual(a.winners, ['a', 'b']);
});

function sha256(payload) {
  return createHash('sha256').update(payload).digest('hex');
}

function secretReveal(playerId, hand, value, overrides = {}) {
  return {
    roundId: 'round-42',
    revision: 7,
    playerId,
    hand,
    cardId: `physical-card-${playerId}`,
    value,
    mode: PURSUIT_MODE_NORMAL,
    nonce: `nonce-${playerId}`,
    ...overrides,
  };
}

async function fullyCommittedRound(reveals) {
  let round = createPursuitSecretRound({
    roundId: reveals[0].roundId,
    revision: reveals[0].revision,
    participantIds: reveals.map((entry) => entry.playerId),
  });
  for (const reveal of reveals) {
    round = commitPursuitSelection(round, {
      roundId: reveal.roundId,
      revision: reveal.revision,
      playerId: reveal.playerId,
      commitment: await createPursuitCommitment(reveal, sha256),
    });
  }
  return round;
}

test('secret commitment payload is domain-separated and canonical', async () => {
  const reveal = secretReveal('b', 'club', 4, { mode: PURSUIT_MODE_FINISHER });
  const payload = canonicalPursuitCommitmentPayload(reveal);
  assert.equal(payload, JSON.stringify([
    PURSUIT_COMMITMENT_DOMAIN,
    'round-42',
    7,
    'b',
    'club',
    'physical-card-b',
    4,
    'finisher',
    'nonce-b',
  ]));
  assert.equal(await createPursuitCommitment(reveal, sha256), sha256(payload));
  await assert.rejects(() => createPursuitCommitment(reveal, (value) => value), /must not expose/);
});

test('pre-barrier public state exposes commitments and progress but no hidden selection fields', async () => {
  const a = secretReveal('a', 'club', 7);
  const b = secretReveal('b', 'diamond', 2);
  let round = createPursuitSecretRound({
    roundId: 'round-42',
    revision: 7,
    participantIds: ['b', 'a'],
  });
  round = commitPursuitSelection(round, {
    roundId: 'round-42',
    revision: 7,
    playerId: 'a',
    commitment: await createPursuitCommitment(a, sha256),
  });

  const publicState = getPursuitSecretRoundPublicState(round);
  assert.equal(publicState.schema, PURSUIT_SECRET_ROUND_SCHEMA);
  assert.deepEqual(publicState.participantIds, ['a', 'b']);
  assert.equal(publicState.phase, 'commit');
  assert.equal(publicState.committedCount, 1);
  assert.equal(publicState.allCommitted, false);

  const visible = JSON.stringify(publicState);
  for (const forbiddenKey of ['"hand"', '"cardId"', '"value"', '"nonce"']) {
    assert.equal(visible.includes(forbiddenKey), false, `leaked secret field key: ${forbiddenKey}`);
  }
  for (const secret of [a.hand, a.cardId, a.nonce, b.hand, b.cardId, b.nonce]) {
    assert.equal(visible.includes(secret), false, `leaked secret field: ${secret}`);
  }

  await assert.rejects(
    () => finalizePursuitSecretRound(round, [a, b], sha256),
    /reveal blocked until every expected participant has committed/,
  );
});

test('every expected participant must commit exactly once with matching round identity', async () => {
  const a = secretReveal('a', 'club', 3);
  let round = createPursuitSecretRound({
    roundId: 'round-42',
    revision: 7,
    participantIds: ['a', 'b'],
  });
  const commitment = await createPursuitCommitment(a, sha256);
  round = commitPursuitSelection(round, {
    roundId: 'round-42',
    revision: 7,
    playerId: 'a',
    commitment,
  });

  assert.throws(() => commitPursuitSelection(round, {
    roundId: 'round-42',
    revision: 7,
    playerId: 'a',
    commitment,
  }), /duplicate commitment/);
  assert.throws(() => commitPursuitSelection(round, {
    roundId: 'old-round',
    revision: 7,
    playerId: 'b',
    commitment: 'opaque',
  }), /roundId/);
  assert.throws(() => commitPursuitSelection(round, {
    roundId: 'round-42',
    revision: 6,
    playerId: 'b',
    commitment: 'opaque',
  }), /revision/);
  assert.throws(() => commitPursuitSelection(round, {
    roundId: 'round-42',
    revision: 7,
    playerId: 'outsider',
    commitment: 'opaque',
  }), /unknown pursuit participant/);
});

test('2p reveal is all-at-once, stable-order, resolver-compatible, and closes exactly once', async () => {
  const reveals = [
    secretReveal('z', 'diamond', 6),
    secretReveal('a', 'club', 4, { mode: PURSUIT_MODE_FINISHER }),
  ];
  const round = await fullyCommittedRound(reveals);
  assert.equal(getPursuitSecretRoundPublicState(round).phase, 'reveal-ready');

  const final = await finalizePursuitSecretRound(round, [reveals[0], reveals[1]], sha256);
  assert.deepEqual(final.snapshot, {
    selections: [
      { playerId: 'a', hand: 'club' },
      { playerId: 'z', hand: 'diamond' },
    ],
    cards: [
      { playerId: 'a', cardId: 'physical-card-a', value: 4, mode: 'finisher' },
      { playerId: 'z', cardId: 'physical-card-z', value: 6, mode: 'normal' },
    ],
  });
  assert.deepEqual(resolvePursuitRound(final.snapshot).outcomes, [
    { playerId: 'a', hand: 'club', won: true, value: 4, mode: 'finisher', battleAddend: 8, disposition: 'battle' },
    { playerId: 'z', hand: 'diamond', won: false, value: 6, mode: 'normal', battleAddend: 0, disposition: 'subdeck' },
  ]);
  assert.equal(getPursuitSecretRoundPublicState(final.round).phase, 'closed');
  assert.equal(JSON.stringify(final.round).includes('nonce-'), false);
  await assert.rejects(() => finalizePursuitSecretRound(final.round, reveals, sha256), /already closed/);
});

test('4p reveal uses stable participant order independent of reveal arrival order', async () => {
  const reveals = [
    secretReveal('p3', 'diamond', 3),
    secretReveal('p1', 'club', 1),
    secretReveal('p4', 'diamond', 4),
    secretReveal('p2', 'club', 2),
  ];
  const round = await fullyCommittedRound(reveals);
  const final = await finalizePursuitSecretRound(round, [reveals[2], reveals[0], reveals[3], reveals[1]], sha256);
  assert.deepEqual(final.snapshot.selections.map((entry) => entry.playerId), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(resolvePursuitRound(final.snapshot).triad.winners, ['p1', 'p2']);
});

test('reveal rejects missing, duplicate, unknown, stale, and commitment-mismatched payloads', async () => {
  const a = secretReveal('a', 'club', 1);
  const b = secretReveal('b', 'diamond', 2);
  const round = await fullyCommittedRound([a, b]);

  await assert.rejects(() => finalizePursuitSecretRound(round, [a], sha256), /every expected participant/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, a], sha256), /duplicate reveal/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, { ...b, playerId: 'x' }], sha256), /nonparticipant/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, { ...b, revision: 6 }], sha256), /revision/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, { ...b, roundId: 'other' }], sha256), /roundId/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, { ...b, nonce: 'tampered' }], sha256), /commitment mismatch/);
  await assert.rejects(() => finalizePursuitSecretRound(round, [a, { ...b, cardId: 'other-physical-card' }], sha256), /commitment mismatch/);
});

test('Dark, Heart, no-hand, missing physical identity, invalid value and invented mode fail closed before commitment', async () => {
  for (const hand of ['dark', 'heart', PURSUIT_NO_HAND]) {
    await assert.rejects(() => createPursuitCommitment(secretReveal('a', hand, 1), sha256), TypeError);
  }
  await assert.rejects(() => createPursuitCommitment(secretReveal('a', 'club', 1, { cardId: '' }), sha256), /cardId/);
  await assert.rejects(() => createPursuitCommitment(secretReveal('a', 'club', 8), sha256), /value/);
  await assert.rejects(() => createPursuitCommitment(secretReveal('a', 'club', 1, { mode: 'dark' }), sha256), /mode/);
});

test('nonce is externally supplied and never generated or retained by the round core', async () => {
  const reveal = secretReveal('a', 'club', 2, { nonce: '' });
  await assert.rejects(() => createPursuitCommitment(reveal, sha256), /nonce/);
  const round = createPursuitSecretRound({ roundId: 'round-42', revision: 7, participantIds: ['a', 'b'] });
  assert.equal(JSON.stringify(round).includes('nonce'), false);
});

test('secret round validates canonical state and participant constraints fail closed', () => {
  assert.throws(() => createPursuitSecretRound({ roundId: 'r', revision: 0, participantIds: ['a'] }), /between 2 and 4/);
  assert.throws(() => createPursuitSecretRound({ roundId: 'r', revision: 0, participantIds: ['a', 'a'] }), /duplicate/);
  assert.throws(() => createPursuitSecretRound({ roundId: '', revision: 0, participantIds: ['a', 'b'] }), /roundId/);
  assert.throws(() => createPursuitSecretRound({ roundId: 'r', revision: -1, participantIds: ['a', 'b'] }), /revision/);
});

test('secret round operations are deterministic and do not mutate caller inputs', async () => {
  const reveals = [
    secretReveal('b', 'diamond', 5),
    secretReveal('a', 'club', 3),
  ];
  const before = JSON.stringify(reveals);
  const roundA = await fullyCommittedRound(reveals);
  const roundB = await fullyCommittedRound(reveals.map((entry) => ({ ...entry })));
  assert.deepEqual(roundA, roundB);

  const finalA = await finalizePursuitSecretRound(roundA, reveals, sha256);
  const finalB = await finalizePursuitSecretRound(roundB, [reveals[1], reveals[0]], sha256);
  assert.deepEqual(finalA, finalB);
  assert.equal(JSON.stringify(reveals), before);
  assert.ok(Object.isFrozen(finalA.round));
  assert.ok(Object.isFrozen(finalA.snapshot));
  assert.ok(Object.isFrozen(finalA.snapshot.selections));
  assert.ok(Object.isFrozen(finalA.snapshot.cards));
});

const {
  PURSUIT_SECRET_ROUND_PERSISTENCE_SCHEMA,
  exportPursuitSecretRoundSnapshot,
  restorePursuitSecretRoundSnapshot,
} = await import('../browser/pursuit-triad-core.mjs');

function expectedRoundIdentity(round) {
  return {
    roundId: round.roundId,
    revision: round.revision,
    participantIds: [...round.participantIds].reverse(),
  };
}

test('authority-private persistence round-trips partial, full, and closed rounds with public-state equivalence', async () => {
  const a = secretReveal('a', 'club', 3);
  const b = secretReveal('b', 'diamond', 6);

  let partial = createPursuitSecretRound({ roundId: 'round-42', revision: 7, participantIds: ['b', 'a'] });
  partial = commitPursuitSelection(partial, {
    roundId: 'round-42', revision: 7, playerId: 'a', commitment: await createPursuitCommitment(a, sha256),
  });
  const full = await fullyCommittedRound([a, b]);
  const closed = (await finalizePursuitSecretRound(full, [b, a], sha256)).round;

  for (const round of [partial, full, closed]) {
    const snapshot = exportPursuitSecretRoundSnapshot(round);
    const restored = restorePursuitSecretRoundSnapshot(snapshot, expectedRoundIdentity(round));
    assert.equal(snapshot.persistenceSchema, PURSUIT_SECRET_ROUND_PERSISTENCE_SCHEMA);
    assert.deepEqual(Object.keys(snapshot).sort(), [
      'closed', 'commitments', 'participantIds', 'persistenceSchema', 'revision', 'roundId', 'schema',
    ]);
    assert.deepEqual(restored, round);
    assert.deepEqual(getPursuitSecretRoundPublicState(restored), getPursuitSecretRoundPublicState(round));
    assert.ok(Object.isFrozen(restored));
    assert.ok(Object.isFrozen(restored.participantIds));
    assert.ok(Object.isFrozen(restored.commitments));
    for (const commitment of restored.commitments) assert.ok(Object.isFrozen(commitment));
  }
});

test('snapshot restore requires the caller expected round identity and rejects mismatches', async () => {
  const round = await fullyCommittedRound([
    secretReveal('a', 'club', 1),
    secretReveal('b', 'diamond', 2),
  ]);
  const snapshot = exportPursuitSecretRoundSnapshot(round);
  const expected = expectedRoundIdentity(round);

  assert.throws(() => restorePursuitSecretRoundSnapshot(snapshot, { ...expected, roundId: 'other-round' }), /roundId/);
  assert.throws(() => restorePursuitSecretRoundSnapshot(snapshot, { ...expected, revision: 6 }), /revision/);
  assert.throws(() => restorePursuitSecretRoundSnapshot(snapshot, { ...expected, participantIds: ['a', 'c'] }), /participantIds/);
  assert.throws(() => restorePursuitSecretRoundSnapshot(snapshot, { ...expected, participantIds: ['a'] }), /between 2 and 4/);
});

test('snapshot restore rejects malformed, extra-field, duplicate, noncanonical, and impossible state', async () => {
  const a = secretReveal('a', 'club', 1);
  let partial = createPursuitSecretRound({ roundId: 'round-42', revision: 7, participantIds: ['a', 'b'] });
  partial = commitPursuitSelection(partial, {
    roundId: 'round-42', revision: 7, playerId: 'a', commitment: await createPursuitCommitment(a, sha256),
  });
  const snapshot = exportPursuitSecretRoundSnapshot(partial);
  const expected = expectedRoundIdentity(partial);

  assert.throws(() => restorePursuitSecretRoundSnapshot({ ...snapshot, nonce: 'forbidden' }, expected), /fields/);
  assert.throws(() => restorePursuitSecretRoundSnapshot({ ...snapshot, persistenceSchema: 'unknown' }, expected), /persistence schema/);
  assert.throws(() => restorePursuitSecretRoundSnapshot({ ...snapshot, participantIds: ['b', 'a'] }, expected), /canonical sorted order/);
  assert.throws(() => restorePursuitSecretRoundSnapshot({ ...snapshot, closed: true }, expected), /every participant commitment/);
  assert.throws(() => restorePursuitSecretRoundSnapshot({
    ...snapshot,
    commitments: [snapshot.commitments[0], snapshot.commitments[0]],
  }, expected), /duplicate commitment/);
  assert.throws(() => restorePursuitSecretRoundSnapshot({
    ...snapshot,
    commitments: [{ ...snapshot.commitments[0], nonce: 'forbidden' }],
  }, expected), /fields/);
});

test('snapshot persists no reveal secrets and restore is deeply immutable and non-aliasing', async () => {
  const reveals = [
    secretReveal('b', 'diamond', 5, { mode: PURSUIT_MODE_FINISHER, nonce: 'never-persist-b' }),
    secretReveal('a', 'club', 3, { nonce: 'never-persist-a' }),
  ];
  const round = await fullyCommittedRound(reveals);
  const snapshot = exportPursuitSecretRoundSnapshot(round);
  const visible = JSON.stringify(snapshot);

  for (const forbiddenKey of ['"hand"', '"cardId"', '"value"', '"mode"', '"nonce"']) {
    assert.equal(visible.includes(forbiddenKey), false, `persisted secret key: ${forbiddenKey}`);
  }
  for (const reveal of reveals) {
    for (const secret of [reveal.hand, reveal.cardId, reveal.mode, reveal.nonce]) {
      assert.equal(visible.includes(secret), false, `persisted reveal secret: ${secret}`);
    }
  }

  const portable = JSON.parse(visible);
  const restored = restorePursuitSecretRoundSnapshot(portable, expectedRoundIdentity(round));
  assert.notStrictEqual(restored.participantIds, portable.participantIds);
  assert.notStrictEqual(restored.commitments, portable.commitments);
  assert.notStrictEqual(restored.commitments[0], portable.commitments[0]);
  const restoredBeforeMutation = JSON.stringify(restored);
  portable.participantIds[0] = 'tampered';
  portable.commitments[0].commitment = 'tampered';
  assert.equal(JSON.stringify(restored), restoredBeforeMutation);
});

const {
  persistPursuitSecretRoundSnapshot,
  loadPursuitSecretRoundSnapshot,
} = await import('../browser/pursuit-triad-core.mjs');

test('persistence I/O bridge writes only the authority-private snapshot and restores by expected identity', async () => {
  const reveals = [
    secretReveal('a', 'club', 3, { nonce: 'never-store-a' }),
    secretReveal('b', 'diamond', 5, { nonce: 'never-store-b', mode: PURSUIT_MODE_FINISHER }),
  ];
  const round = await fullyCommittedRound(reveals);
  let stored;
  const returned = await persistPursuitSecretRoundSnapshot(round, async (snapshot) => {
    stored = JSON.parse(JSON.stringify(snapshot));
  });

  assert.deepEqual(returned, exportPursuitSecretRoundSnapshot(round));
  const serialized = JSON.stringify(stored);
  for (const forbiddenKey of ['"hand"', '"cardId"', '"value"', '"mode"', '"nonce"']) {
    assert.equal(serialized.includes(forbiddenKey), false, `bridge persisted secret key: ${forbiddenKey}`);
  }
  for (const reveal of reveals) {
    assert.equal(serialized.includes(reveal.cardId), false);
    assert.equal(serialized.includes(reveal.nonce), false);
  }

  const restored = await loadPursuitSecretRoundSnapshot(async () => stored, expectedRoundIdentity(round));
  assert.deepEqual(restored, round);
  assert.deepEqual(getPursuitSecretRoundPublicState(restored), getPursuitSecretRoundPublicState(round));
});

test('persistence I/O bridge fails closed on missing I/O, storage errors, malformed bytes, and identity mismatch', async () => {
  const round = await fullyCommittedRound([
    secretReveal('a', 'club', 1),
    secretReveal('b', 'diamond', 2),
  ]);
  const snapshot = exportPursuitSecretRoundSnapshot(round);

  await assert.rejects(() => persistPursuitSecretRoundSnapshot(round), /saveSnapshot must be a function/);
  await assert.rejects(() => loadPursuitSecretRoundSnapshot(), /loadSnapshot must be a function/);
  await assert.rejects(
    () => persistPursuitSecretRoundSnapshot(round, async () => { throw new Error('STORE_DOWN'); }),
    /STORE_DOWN/,
  );
  await assert.rejects(
    () => loadPursuitSecretRoundSnapshot(async () => ({ ...snapshot, nonce: 'forbidden' }), expectedRoundIdentity(round)),
    /fields/,
  );
  await assert.rejects(
    () => loadPursuitSecretRoundSnapshot(async () => snapshot, { ...expectedRoundIdentity(round), roundId: 'other' }),
    /roundId/,
  );
});
