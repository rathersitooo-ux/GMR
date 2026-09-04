const AUTO_MODES = new Set(['manual', 'left', 'right', 'max', 'min', 'situation']);
const BLOCKED_KINDS = new Set(['target', 'column', 'shield']);

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
