import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POST_MATCH_AUTOQUEUE_STATUS as S,
  createPostMatchAutoQueueController,
  normalizePostMatchAutoQueueSetting,
} from '../browser/post-match-autoqueue-core.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

test('setting defaults ON and explicit false stays OFF', () => {
  assert.equal(normalizePostMatchAutoQueueSetting(undefined), true);
  assert.equal(normalizePostMatchAutoQueueSetting(null), true);
  assert.equal(normalizePostMatchAutoQueueSetting(false), false);
});

test('authoritative result starts exactly one ticket and preserves queue signature', async () => {
  const creates = [];
  const c = createPostMatchAutoQueueController({
    createTicket: async payload => { creates.push(payload); return { ticketId: 'T1' }; },
    cancelTicket: async () => {},
  });
  const signature = { regulationId: 'FIRST', mode: '2v2', partyId: 'P' };
  await c.onResult({ resultId: 'R1', queueSignature: signature });
  await c.onResult({ resultId: 'R1', queueSignature: { regulationId: 'OTHER' } });
  assert.equal(creates.length, 1);
  assert.deepEqual(creates[0].queueSignature, signature);
  assert.equal(c.snapshot().status, S.SEARCHING);
});

test('OFF while ticket creation is in flight cancels once ticket id exists', async () => {
  const create = deferred();
  const cancels = [];
  const c = createPostMatchAutoQueueController({
    createTicket: () => create.promise,
    cancelTicket: async payload => { cancels.push(payload); },
  });
  const starting = c.onResult({ resultId: 'R2', queueSignature: { mode: '2p' } });
  assert.equal(c.snapshot().status, S.STARTING);
  await c.setEnabled(false);
  assert.equal(c.snapshot().status, S.CANCEL_REQUESTED);
  create.resolve({ ticketId: 'T2' });
  await starting;
  assert.equal(c.snapshot().status, S.CANCEL_REQUESTED);
  assert.equal(cancels.length, 1);
  assert.equal(cancels[0].ticketId, 'T2');
});

test('OFF while searching is cancel-requested until provider confirms cancellation', async () => {
  let cancelCalls = 0;
  const c = createPostMatchAutoQueueController({
    createTicket: async () => ({ ticketId: 'T3' }),
    cancelTicket: async () => { cancelCalls++; },
  });
  await c.onResult({ resultId: 'R3' });
  await c.setEnabled(false);
  assert.equal(cancelCalls, 1);
  assert.equal(c.snapshot().status, S.CANCEL_REQUESTED);
  c.handleTicketUpdate({ ticketId: 'T3', status: 'cancelled' });
  assert.equal(c.snapshot().status, S.CANCELLED);
});

test('match can win cancellation race without false cancelled state', async () => {
  const c = createPostMatchAutoQueueController({
    createTicket: async () => ({ ticketId: 'T4' }),
    cancelTicket: async () => {},
  });
  await c.onResult({ resultId: 'R4' });
  await c.setEnabled(false);
  c.handleTicketUpdate({ ticketId: 'T4', status: 'matched', matchId: 'M4' });
  assert.equal(c.snapshot().status, S.MATCHED);
  assert.equal(c.snapshot().matchId, 'M4');
  assert.equal(c.snapshot().cancelTooLate, true);
});

test('re-enable after confirmed cancellation creates a fresh ticket attempt', async () => {
  const creates = [];
  const c = createPostMatchAutoQueueController({
    createTicket: async payload => {
      creates.push(payload);
      return { ticketId: `T${creates.length}` };
    },
    cancelTicket: async () => {},
  });
  await c.onResult({ resultId: 'R5', queueSignature: { mode: '4p' } });
  await c.setEnabled(false);
  c.handleTicketUpdate({ ticketId: 'T1', status: 'cancelled' });
  await c.setEnabled(true);
  assert.equal(creates.length, 2);
  assert.equal(creates[1].attempt, 2);
  assert.equal(c.snapshot().ticketId, 'T2');
  assert.equal(c.snapshot().status, S.SEARCHING);
});

test('stale ticket updates cannot mutate the current attempt', async () => {
  let n = 0;
  const c = createPostMatchAutoQueueController({
    createTicket: async () => ({ ticketId: `T${++n}` }),
    cancelTicket: async () => {},
  });
  await c.onResult({ resultId: 'R6' });
  await c.setEnabled(false);
  c.handleTicketUpdate({ ticketId: 'T1', status: 'cancelled' });
  await c.setEnabled(true);
  c.handleTicketUpdate({ ticketId: 'T1', status: 'matched', matchId: 'STALE' });
  assert.equal(c.snapshot().ticketId, 'T2');
  assert.equal(c.snapshot().status, S.SEARCHING);
  assert.equal(c.snapshot().matchId, null);
});

test('explicitly disabled mode does not start a ticket at result', async () => {
  let creates = 0;
  const c = createPostMatchAutoQueueController({
    initialEnabled: false,
    createTicket: async () => { creates++; return { ticketId: 'NO' }; },
    cancelTicket: async () => {},
  });
  await c.onResult({ resultId: 'R7' });
  assert.equal(creates, 0);
  assert.equal(c.snapshot().status, S.DISABLED);
});

test('ineligible result never starts normal matchmaking', async () => {
  let creates = 0;
  const c = createPostMatchAutoQueueController({
    createTicket: async () => { creates++; return { ticketId: 'NO' }; },
    cancelTicket: async () => {},
  });
  await c.onResult({ resultId: 'FRIEND', eligible: false });
  assert.equal(creates, 0);
  assert.equal(c.snapshot().status, S.INELIGIBLE);
});
