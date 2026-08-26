import {
  createAuthoritativeRemainingDeckSnapshot,
  projectRemainingDeckForViewer,
  validateAuthoritativeRemainingDeckSnapshot,
} from './battle-self-deck-inspect-core.mjs';

export const BATTLE_SELF_DECK_INSPECT_RUNTIME_SCHEMA = 'gameroad.battle-self-deck-inspect-runtime.v1';

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validPacket(packet) {
  return packet && typeof packet === 'object' && !Array.isArray(packet);
}

export function resolveBattleSelfDeckProjection(packet) {
  if (!validPacket(packet)) return Object.freeze({ ok: false, status: 'unavailable', reason: 'SOURCE_PACKET_UNAVAILABLE' });
  const viewer = packet.viewer;
  if (!viewer || viewer.authenticated !== true || typeof viewer.id !== 'string' || viewer.id.trim() !== viewer.id || !viewer.id) {
    return Object.freeze({ ok: false, status: 'unavailable', reason: 'VIEWER_UNAUTHENTICATED' });
  }

  let snapshot;
  try {
    if (packet.authoritativeSnapshot) {
      const validation = validateAuthoritativeRemainingDeckSnapshot(packet.authoritativeSnapshot);
      if (!validation.ok) return validation;
      snapshot = packet.authoritativeSnapshot;
    } else {
      snapshot = createAuthoritativeRemainingDeckSnapshot(packet.snapshotInput || {});
    }
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'SNAPSHOT_BUILD_FAILED',
    });
  }

  const projection = projectRemainingDeckForViewer(snapshot, { viewer });
  if (!projection.ok) return projection;
  if (!Array.isArray(projection.cardCounts)) {
    return Object.freeze({ ok: false, status: 'unavailable', reason: 'OWNER_DETAIL_NOT_AUTHORIZED' });
  }
  return projection;
}

export function createBattleSelfDeckDisclosureController({
  button,
  panel,
  eventRoot,
  refresh = () => null,
} = {}) {
  if (!button || !panel || !eventRoot || typeof eventRoot.addEventListener !== 'function') {
    throw new TypeError('DISCLOSURE_TARGETS_REQUIRED');
  }

  let destroyed = false;
  const isOpen = () => panel.hidden === false;
  const setExpanded = (value) => button.setAttribute?.('aria-expanded', value ? 'true' : 'false');
  const close = ({ focusButton = false } = {}) => {
    if (destroyed) return false;
    panel.hidden = true;
    setExpanded(false);
    if (focusButton) button.focus?.();
    return true;
  };
  const open = () => {
    if (destroyed) return false;
    refresh();
    if (button.hidden) return false;
    panel.hidden = false;
    setExpanded(true);
    return true;
  };
  const toggle = () => (isOpen() ? close() : open());

  const onButtonClick = () => toggle();
  const onPointerDown = (event) => {
    if (!isOpen()) return;
    const target = event?.target;
    if (button.contains?.(target) || panel.contains?.(target)) return;
    close();
  };
  const onKeyDown = (event) => {
    if (!isOpen() || event?.key !== 'Escape') return;
    event.preventDefault?.();
    close({ focusButton: true });
  };

  button.addEventListener?.('click', onButtonClick);
  eventRoot.addEventListener('pointerdown', onPointerDown, true);
  eventRoot.addEventListener('keydown', onKeyDown, true);
  panel.hidden = true;
  setExpanded(false);

  return Object.freeze({
    open,
    close,
    toggle,
    isOpen,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      button.removeEventListener?.('click', onButtonClick);
      eventRoot.removeEventListener?.('pointerdown', onPointerDown, true);
      eventRoot.removeEventListener?.('keydown', onKeyDown, true);
      panel.hidden = true;
      setExpanded(false);
      return true;
    },
  });
}

function installStyle(documentObj) {
  if (documentObj.getElementById?.('gameroad-battle-self-deck-inspect-style')) return;
  const style = documentObj.createElement('style');
  style.id = 'gameroad-battle-self-deck-inspect-style';
  style.textContent = `
.selfDeckInspectPanel{position:absolute;z-index:92;right:64px;top:96px;width:min(320px,calc(100% - 24px));max-height:min(58vh,430px);overflow:auto;padding:12px;border:1px solid rgba(190,219,255,.44);border-radius:14px;background:rgba(7,15,38,.96);box-shadow:0 18px 50px rgba(0,0,18,.42);backdrop-filter:blur(8px);color:#f6f9ff}
.selfDeckInspectPanel[hidden]{display:none!important}.selfDeckInspectHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.selfDeckInspectHead strong{font-size:14px}.selfDeckInspectClose{width:34px;height:34px;border:1px solid rgba(210,230,255,.35);border-radius:9px;background:rgba(255,255,255,.08);color:inherit;font:inherit}.selfDeckInspectSummary{margin:8px 0 10px;font-size:12px;color:rgba(238,246,255,.82)}.selfDeckInspectList{display:grid;gap:5px;margin:0;padding:0;list-style:none}.selfDeckInspectList li{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:36px;padding:7px 9px;border-radius:9px;background:rgba(255,255,255,.055)}.selfDeckInspectList span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.selfDeckInspectList b{font-size:12px;color:#fff0a9}.selfDeckInspectEmpty{padding:10px;text-align:center;color:rgba(238,246,255,.68);font-size:12px}
@media(max-width:620px){.selfDeckInspectPanel{right:8px;top:74px;width:min(300px,calc(100% - 16px));max-height:54vh}}
`;
  (documentObj.head || documentObj.documentElement)?.appendChild(style);
}

