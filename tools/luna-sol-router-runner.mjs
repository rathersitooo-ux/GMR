#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { normalizeQueuePacket } from './executor-bus-packet.mjs';
import { ROUTER_SCHEMA_VERSION, routeLunaSol } from './luna-sol-router-core.mjs';

export const ROUTER_ACTION = 'luna-sol-route';

function fail(status, reason) {
  return { ok: false, status, reason };
}

export function routeExecutorQueue(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_INPUT', 'input_must_be_object');
  if (input.action !== ROUTER_ACTION) return fail('UNSUPPORTED_ACTION', `expected_action=${ROUTER_ACTION}`);

  const queue = normalizeQueuePacket(input.queuePacket);
  if (!queue.ok) return fail('INVALID_QUEUE_PACKET', queue.reason);

  try {
    const decision = routeLunaSol({
      ...(input.signals ?? {}),
      taskId: queue.packet.taskId,
      workUnitKey: queue.packet.workUnitKey,
      acquireKey: queue.packet.acquireKey,
    });
    return {
      ok: true,
      schemaVersion: ROUTER_SCHEMA_VERSION,
      kind: 'routing-decision',
      taskId: queue.packet.taskId,
      workUnitKey: queue.packet.workUnitKey,
      acquireKey: queue.packet.acquireKey,
      decision,
    };
  } catch (error) {
    return fail('INVALID_ROUTER_SIGNALS', error.message);
  }
}

async function readStdin() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

export async function runCli() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify(fail('EMPTY_STDIN', 'stdin_required'))}\n`);
    return 2;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    process.stdout.write(`${JSON.stringify(fail('INVALID_JSON', error.message))}\n`);
    return 2;
  }
  const result = routeExecutorQueue(parsed);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli();
}
