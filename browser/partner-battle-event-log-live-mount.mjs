import { createPartnerBattleEventLogConsumerAdapter } from './partner-battle-event-log-projection.mjs';

const LIVE_MOUNT_SCHEMA = 'GAMEROAD_PARTNER_BATTLE_EVENT_LOG_LIVE_MOUNT_V1';
const PROJECTION_SCHEMA = 'GAMEROAD_PARTNER_BATTLE_EVENT_PROJECTION_V1';
const TARGET_SELECTOR = '[data-partner-battle-event-log="1"]';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function environmentValue(environment, name) {
  if (Object.prototype.hasOwnProperty.call(environment, name)) return environment[name];
  return typeof globalThis === 'object' ? globalThis[name] : undefined;
}

function projectionLines(projection) {
  if (!projection || projection.schema !== PROJECTION_SCHEMA || !Array.isArray(projection.events)) {
    throw new TypeError('PARTNER_BATTLE_EVENT_PROJECTION_INVALID');
  }
  const lines = [];
  for (const event of projection.events) {
    if (event?.kind === 'battle_resolution' && event.data) {
      const added = Array.isArray(event.data.laneGains)
        ? event.data.laneGains.reduce((sum, row) => sum + (Number.isSafeInteger(row?.added) ? row.added : 0), 0)
        : 0;
      lines.push(`R${event.data.round} / ${event.data.lane} / 勝者${event.data.winnerCount} / 進行+${added}`);
    } else if (event?.kind === 'match_ended' && event.data) {
      lines.push(`終了 R${event.data.round} / 勝者${event.data.winnerCount}`);
    }
  }
  return lines;
}

export function formatPartnerBattleEventLogProjection(projection) {
  return projectionLines(projection).join('\n');
}

export function renderPartnerBattleEventLogProjection(projection, environment = {}) {
  const text = formatPartnerBattleEventLogProjection(projection);
  const documentRef = environmentValue(environment, 'document');
  const host = documentRef?.getElementById?.('battleLog');
  if (!host || typeof documentRef?.createElement !== 'function') return false;

  let target = typeof host.querySelector === 'function' ? host.querySelector(TARGET_SELECTOR) : null;
  if (!target) {
    target = documentRef.createElement('div');
    if (!target) return false;
    if (!target.dataset) target.dataset = {};
    target.dataset.partnerBattleEventLog = '1';
    target.setAttribute?.('role', 'log');
    target.setAttribute?.('aria-label', '相棒の対戦振り返り');
    if (target.style) target.style.whiteSpace = 'pre-wrap';
    if (typeof host.appendChild !== 'function') return false;
    host.appendChild(target);
  }

  if (!target.dataset) target.dataset = {};
  target.dataset.partnerBattleEventLogCount = String(projection.eventCount);
  target.textContent = text;
  return true;
}

export function createPartnerBattleEventLogLiveMount({ readReplay, environment = {} } = {}) {
  if (typeof readReplay !== 'function') throw new TypeError('readReplay must be a function');
  let currentSession = null;
  let lastProjection = null;
  let lastRendered = false;

  const consume = createPartnerBattleEventLogConsumerAdapter({
    readReplay: () => readReplay(currentSession),
    consumeProjection(projection) {
      lastProjection = projection;
      lastRendered = renderPartnerBattleEventLogProjection(projection, environment);
    }
  });

  function sync(session) {
    currentSession = session;
    lastRendered = false;
    const result = consume();
    return deepFreeze({ ...result, rendered: result.consumed === true && lastRendered === true });
  }

  function snapshot() {
    return lastProjection ? deepFreeze(JSON.parse(JSON.stringify(lastProjection))) : null;
  }

  return Object.freeze({ sync, snapshot });
}

export const PARTNER_BATTLE_EVENT_LOG_LIVE_MOUNT = Object.freeze({
  schema: LIVE_MOUNT_SCHEMA,
  sourceProjectionSchema: PROJECTION_SCHEMA,
  sourceAuthority: 'accepted public BattleReplay read only',
  storageAuthority: 'NONE',
  gameStateWrite: false,
  identityPolicy: 'NO_PLAYER_ID_OR_NAME_RENDER',
  privateDataPolicy: 'NO_PRIVATE_DATA_RENDER',
  domSurface: 'battleLog',
  domOwnership: 'DEDICATED_CHILD_ONLY'
});