export function mountBattleSelfDeckInspect({
  documentObj = globalThis.document,
  source = globalThis.GAMEROAD_SELF_DECK_INSPECT_SOURCE,
  cardLabel = null,
} = {}) {
  if (!documentObj || !source || typeof source.read !== 'function') throw new TypeError('RUNTIME_SOURCE_REQUIRED');
  const battleRoot = documentObj.querySelector?.('section.screen[data-screen="battle"]');
  const rail = battleRoot?.querySelector?.('.battleRail');
  if (!battleRoot || !rail) throw new TypeError('BATTLE_SURFACE_REQUIRED');

  const existing = documentObj.getElementById?.('selfDeckInspectButton');
  if (existing) return globalThis.GAMEROAD_SELF_DECK_INSPECT_RUNTIME || null;
  installStyle(documentObj);

  const button = documentObj.createElement('button');
  button.type = 'button';
  button.id = 'selfDeckInspectButton';
  button.className = 'railBtn selfDeckInspectButton';
  button.setAttribute('aria-label', '自分の残り山札を確認');
  button.setAttribute('aria-controls', 'selfDeckInspectPanel');
  button.hidden = true;
  button.textContent = '残札 —';
  const leave = rail.querySelector?.('#leaveMatch');
  if (leave && typeof rail.insertBefore === 'function') rail.insertBefore(button, leave);
  else rail.appendChild(button);

  const panel = documentObj.createElement('aside');
  panel.id = 'selfDeckInspectPanel';
  panel.className = 'selfDeckInspectPanel';
  panel.setAttribute('aria-label', '自分の残り山札');
  panel.innerHTML = '<div class="selfDeckInspectHead"><strong>残り山札</strong><button type="button" class="selfDeckInspectClose" aria-label="残り山札を閉じる">×</button></div><div class="selfDeckInspectSummary"></div><ul class="selfDeckInspectList"></ul>';
  battleRoot.appendChild(panel);

  const summary = panel.querySelector('.selfDeckInspectSummary');
  const list = panel.querySelector('.selfDeckInspectList');
  const closeButton = panel.querySelector('.selfDeckInspectClose');
  const labelFor = typeof cardLabel === 'function'
    ? cardLabel
    : typeof source.cardLabel === 'function' ? source.cardLabel : (cardId) => cardId;
  let lastProjection = null;

  const renderUnavailable = () => {
    lastProjection = null;
    button.hidden = true;
    button.textContent = '残札 —';
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (summary) summary.textContent = '';
    if (list) list.replaceChildren?.();
    return null;
  };

  const refresh = () => {
    let packet;
    try { packet = source.read(); } catch { return renderUnavailable(); }
    const projection = resolveBattleSelfDeckProjection(packet);
    if (!projection.ok) return renderUnavailable();
    lastProjection = projection;
    button.hidden = false;
    button.textContent = `残札 ${projection.total}`;
    button.dataset.revision = String(projection.revision);
    button.dataset.ownerPlayerId = projection.ownerPlayerId;
    if (summary) summary.textContent = `残り ${projection.total}枚 / ${projection.typeCount}種類`;
    if (list) {
      list.replaceChildren();
      if (projection.cardCounts.length === 0) {
        const empty = documentObj.createElement('li');
        empty.className = 'selfDeckInspectEmpty';
        empty.textContent = '山札は空です';
        list.appendChild(empty);
      } else {
        for (const entry of projection.cardCounts) {
          const row = documentObj.createElement('li');
          row.dataset.cardId = entry.cardId;
          const name = documentObj.createElement('span');
          name.textContent = String(labelFor(entry.cardId) || entry.cardId);
          const count = documentObj.createElement('b');
          count.textContent = `×${entry.count}`;
          row.append(name, count);
          list.appendChild(row);
        }
      }
    }
    return projection;
  };

  const disclosure = createBattleSelfDeckDisclosureController({
    button,
    panel,
    eventRoot: documentObj,
    refresh,
  });
  closeButton?.addEventListener?.('click', () => disclosure.close({ focusButton: true }));
  refresh();

  const runtime = Object.freeze({
    schema: BATTLE_SELF_DECK_INSPECT_RUNTIME_SCHEMA,
    refresh,
    open: disclosure.open,
    close: disclosure.close,
    snapshot: () => cloneJson(lastProjection),
    destroy() {
      disclosure.destroy();
      button.remove?.();
      panel.remove?.();
      return true;
    },
  });
  return runtime;
}

if (typeof globalThis !== 'undefined') {
  const coreBridge = Object.freeze({
    createSnapshot: (input) => createAuthoritativeRemainingDeckSnapshot(input),
    validateSnapshot: (snapshot) => validateAuthoritativeRemainingDeckSnapshot(snapshot),
  });
  if (!globalThis.GAMEROAD_SELF_DECK_INSPECT_CORE_BRIDGE) {
    Object.defineProperty(globalThis, 'GAMEROAD_SELF_DECK_INSPECT_CORE_BRIDGE', {
      value: coreBridge,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }

  const install = () => {
    if (globalThis.GAMEROAD_SELF_DECK_INSPECT_RUNTIME || !globalThis.document) return;
    const source = globalThis.GAMEROAD_SELF_DECK_INSPECT_SOURCE;
    if (!source) return;
    try {
      globalThis.GAMEROAD_SELF_DECK_INSPECT_RUNTIME = mountBattleSelfDeckInspect({
        documentObj: globalThis.document,
        source,
      });
    } catch {
      // Fail closed: Battle remains playable if the optional inspection surface cannot mount.
    }
  };
  if (globalThis.document?.readyState === 'loading') globalThis.document.addEventListener('DOMContentLoaded', install, { once: true });
  else queueMicrotask(install);
}
