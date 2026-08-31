import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SECRET_COMMIT_REVEAL_ROUND_SCHEMA,
  commitSecretSelection,
  createSecretCommitRevealRound,
  finalizeSecretCommitRevealRound,
  getSecretCommitRevealPublicState,
} from '../browser/secret-commit-reveal-barrier-core.mjs';

function makeRound(participantIds = ['p4', 'p2', 'p1', 'p3']) {
  return createSecretCommitRevealRound({
    roundId: 'round-7',
    revision: 3,
    participantIds,
  });
}

function commitAll(round, participantIds = ['p3', 'p1', 'p4', 'p2']) {
  return participantIds.reduce((current, participantId) => commitSecretSelection(current, {
    roundId: 'round-7',
    revision: 3,
    participantId,
    commitment: `opaque:${participantId}`,
  }), round);
}

function reveal(participantId, secret = `secret:${participantId}`) {
  return {
    roundId: 'round-7',
    revision: 3,
    participantId,
    payload: { secret, nonce: `nonce:${participantId}` },
  };
}

async function verify({ participantId, commitment, payload }) {
  return {
    ok: commitment === `opaque:${participantId}` && payload.secret === `secret:${participantId}`,
    publicValue: { hand: `hand:${participantId}` },
  };
}

test('creates canonical immutable 2-4 participant round and exposes commitments only', () => {
  const round = makeRound();
  assert.equal(round.schema, SECRET_COMMIT_REVEAL_ROUND_SCHEMA);
  assert.deepEqual(round.participantIds, ['p1', 'p2', 'p3', 'p4']);
  assert.equal(Object.isFrozen(round), true);
  assert.equal(Object.isFrozen(round.participantIds), true);

  const publicState = getSecretCommitRevealPublicState(round);
  assert.equal(publicState.phase, 'commit');
  assert.equal(publicState.committedCount, 0);
  assert.equal(publicState.expectedCount, 4);
  assert.equal(publicState.allCommitted, false);
  assert.deepEqual(publicState.commitments, []);
  assert.equal('reveals' in publicState, false);
  assert.equal('payload' in publicState, false);
});

test('commit is order-independent, opaque, and reveal is blocked before everyone commits', async () => {
  const original = makeRound();
  const once = commitSecretSelection(original, {
    roundId: 'round-7',
    revision: 3,
    participantId: 'p3',
    commitment: 'opaque:p3',
  });

  assert.deepEqual(original.commitments, []);
  assert.deepEqual(once.commitments, [{ participantId: 'p3', commitment: 'opaque:p3' }]);
  assert.equal(getSecretCommitRevealPublicState(once).phase, 'commit');
  await assert.rejects(
    finalizeSecretCommitRevealRound(once, [reveal('p1'), reveal('p2'), reveal('p3'), reveal('p4')], verify),
    /reveal blocked until every expected participant has committed/,
  );
});

test('all commitments flip one shared barrier to reveal-ready', () => {
  const ready = commitAll(makeRound());
  const publicState = getSecretCommitRevealPublicState(ready);
  assert.equal(publicState.phase, 'reveal-ready');
  assert.equal(publicState.allCommitted, true);
  assert.equal(publicState.committedCount, 4);
  assert.deepEqual(publicState.commitments.map(({ participantId }) => participantId), ['p1', 'p2', 'p3', 'p4']);
});

