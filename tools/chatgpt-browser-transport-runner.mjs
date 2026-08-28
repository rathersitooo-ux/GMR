#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { buildTransportMessage, createChatGptBrowserTransport, normalizeTransportRequest } from './chatgpt-browser-transport-core.mjs';

export const EXECUTOR_ACTION = 'chatgpt-browser-roundtrip';

function envelopeError(command, code, message, retryable = false) {
  return {
    type: 'result',
    commandId: command?.commandId ?? '',
    correlationId: command?.correlationId ?? '',
    ok: false,
    status: code,
    retryable,
    error: message,
  };
}

export function createExecutorBusChatGptHandler({ driver, now } = {}) {
  const transport = driver ? createChatGptBrowserTransport({ driver, now }) : null;
  return async function handle(command) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      return envelopeError(command, 'INVALID_COMMAND', 'command_must_be_object');
    }
    if (command.payload?.action !== EXECUTOR_ACTION) {
      return envelopeError(command, 'UNSUPPORTED_ACTION', `expected_action=${EXECUTOR_ACTION}`);
    }
    if (!command.commandId || !command.correlationId) {
      return envelopeError(command, 'INVALID_COMMAND', 'commandId_and_correlationId_required');
    }
    if (!transport) {
      return envelopeError(command, 'DRIVER_REQUIRED', 'live_browser_driver_not_injected', false);
    }

    try {
      const request = normalizeTransportRequest({
        ...(command.payload.request ?? {}),
        correlationId: command.payload.request?.correlationId ?? command.correlationId,
        idempotencyKey: command.payload.request?.idempotencyKey ?? command.commandId,
      });
      const transportResult = await transport.run(request);
      return {
        type: 'result',
        commandId: command.commandId,
        correlationId: command.correlationId,
        ok: transportResult.ok,
        status: transportResult.status,
        retryable: transportResult.retryable,
        payload: transportResult,
      };
    } catch (error) {
      return envelopeError(command, 'INVALID_REQUEST', error.message, false);
    }
  };
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

export async function runCli(argv = process.argv.slice(2)) {
  const mode = argv[0] ?? 'prepare';
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'EMPTY_STDIN' })}\n`);
    return 2;
  }

  let input;
  try {
    input = JSON.parse(raw);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, status: 'INVALID_JSON', error: error.message })}\n`);
    return 2;
  }

  if (mode === 'prepare') {
    try {
      const request = normalizeTransportRequest(input);
      process.stdout.write(`${JSON.stringify({ ok: true, request, message: buildTransportMessage(request) })}\n`);
      return 0;
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, status: 'INVALID_REQUEST', error: error.message })}\n`);
      return 2;
    }
  }

  process.stdout.write(`${JSON.stringify({ ok: false, status: 'DRIVER_REQUIRED', error: 'live execution requires an injected browser driver' })}\n`);
  return 3;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
