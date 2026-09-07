const AUTO_MODES = new Set(['manual', 'left', 'right', 'max', 'min', 'situation']);
const BLOCKED_KINDS = new Set(['target', 'column', 'shield']);
const ADVANCE_RESERVATION_SURFACE_SCHEMA = 'gameroad.battle.advance-reservation-summary.v1';
const ADVANCE_RESERVATION_SURFACE_ID = 'battleAdvanceReservation';
const ADVANCE_RESERVATION_STYLE_ID = 'battleAdvanceReservationStyle';

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token !== value || token.length > max) return null;
  return token;
}

function fail(reason, extra = {}) {
  return Object.freeze({ ok: false, committed: false, reason, ...extra });
}

function freezePublicCandidate(candidate) {
  return Object.freeze({
    inputId: candidate.inputId,
    kind: candidate.kind,
    positionOrder: candidate.positionOrder,
    comparisonValue: candidate.comparisonValue,
  });
}

function normalizeFrame(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const frameKey = exactToken(raw.frameKey);
  if (!frameKey || !Array.isArray(raw.candidates)) return null;

  const seen = new Set();
  const candidates = [];
  for (const source of raw.candidates) {
    const inputId = exactToken(source?.inputId);
    if (!inputId || seen.has(inputId)) return null;
    seen.add(inputId);

    const kind = exactToken(source?.kind || 'input', 64);
    if (!kind) return null;
    const legal = source?.legal === true;
    const autoSelectable = source?.autoSelectable === true;
    const requiresManualTarget = source?.requiresManualTarget === true;
    const positionOrder = Number(source?.positionOrder);
    const comparisonValue = source?.comparisonValue == null || source?.comparisonValue === ''
      ? null
      : Number(source.comparisonValue);

    candidates.push(Object.freeze({
      inputId,
      kind,
      legal,
      autoSelectable,
      requiresManualTarget,
      positionOrder: Number.isFinite(positionOrder) ? positionOrder : null,
      comparisonValue: Number.isFinite(comparisonValue) ? comparisonValue : null,
      commitInput: source?.commitInput,
    }));
  }
  return Object.freeze({ frameKey, candidates: Object.freeze(candidates) });
}

function selectableCandidates(frame) {
  return frame.candidates.filter((candidate) => (
    candidate.legal
    && candidate.autoSelectable
    && !candidate.requiresManualTarget
    && !BLOCKED_KINDS.has(candidate.kind)
  ));
}

function idCompare(a, b) {
  return a.inputId < b.inputId ? -1 : a.inputId > b.inputId ? 1 : 0;
}

function deterministicSelect(candidates, mode) {
  if (!candidates.length) return null;
  const rows = [...candidates];
  if (mode === 'left' || mode === 'right') {
    if (rows.some((candidate) => candidate.positionOrder == null)) return null;
    rows.sort((a, b) => {
      const delta = a.positionOrder - b.positionOrder;
      if (delta) return mode === 'left' ? delta : -delta;
      return idCompare(a, b);
    });
    return rows[0];
  }
  if (mode === 'max' || mode === 'min') {
    if (rows.some((candidate) => candidate.comparisonValue == null)) return null;
    rows.sort((a, b) => {
      const delta = a.comparisonValue - b.comparisonValue;
      if (delta) return mode === 'max' ? -delta : delta;
      return idCompare(a, b);
    });
    return rows[0];
  }
  return null;
}

function sameCandidateBoundary(left, right) {
  return left.inputId === right.inputId
    && left.kind === right.kind
    && left.positionOrder === right.positionOrder
    && left.comparisonValue === right.comparisonValue;
}

