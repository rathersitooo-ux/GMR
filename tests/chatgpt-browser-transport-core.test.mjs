import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TRANSPORT_STATUS,
  buildTransportMessage,
  createChatGptBrowserTransport,
} from '../tools/chatgpt-browser-transport-core.mjs';
import { createExecutorBusChatGptHandler } from '../tools/chatgpt-browser-transport-runner.mjs';

const BASE = Object.freeze({
  taskId: 'OPS-AI-EXECUTION-CAPABILITY-DISCOVERY-001',
  workUnitKey: 'CHATGPT_SOL_BROWSER_TRANSPORT_R1',
  acquireKey: 'OPS-AI-CHATGPT-TRANSPORT-R1-TEST',
  packetId: 'packet-001',
  correlationId: 'corr-001',
  prompt: 'Find the root cause and return a structured decision.',
  expectedConversationId: 'conv-1',
  timeoutMs: 1000,
});

function responseMarker(request = BASE) {
  return `[GAMEROAD_SOL_RESPONSE packetId="${request.packetId}" correlationId="${request.correlationId}"]`;
}

function fakeDriver(overrides = {}) {
  const calls = { inspect: 0, submit: 0, wait: 0, submissions: [] };
  const driver = {
    async inspectContext() {
      calls.inspect += 1;
      return {
        pageReady: true,
        loading: false,
        composerReady: true,
        conversationId: 'conv-1',
        lastAssistantTurnId: 'a-old',
      };
    },
    async submitMessage(payload) {
      calls.submit += 1;
      calls.submissions.push(payload);
      return { accepted: true, userTurnId: 'u-new' };
    },
    async waitForAssistantTurn() {
      calls.wait += 1;
      return {
        state: 'completed',
        complete: true,
        truncated: false,
        conversationId: 'conv-1',
        turnId: 'a-new',
        text: `Decision ready. ${responseMarker()}`,
      };
    },
    ...overrides,
  };
  return { driver, calls };
}

test('buildTransportMessage carries exact packet and correlation marker', () => {
  const message = buildTransportMessage(BASE);
  assert.match(message, /packetId=packet-001/);
  assert.match(message, /correlationId=corr-001/);
  assert.ok(message.includes(responseMarker()));
});

test('happy path returns only the new correlated completed assistant turn', async () => {
  const { driver, calls } = fakeDriver();
  const transport = createChatGptBrowserTransport({ driver, now: () => 42 });
  const out = await transport.run(BASE);
  assert.equal(out.ok, true);
  assert.equal(out.status, TRANSPORT_STATUS.COMPLETED);
  assert.equal(out.assistantTurnId, 'a-new');
  assert.equal(out.submittedAtMs, 42);
  assert.equal(out.completedAtMs, 42);
  assert.equal(calls.submit, 1);
  assert.equal(calls.wait, 1);
});

test('stale previous assistant turn is rejected', async () => {
  const { driver } = fakeDriver({
    async waitForAssistantTurn() {
      return { state: 'completed', complete: true, conversationId: 'conv-1', turnId: 'a-old', text: responseMarker() };
    },
  });
  const out = await createChatGptBrowserTransport({ driver }).run(BASE);
  assert.equal(out.status, TRANSPORT_STATUS.STALE_RESPONSE);
  assert.equal(out.ok, false);
});

test('wrong conversation fails before submit', async () => {
  const { driver, calls } = fakeDriver({
    async inspectContext() {
      return { pageReady: true, composerReady: true, conversationId: 'conv-wrong', lastAssistantTurnId: 'a-old' };
    },
  });
  const out = await createChatGptBrowserTransport({ driver }).run(BASE);
  assert.equal(out.status, TRANSPORT_STATUS.WRONG_CONVERSATION);
  assert.equal(calls.submit, 0);
});

test('timeout retry resumes waiting and does not submit a second time', async () => {
  let waits = 0;
  const { driver, calls } = fakeDriver({
    async waitForAssistantTurn() {
      waits += 1;
      if (waits === 1) return { state: 'timeout' };
      return { state: 'completed', complete: true, conversationId: 'conv-1', turnId: 'a-new', text: responseMarker() };
    },
  });
  const transport = createChatGptBrowserTransport({ driver });
  const first = await transport.run(BASE);
  const second = await transport.run(BASE);
  assert.equal(first.status, TRANSPORT_STATUS.TIMED_OUT);
  assert.equal(second.status, TRANSPORT_STATUS.COMPLETED);
  assert.equal(second.resumed, true);
  assert.equal(calls.submit, 1);
  assert.equal(waits, 2);
});

test('reusing idempotency key for another packet is rejected without resend', async () => {
  const { driver, calls } = fakeDriver();
  const transport = createChatGptBrowserTransport({ driver });
  await transport.run({ ...BASE, idempotencyKey: 'same-key' });
  const out = await transport.run({ ...BASE, packetId: 'packet-002', idempotencyKey: 'same-key' });
  assert.equal(out.status, TRANSPORT_STATUS.DUPLICATE_SEND);
  assert.equal(calls.submit, 1);
});

test('application error is surfaced', async () => {
  const { driver } = fakeDriver({
    async waitForAssistantTurn() {
      return { state: 'error', error: 'chatgpt_service_error' };
    },
  });
  const out = await createChatGptBrowserTransport({ driver }).run(BASE);
  assert.equal(out.status, TRANSPORT_STATUS.APP_ERROR);
  assert.equal(out.retryable, true);
});

test('missing packet correlation marker is rejected', async () => {
  const { driver } = fakeDriver({
    async waitForAssistantTurn() {
      return { state: 'completed', complete: true, conversationId: 'conv-1', turnId: 'a-new', text: 'A plausible but uncorrelated answer.' };
    },
  });
  const out = await createChatGptBrowserTransport({ driver }).run(BASE);
  assert.equal(out.status, TRANSPORT_STATUS.CORRELATION_MISMATCH);
});

test('truncated assistant response is rejected', async () => {
  const { driver } = fakeDriver({
    async waitForAssistantTurn() {
      return { state: 'completed', complete: false, truncated: true, conversationId: 'conv-1', turnId: 'a-new', text: responseMarker() };
    },
  });
  const out = await createChatGptBrowserTransport({ driver }).run(BASE);
  assert.equal(out.status, TRANSPORT_STATUS.TRUNCATED);
  assert.equal(out.retryable, true);
});

test('executor-bus seam maps commandId to idempotency and correlationId by default', async () => {
  const { driver, calls } = fakeDriver();
  const handler = createExecutorBusChatGptHandler({ driver });
  const command = {
    type: 'command',
    commandId: 'command-123',
    correlationId: 'corr-001',
    payload: { action: 'chatgpt-browser-roundtrip', request: { ...BASE, correlationId: undefined } },
  };
  const out = await handler(command);
  assert.equal(out.ok, true);
  assert.equal(out.commandId, 'command-123');
  assert.equal(out.correlationId, 'corr-001');
  assert.equal(calls.submissions[0].idempotencyKey, 'command-123');
});

test('executor-bus seam fails closed when no live browser driver is injected', async () => {
  const handler = createExecutorBusChatGptHandler();
  const out = await handler({ commandId: 'c', correlationId: 'r', payload: { action: 'chatgpt-browser-roundtrip' } });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'DRIVER_REQUIRED');
});