test('simultaneous finalize verifies every reveal then publishes one canonical snapshot', async () => {
  const ready = commitAll(makeRound());
  const input = [reveal('p4'), reveal('p2'), reveal('p1'), reveal('p3')];
  const before = structuredClone(input);
  const verifiedOrder = [];

  const result = await finalizeSecretCommitRevealRound(ready, input, async (context) => {
    verifiedOrder.push(context.participantId);
    assert.equal(context.commitment, `opaque:${context.participantId}`);
    return verify(context);
  });

  assert.deepEqual(verifiedOrder, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(input, before);
  assert.equal(result.round.closed, true);
  assert.equal(getSecretCommitRevealPublicState(result.round).phase, 'closed');
  assert.deepEqual(result.snapshot.participantIds, ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(result.snapshot.entries, [
    { participantId: 'p1', publicValue: { hand: 'hand:p1' } },
    { participantId: 'p2', publicValue: { hand: 'hand:p2' } },
    { participantId: 'p3', publicValue: { hand: 'hand:p3' } },
    { participantId: 'p4', publicValue: { hand: 'hand:p4' } },
  ]);
  assert.equal(JSON.stringify(result.snapshot).includes('secret:'), false);
  assert.equal(JSON.stringify(result.snapshot).includes('nonce:'), false);
});

test('verification failure is all-or-nothing and leaves ready round open', async () => {
  const ready = commitAll(makeRound());
  let calls = 0;
  await assert.rejects(
    finalizeSecretCommitRevealRound(
      ready,
      [reveal('p1'), reveal('p2', 'tampered'), reveal('p3'), reveal('p4')],
      async (context) => {
        calls += 1;
        return verify(context);
      },
    ),
    /reveal verification failed for participantId: p2/,
  );
  assert.equal(calls, 2);
  assert.equal(ready.closed, false);
  assert.equal(getSecretCommitRevealPublicState(ready).phase, 'reveal-ready');
});

test('rejects missing, duplicate, unknown, stale round, and stale revision reveals', async () => {
  const ready = commitAll(makeRound());
  await assert.rejects(
    finalizeSecretCommitRevealRound(ready, [reveal('p1'), reveal('p2'), reveal('p3')], verify),
    /every expected participant exactly once/,
  );
  await assert.rejects(
    finalizeSecretCommitRevealRound(ready, [reveal('p1'), reveal('p2'), reveal('p3'), reveal('p3')], verify),
    /duplicate reveal for participantId: p3/,
  );
  await assert.rejects(
    finalizeSecretCommitRevealRound(ready, [reveal('p1'), reveal('p2'), reveal('p3'), reveal('outsider')], verify),
    /reveal supplied for nonparticipant: outsider/,
  );
  await assert.rejects(
    finalizeSecretCommitRevealRound(ready, [reveal('p1'), reveal('p2'), reveal('p3'), { ...reveal('p4'), roundId: 'old' }], verify),
    /stale or mismatched reveal roundId/,
  );
  await assert.rejects(
    finalizeSecretCommitRevealRound(ready, [reveal('p1'), reveal('p2'), reveal('p3'), { ...reveal('p4'), revision: 2 }], verify),
    /stale or mismatched reveal revision/,
  );
});

test('rejects duplicate, outsider, stale, and malformed commitments', () => {
  const round = makeRound();
  const committed = commitSecretSelection(round, {
    roundId: 'round-7', revision: 3, participantId: 'p1', commitment: 'opaque:p1',
  });
  assert.throws(() => commitSecretSelection(committed, {
    roundId: 'round-7', revision: 3, participantId: 'p1', commitment: 'again',
  }), /duplicate commitment/);
  assert.throws(() => commitSecretSelection(round, {
    roundId: 'round-7', revision: 3, participantId: 'outsider', commitment: 'opaque',
  }), /unknown participant/);
  assert.throws(() => commitSecretSelection(round, {
    roundId: 'old', revision: 3, participantId: 'p1', commitment: 'opaque',
  }), /stale or mismatched roundId/);
  assert.throws(() => commitSecretSelection(round, {
    roundId: 'round-7', revision: 2, participantId: 'p1', commitment: 'opaque',
  }), /stale or mismatched revision/);
  assert.throws(() => commitSecretSelection(round, {
    roundId: 'round-7', revision: 3, participantId: 'p1', commitment: '',
  }), /non-empty opaque string/);
});

test('supports existing two-participant barrier without changing semantics', async () => {
  let round = makeRound(['beta', 'alpha']);
  for (const participantId of ['beta', 'alpha']) {
    round = commitSecretSelection(round, {
      roundId: 'round-7',
      revision: 3,
      participantId,
      commitment: `opaque:${participantId}`,
    });
  }
  const result = await finalizeSecretCommitRevealRound(
    round,
    [reveal('beta'), reveal('alpha')],
    verify,
  );
  assert.deepEqual(result.snapshot.participantIds, ['alpha', 'beta']);
  assert.deepEqual(result.snapshot.entries.map(({ participantId }) => participantId), ['alpha', 'beta']);
});

test('rejects invalid participant sets and does not widen the current 2-4 participant contract', () => {
  assert.throws(() => makeRound(['solo']), /between 2 and 4 participants/);
  assert.throws(() => makeRound(['a', 'b', 'c', 'd', 'e']), /between 2 and 4 participants/);
  assert.throws(() => makeRound(['a', 'a']), /duplicate participantId/);
});

test('closed round cannot accept another commit or reveal', async () => {
  const ready = commitAll(makeRound());
  const { round: closed } = await finalizeSecretCommitRevealRound(
    ready,
    [reveal('p1'), reveal('p2'), reveal('p3'), reveal('p4')],
    verify,
  );
  assert.throws(() => commitSecretSelection(closed, {
    roundId: 'round-7', revision: 3, participantId: 'p1', commitment: 'x',
  }), /already closed/);
  await assert.rejects(
    finalizeSecretCommitRevealRound(closed, [reveal('p1'), reveal('p2'), reveal('p3'), reveal('p4')], verify),
    /already closed/,
  );
});