function cleanDisplayText(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

export function projectBattleAdvanceReservationSummary({
  roadValue = '',
  roadLabel = '',
  battleValue = '',
  battleLabel = '',
  readyLabel = '',
  readyAvailable = false,
  readyDisabled = false,
} = {}) {
  const roadReserved = typeof roadValue === 'string' && roadValue.trim() !== '';
  const battleReserved = typeof battleValue === 'string' && battleValue.trim() !== '';
  const readyState = !readyAvailable
    ? 'unavailable'
    : readyDisabled
      ? 'blocked'
      : roadReserved && battleReserved
        ? 'available'
        : 'waiting';
  return Object.freeze({
    schema: ADVANCE_RESERVATION_SURFACE_SCHEMA,
    rows: Object.freeze([
      Object.freeze({
        role: 'road',
        label: '道札',
        value: roadReserved ? cleanDisplayText(roadLabel, roadValue.trim()) : '未選択',
        state: roadReserved ? 'reserved' : 'unset',
      }),
      Object.freeze({
        role: 'battle',
        label: 'じゃんけん札',
        value: battleReserved ? cleanDisplayText(battleLabel, battleValue.trim()) : '未選択',
        state: battleReserved ? 'reserved' : 'unset',
      }),
      Object.freeze({
        role: 'ready',
        label: '準備完了',
        value: cleanDisplayText(readyLabel, '準備完了'),
        state: readyState,
      }),
    ]),
  });
}

function selectedOptionLabel(select) {
  const value = typeof select?.value === 'string' ? select.value : '';
  if (!value) return '';
  const options = select?.options ? [...select.options] : [];
  const option = options.find((candidate) => candidate?.value === value);
  return cleanDisplayText(option?.textContent, value);
}

function readyControlLabel(control) {
  if (!control) return '';
  return cleanDisplayText(
    control.getAttribute?.('aria-label') || control.textContent || control.getAttribute?.('title'),
    '準備完了',
  );
}

function findReadyControl(rail) {
  if (!rail) return null;
  const materialControl = rail.querySelector?.('[data-gmr-material]');
  if (materialControl && materialControl.id !== 'battleAutoMode') return materialControl;
  const candidates = rail.querySelectorAll?.('button,[role="button"]') || [];
  return [...candidates].find((candidate) => {
    if (!candidate || candidate.id === 'battleAutoMode' || candidate.id === ADVANCE_RESERVATION_SURFACE_ID) return false;
    const semanticText = `${candidate.textContent || ''} ${candidate.getAttribute?.('aria-label') || ''} ${candidate.getAttribute?.('title') || ''}`;
    return /準備|ready/i.test(semanticText);
  }) || null;
}

function ensureAdvanceReservationStyle(documentRef) {
  if (!documentRef?.head || typeof documentRef.createElement !== 'function') return false;
  if (documentRef.getElementById?.(ADVANCE_RESERVATION_STYLE_ID)) return true;
  const style = documentRef.createElement('style');
  style.id = ADVANCE_RESERVATION_STYLE_ID;
  style.textContent = `
#${ADVANCE_RESERVATION_SURFACE_ID}{display:grid;gap:4px;min-width:124px;padding:6px;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(8,12,30,.72);box-shadow:0 6px 18px rgba(0,0,0,.2);font:700 10px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#f7fbff;pointer-events:auto}
#${ADVANCE_RESERVATION_SURFACE_ID} .advanceReservationTitle{padding:1px 3px 2px;font-size:10px;letter-spacing:.08em;opacity:.8}
#${ADVANCE_RESERVATION_SURFACE_ID} .advanceReservationRow{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center;min-height:30px;padding:4px 7px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(255,255,255,.07);color:inherit;text-align:left}
#${ADVANCE_RESERVATION_SURFACE_ID} button.advanceReservationRow{font:inherit;cursor:pointer}
#${ADVANCE_RESERVATION_SURFACE_ID} button.advanceReservationRow:disabled{cursor:default;opacity:.45}
#${ADVANCE_RESERVATION_SURFACE_ID} .advanceReservationRole{opacity:.62;white-space:nowrap}
#${ADVANCE_RESERVATION_SURFACE_ID} .advanceReservationValue{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
#${ADVANCE_RESERVATION_SURFACE_ID} [data-state="reserved"]{border-color:rgba(139,225,255,.42);background:rgba(83,169,221,.14)}
#${ADVANCE_RESERVATION_SURFACE_ID} [data-state="available"]{border-color:rgba(177,255,201,.45);background:rgba(65,181,107,.15)}
`;
  documentRef.head.appendChild(style);
  return true;
}

function focusExistingControl(control) {
  if (!control || control.disabled === true || typeof control.focus !== 'function') return false;
  try { control.focus({ preventScroll: true }); } catch { control.focus(); }
  return true;
}

export function mountBattleAdvanceReservationSurface(globalRef = globalThis) {
  const documentRef = globalRef?.document;
  const rail = documentRef?.querySelector?.('.battleRail');
  const road = documentRef?.getElementById?.('roadSelect');
  const battle = documentRef?.getElementById?.('battleSelect');
  if (!documentRef || !rail || !road || !battle || typeof documentRef.createElement !== 'function') return null;

  const existing = documentRef.getElementById?.(ADVANCE_RESERVATION_SURFACE_ID);
  if (existing?.__gameroadAdvanceReservationRuntime) return existing.__gameroadAdvanceReservationRuntime;
  ensureAdvanceReservationStyle(documentRef);

  const host = documentRef.createElement('section');
  host.id = ADVANCE_RESERVATION_SURFACE_ID;
  host.setAttribute('aria-label', '先行予約');
  const title = documentRef.createElement('div');
  title.className = 'advanceReservationTitle';
  title.textContent = '先行予約';
  host.appendChild(title);

  const rows = new Map();
  const makeRow = (role, interactive) => {
    const row = documentRef.createElement(interactive ? 'button' : 'div');
    if (interactive) row.type = 'button';
    row.className = 'advanceReservationRow';
    row.dataset.role = role;
    const roleNode = documentRef.createElement('span');
    roleNode.className = 'advanceReservationRole';
    const valueNode = documentRef.createElement('span');
    valueNode.className = 'advanceReservationValue';
    row.appendChild(roleNode);
    row.appendChild(valueNode);
    host.appendChild(row);
    rows.set(role, { row, roleNode, valueNode });
    return row;
  };

  const roadRow = makeRow('road', true);
  const battleRow = makeRow('battle', true);
  makeRow('ready', false);
  roadRow.addEventListener('click', () => focusExistingControl(road));
  battleRow.addEventListener('click', () => focusExistingControl(battle));
  rail.appendChild(host);

  let readyObserver = null;
  let observedReady = null;
  const MutationObserverCtor = globalRef?.MutationObserver;

  const syncReadyObserver = (ready) => {
    if (ready === observedReady) return;
    readyObserver?.disconnect?.();
    readyObserver = null;
    observedReady = ready;
    if (!ready || typeof MutationObserverCtor !== 'function') return;
    readyObserver = new MutationObserverCtor(() => render());
    readyObserver.observe(ready, { attributes: true, childList: true, characterData: true, subtree: true, attributeFilter: ['disabled', 'aria-disabled', 'aria-label', 'title'] });
  };

  const render = () => {
    const ready = findReadyControl(rail);
    syncReadyObserver(ready);
    const summary = projectBattleAdvanceReservationSummary({
      roadValue: road.value || '',
      roadLabel: selectedOptionLabel(road),
      battleValue: battle.value || '',
      battleLabel: selectedOptionLabel(battle),
      readyLabel: readyControlLabel(ready),
      readyAvailable: !!ready,
      readyDisabled: ready?.disabled === true || ready?.getAttribute?.('aria-disabled') === 'true',
    });
    for (const item of summary.rows) {
      const view = rows.get(item.role);
      if (!view) continue;
      view.roleNode.textContent = item.label;
      view.valueNode.textContent = item.value;
      view.row.dataset.state = item.state;
    }
    roadRow.disabled = road.disabled === true;
    battleRow.disabled = battle.disabled === true;
    return summary;
  };

  const onPlanChange = () => render();
  road.addEventListener?.('change', onPlanChange);
  battle.addEventListener?.('change', onPlanChange);
  road.addEventListener?.('input', onPlanChange);
  battle.addEventListener?.('input', onPlanChange);

  let destroyed = false;
  const runtime = Object.freeze({
    render,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      readyObserver?.disconnect?.();
      road.removeEventListener?.('change', onPlanChange);
      battle.removeEventListener?.('change', onPlanChange);
      road.removeEventListener?.('input', onPlanChange);
      battle.removeEventListener?.('input', onPlanChange);
      host.remove?.();
      return true;
    },
  });
  host.__gameroadAdvanceReservationRuntime = runtime;
  render();
  return runtime;
}

export function createBattleAutoInputController({
  readHumanLegalInputs,
  commitHumanInput,
  selectSituationCandidate = null,
} = {}) {
  if (typeof readHumanLegalInputs !== 'function') throw new TypeError('readHumanLegalInputs must be a function');
  if (typeof commitHumanInput !== 'function') throw new TypeError('commitHumanInput must be a function');
  if (selectSituationCandidate !== null && typeof selectSituationCandidate !== 'function') {
    throw new TypeError('selectSituationCandidate must be a function or null');
  }

  mountBattleAdvanceReservationSurface(globalThis);

  let mode = 'manual';
  let inFlightFrameKey = null;
  const committedFrames = new Set();

  function status() {
    return Object.freeze({
      mode,
      enabled: mode !== 'manual',
      inFlightFrameKey,
      committedFrameCount: committedFrames.size,
      persistence: 'none',
      targetSelection: 'manual',
      progressionAuthority: 'human-commit-path-only',
    });
  }

  async function readFrame() {
    try {
      return normalizeFrame(await readHumanLegalInputs());
    } catch {
      return null;
    }
  }

  async function choose(frame) {
    const candidates = selectableCandidates(frame);
    if (!candidates.length) return { candidate: null, reason: 'NO_AUTO_SELECTABLE_HUMAN_INPUT' };

    if (mode === 'situation') {
      if (!selectSituationCandidate) return { candidate: null, reason: 'SITUATION_SELECTOR_NOT_CONNECTED' };
      const publicCandidates = Object.freeze(candidates.map(freezePublicCandidate));
      let selectedId = null;
      try {
        selectedId = exactToken(await selectSituationCandidate(publicCandidates));
      } catch {
        return { candidate: null, reason: 'SITUATION_SELECTOR_FAILED' };
      }
      if (!selectedId) return { candidate: null, reason: 'SITUATION_SELECTOR_REJECTED' };
      const selected = candidates.find((candidate) => candidate.inputId === selectedId) || null;
      return selected
        ? { candidate: selected, reason: 'SITUATION_SELECTED' }
        : { candidate: null, reason: 'SITUATION_SELECTED_NONLEGAL_INPUT' };
    }

    const selected = deterministicSelect(candidates, mode);
    if (!selected) {
      const reason = mode === 'left' || mode === 'right'
        ? 'POSITION_ORDER_REQUIRED'
        : 'COMPARISON_VALUE_REQUIRED';
      return { candidate: null, reason };
    }
    return { candidate: selected, reason: `MODE_${mode.toUpperCase()}` };
  }

  return Object.freeze({
    setMode(nextMode) {
      if (!AUTO_MODES.has(nextMode)) return false;
      mode = nextMode;
      return true;
    },
    reset() {
      mode = 'manual';
      inFlightFrameKey = null;
      committedFrames.clear();
      return true;
    },
    status,
    async runOnce() {
      if (mode === 'manual') return fail('MANUAL_MODE');

      const first = await readFrame();
      if (!first) return fail('HUMAN_INPUT_FRAME_UNAVAILABLE');
      if (committedFrames.has(first.frameKey)) return fail('FRAME_ALREADY_COMMITTED', { frameKey: first.frameKey });
      if (inFlightFrameKey === first.frameKey) return fail('FRAME_COMMIT_IN_FLIGHT', { frameKey: first.frameKey });

      inFlightFrameKey = first.frameKey;
      try {
        const firstChoice = await choose(first);
        if (!firstChoice.candidate) return fail(firstChoice.reason, { frameKey: first.frameKey });

        const second = await readFrame();
        if (!second) return fail('HUMAN_INPUT_REVALIDATION_UNAVAILABLE', { frameKey: first.frameKey });
        if (second.frameKey !== first.frameKey) return fail('HUMAN_INPUT_FRAME_CHANGED', { frameKey: first.frameKey });

        const secondChoice = await choose(second);
        if (!secondChoice.candidate) return fail(secondChoice.reason, { frameKey: first.frameKey });
        if (!sameCandidateBoundary(firstChoice.candidate, secondChoice.candidate)) {
          return fail('AUTO_SELECTION_CHANGED_ON_REVALIDATION', { frameKey: first.frameKey });
        }

        let committed = false;
        try {
          committed = await commitHumanInput(secondChoice.candidate.commitInput) === true;
        } catch {
          return fail('HUMAN_COMMIT_PATH_FAILED', { frameKey: first.frameKey });
        }
        if (!committed) return fail('HUMAN_COMMIT_PATH_REJECTED', { frameKey: first.frameKey });

        committedFrames.add(first.frameKey);
        return Object.freeze({
          ok: true,
          committed: true,
          reason: secondChoice.reason,
          frameKey: first.frameKey,
          selected: freezePublicCandidate(secondChoice.candidate),
          commitPath: 'human',
          targetSelection: 'manual',
        });
      } finally {
        if (inFlightFrameKey === first.frameKey) inFlightFrameKey = null;
      }
    },
  });
}

export const BATTLE_AUTO_INPUT = Object.freeze({
  modes: Object.freeze([...AUTO_MODES]),
  defaultMode: 'manual',
  persistence: 'none',
  targetSelection: 'manual',
  progressionAuthority: 'human-commit-path-only',
});
