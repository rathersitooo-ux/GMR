import {
  advanceSlotRollDrag,
  createSlotRollState,
  resolveSlotRollCommit,
  stepSlotRoll,
  wrapSlotRollIndex,
} from './slidepad-slot-roll-core.mjs';

export const BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA = 'gameroad.battle-playable-hand-row-roulette.v1';
export const BATTLE_PLAYABLE_HAND_ROW_ROULETTE_PLACEMENT = Object.freeze({
  side: 'RIGHT',
  anchor: 'BOTTOM_RIGHT_THUMB_CLUSTER',
  orientation: 'VERTICAL_STACKED_ROWS',
  boardOcclusion: 'FORBIDDEN',
  ordinaryHandRemainsVisible: true,
});
export const BATTLE_PLAYABLE_HAND_ROW_ROULETTE_STYLE_ID = 'gameroad-battle-playable-hand-row-roulette-r1-style';

const DEFAULT_VISIBLE_ROW_COUNT = 5;
const DEFAULT_DETENT_PX = 36;
const MAX_VISIBLE_ROW_COUNT = 7;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeCandidateCardIds(candidateCardIds) {
  if (!Array.isArray(candidateCardIds)) return Object.freeze([]);
  const seen = new Set();
  const ids = [];
  for (const raw of candidateCardIds) {
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return Object.freeze(ids);
}

function sameCandidateIds(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function normalizeVisibleRowCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_VISIBLE_ROW_COUNT;
  return Math.max(1, Math.min(MAX_VISIBLE_ROW_COUNT, Math.trunc(numeric)));
}

function readCardPresentation(cardPresentationById, cardId) {
  let source = null;
  if (cardPresentationById instanceof Map) source = cardPresentationById.get(cardId) ?? null;
  else if (cardPresentationById && typeof cardPresentationById === 'object') source = cardPresentationById[cardId] ?? null;
  source = source && typeof source === 'object' ? source : {};
  return Object.freeze({
    id: cardId,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim() : cardId,
    shortLabel: typeof source.shortLabel === 'string' && source.shortLabel.trim()
      ? source.shortLabel.trim()
      : (typeof source.label === 'string' && source.label.trim() ? source.label.trim() : cardId),
    suit: typeof source.suit === 'string' ? source.suit.trim() : '',
    number: source.number ?? null,
    artUrl: typeof source.artUrl === 'string' ? source.artUrl.trim() : '',
  });
}

function normalizeCardPresentationById(candidateCardIds, cardPresentationById) {
  const normalized = {};
  for (const cardId of candidateCardIds) {
    const presentation = readCardPresentation(cardPresentationById, cardId);
    normalized[cardId] = {
      label: presentation.label,
      shortLabel: presentation.shortLabel,
      suit: presentation.suit,
      number: presentation.number,
      artUrl: presentation.artUrl,
    };
  }
  return deepFreeze(normalized);
}

function buildItems(candidateCardIds, cardPresentationById) {
  return Object.freeze(candidateCardIds.map((cardId) => readCardPresentation(cardPresentationById, cardId)));
}

function rowOffsets(count, visibleRowCount) {
  if (count <= 0) return [];
  if (count === 1) return [0];
  if (count === 2) return [0, 1];
  const maxRows = Math.min(count, visibleRowCount);
  const oddRows = maxRows % 2 === 0 ? maxRows - 1 : maxRows;
  const radius = Math.max(1, Math.floor(oddRows / 2));
  const offsets = [];
  for (let offset = -radius; offset <= radius; offset += 1) offsets.push(offset);
  return offsets;
}

function projectRows(state, visibleRowCount) {
  if (!state?.items?.length || state.index < 0) return Object.freeze([]);
  const rows = rowOffsets(state.items.length, visibleRowCount).map((offset) => {
    const index = wrapSlotRollIndex(state.index + offset, state.items.length);
    const item = state.items[index];
    return Object.freeze({
      offset,
      index,
      cardId: item.id,
      label: item.label,
      shortLabel: item.shortLabel,
      suit: item.suit,
      number: item.number,
      artUrl: item.artUrl,
      selected: offset === 0,
      position: offset < 0 ? 'BEFORE' : offset > 0 ? 'AFTER' : 'SELECTED',
    });
  });
  return Object.freeze(rows);
}

function freezeModel({
  candidateCardIds,
  cardPresentationById,
  state,
  visibleRowCount,
  reducedMotion,
  lowPerf,
}) {
  return deepFreeze({
    schema: BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA,
    placement: BATTLE_PLAYABLE_HAND_ROW_ROULETTE_PLACEMENT,
    candidateCardIds,
    selectedCardId: state?.itemId ?? null,
    visibleRowCount,
    reducedMotion: reducedMotion === true,
    lowPerf: lowPerf === true,
    state,
    rows: projectRows(state, visibleRowCount),
    cardPresentationById,
  });
}

export function createBattlePlayableHandRowRouletteModel({
  candidateCardIds = [],
  cardPresentationById = {},
  anchorCardId = null,
  visibleRowCount = DEFAULT_VISIBLE_ROW_COUNT,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const ids = normalizeCandidateCardIds(candidateCardIds);
  const normalizedPresentations = normalizeCardPresentationById(ids, cardPresentationById);
  const items = buildItems(ids, normalizedPresentations);
  const anchorIndex = anchorCardId ? Math.max(0, ids.indexOf(anchorCardId)) : 0;
  const state = createSlotRollState({ items, anchorIndex });
  return freezeModel({
    candidateCardIds: ids,
    cardPresentationById: normalizedPresentations,
    state,
    visibleRowCount: normalizeVisibleRowCount(visibleRowCount),
    reducedMotion,
    lowPerf,
  });
}

export function reconcileBattlePlayableHandRowRouletteModel(model, {
  candidateCardIds = [],
  cardPresentationById = model?.cardPresentationById ?? {},
  preferredCardId = model?.selectedCardId ?? null,
} = {}) {
  const ids = normalizeCandidateCardIds(candidateCardIds);
  const anchor = preferredCardId && ids.includes(preferredCardId) ? preferredCardId : ids[0] ?? null;
  return createBattlePlayableHandRowRouletteModel({
    candidateCardIds: ids,
    cardPresentationById,
    anchorCardId: anchor,
    visibleRowCount: model?.visibleRowCount ?? DEFAULT_VISIBLE_ROW_COUNT,
    reducedMotion: model?.reducedMotion === true,
    lowPerf: model?.lowPerf === true,
  });
}

export function stepBattlePlayableHandRowRoulette(model, direction) {
  if (!model || model.schema !== BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA) {
    throw new TypeError('model must be a Battle playable-hand row roulette model');
  }
  const state = stepSlotRoll(model.state, direction);
  return freezeModel({ ...model, state });
}

export function advanceBattlePlayableHandRowRouletteDrag(model, {
  deltaPx = 0,
  detentPx = DEFAULT_DETENT_PX,
} = {}) {
  if (!model || model.schema !== BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA) {
    throw new TypeError('model must be a Battle playable-hand row roulette model');
  }
  const result = advanceSlotRollDrag(model.state, { deltaPx, detentPx });
  return deepFreeze({
    model: freezeModel({ ...model, state: result.state }),
    detents: result.detents,
  });
}

export function selectBattlePlayableHandRowRouletteCard(model, cardId) {
  if (!model || model.schema !== BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA) {
    throw new TypeError('model must be a Battle playable-hand row roulette model');
  }
  const normalized = typeof cardId === 'string' ? cardId.trim() : '';
  const index = model.candidateCardIds.indexOf(normalized);
  if (index < 0) return model;
  const state = createSlotRollState({ items: model.state.items, anchorIndex: index });
  return freezeModel({ ...model, state });
}

export function prepareBattlePlayableHandRowRouletteCommit(model, freshCandidateCardIds = []) {
  if (!model || model.schema !== BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA) {
    throw new TypeError('model must be a Battle playable-hand row roulette model');
  }
  const commit = resolveSlotRollCommit(model.state);
  if (!commit?.itemId) {
    return deepFreeze({ status: 'NO_SELECTION', cardId: null });
  }
  const fresh = normalizeCandidateCardIds(freshCandidateCardIds);
  if (!fresh.includes(commit.itemId)) {
    return deepFreeze({ status: 'STALE_SELECTION', cardId: commit.itemId });
  }
  return deepFreeze({ status: 'READY', cardId: commit.itemId });
}

function projectionCandidateIds(projection) {
  if (Array.isArray(projection)) return normalizeCandidateCardIds(projection);
  return normalizeCandidateCardIds(projection?.candidateCardIds);
}

export function createBattlePlayableHandRowRouletteController({
  getCandidateProjection,
  getCardPresentation = () => null,
  delegateHandCardAction,
  visibleRowCount = DEFAULT_VISIBLE_ROW_COUNT,
  reducedMotion = false,
  lowPerf = false,
  onModelChange = null,
} = {}) {
  if (typeof getCandidateProjection !== 'function') {
    throw new TypeError('getCandidateProjection must be a function');
  }
  if (typeof delegateHandCardAction !== 'function') {
    throw new TypeError('delegateHandCardAction must be a function');
  }

  let model = createBattlePlayableHandRowRouletteModel({
    visibleRowCount,
    reducedMotion,
    lowPerf,
  });
  let queueTail = Promise.resolve();
  let queuedCount = 0;

  function presentations(ids) {
    const entries = {};
    for (const id of ids) {
      const source = getCardPresentation(id);
      if (source && typeof source === 'object') entries[id] = source;
    }
    return entries;
  }

  function emit() {
    if (typeof onModelChange === 'function') onModelChange(model);
    return model;
  }

  function refresh(preferredCardId = model.selectedCardId) {
    const ids = projectionCandidateIds(getCandidateProjection());
    if (sameCandidateIds(ids, model.candidateCardIds) && (!preferredCardId || preferredCardId === model.selectedCardId)) {
      return emit();
    }
    model = reconcileBattlePlayableHandRowRouletteModel(model, {
      candidateCardIds: ids,
      cardPresentationById: presentations(ids),
      preferredCardId,
    });
    return emit();
  }

  function select(cardId) {
    refresh(model.selectedCardId);
    model = selectBattlePlayableHandRowRouletteCard(model, cardId);
    return emit();
  }

  function step(direction) {
    refresh(model.selectedCardId);
    model = stepBattlePlayableHandRowRoulette(model, direction);
    return emit();
  }

  function drag(deltaPx, detentPx = DEFAULT_DETENT_PX) {
    refresh(model.selectedCardId);
    const result = advanceBattlePlayableHandRowRouletteDrag(model, { deltaPx, detentPx });
    model = result.model;
    emit();
    return result;
  }

  function requestCommit(cardId = model.selectedCardId) {
    const requestedCardId = typeof cardId === 'string' ? cardId.trim() : '';
    queuedCount += 1;
    const execute = async () => {
      try {
        const freshIds = projectionCandidateIds(getCandidateProjection());
        model = reconcileBattlePlayableHandRowRouletteModel(model, {
          candidateCardIds: freshIds,
          cardPresentationById: presentations(freshIds),
          preferredCardId: requestedCardId || model.selectedCardId,
        });
        emit();

        if (!requestedCardId) {
          return deepFreeze({ status: 'NO_SELECTION', cardId: null });
        }
        if (!freshIds.includes(requestedCardId)) {
          return deepFreeze({ status: 'REJECTED_STALE', cardId: requestedCardId });
        }

        model = selectBattlePlayableHandRowRouletteCard(model, requestedCardId);
        emit();
        const prepared = prepareBattlePlayableHandRowRouletteCommit(model, freshIds);
        if (prepared.status !== 'READY') {
          return deepFreeze({ status: 'REJECTED_STALE', cardId: requestedCardId });
        }

        const result = await delegateHandCardAction(requestedCardId);
        refresh(requestedCardId);
        return deepFreeze({ status: 'COMMITTED', cardId: requestedCardId, result });
      } finally {
        queuedCount = Math.max(0, queuedCount - 1);
      }
    };
    const promise = queueTail.then(execute, execute);
    queueTail = promise.then(() => undefined, () => undefined);
    return promise;
  }

  return Object.freeze({
    snapshot() {
      return deepFreeze({ model, queuedCount });
    },
    refresh,
    select,
    step,
    drag,
    requestCommit,
  });
}

export const BATTLE_PLAYABLE_HAND_ROW_ROULETTE_CSS = `
section[data-screen="battle"] [data-battle-playable-hand-row-roulette-live="1"][data-battle-playable-hand-row-roulette="1"]{
  position:absolute;
  left:auto;
  right:268px;
  bottom:max(12px,env(safe-area-inset-bottom));
  z-index:41;
  max-width:min(236px,36vw);
  transform-origin:right bottom;
}
[data-battle-playable-hand-row-roulette]{
  --gr-row-h:40px;
  --gr-row-gap:5px;
  --gr-row-shift:10px;
  box-sizing:border-box;
  width:clamp(158px,22vw,236px);
  max-width:100%;
  color:#f7fbff;
  font-family:inherit;
  touch-action:none;
  user-select:none;
  -webkit-user-select:none;
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteRail{
  display:flex;
  flex-direction:column;
  gap:var(--gr-row-gap);
  padding:5px 8px 5px 5px;
  border-radius:18px;
  background:linear-gradient(90deg,rgba(4,13,24,.72),rgba(8,29,48,.42) 74%,rgba(8,29,48,0));
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow{
  position:relative;
  display:grid;
  grid-template-columns:30px minmax(0,1fr) auto;
  align-items:center;
  gap:7px;
  min-height:var(--gr-row-h);
  padding:5px 12px 5px 8px;
  border:1px solid rgba(197,230,255,.36);
  border-left-width:3px;
  clip-path:polygon(0 0,92% 0,100% 50%,92% 100%,0 100%,4% 50%);
  background:linear-gradient(90deg,rgba(10,52,82,.94),rgba(12,76,116,.74) 70%,rgba(17,105,153,.34));
  color:inherit;
  text-align:left;
  cursor:pointer;
  transform-origin:left center;
  transition:transform 120ms ease,opacity 120ms ease,filter 120ms ease,background 120ms ease;
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow[data-selected="true"]{
  z-index:2;
  transform:translateX(var(--gr-row-shift)) scale(1.035);
  border-color:rgba(246,252,255,.92);
  background:linear-gradient(90deg,rgba(18,91,139,.98),rgba(23,133,192,.9) 72%,rgba(109,207,255,.48));
  box-shadow:0 0 0 1px rgba(255,255,255,.24) inset,0 6px 18px rgba(0,17,32,.28);
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow[data-position="BEFORE"],
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow[data-position="AFTER"]{
  opacity:.72;
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteThumb{
  width:28px;height:28px;border-radius:7px;overflow:hidden;
  display:grid;place-items:center;
  border:1px solid rgba(222,241,255,.4);
  background:rgba(255,255,255,.08);
  font-size:12px;font-weight:900;
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteThumb img{width:100%;height:100%;object-fit:cover;display:block}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteLabel{
  min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  font-size:12px;font-weight:850;letter-spacing:.01em;
  text-shadow:0 1px 2px rgba(0,0,0,.5);
}
[data-battle-playable-hand-row-roulette] .grBattleHandRouletteMeta{
  font-size:10px;font-weight:850;opacity:.86;white-space:nowrap;
}
[data-battle-playable-hand-row-roulette][data-empty="true"]{display:none}
[data-battle-playable-hand-row-roulette][data-low-perf="true"] .grBattleHandRouletteRow{
  box-shadow:none!important;filter:none!important;
}
@media (orientation:landscape) and (max-height:430px){
  section[data-screen="battle"] [data-battle-playable-hand-row-roulette-live="1"][data-battle-playable-hand-row-roulette="1"]{right:202px;bottom:9px;left:auto;transform:scale(.72);transform-origin:right bottom}
  [data-battle-playable-hand-row-roulette]{--gr-row-h:34px;--gr-row-gap:3px;width:clamp(148px,23vw,206px)}
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteRail{padding:3px 7px 3px 4px;border-radius:14px}
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow{grid-template-columns:25px minmax(0,1fr) auto;gap:5px;padding:3px 10px 3px 6px}
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteThumb{width:24px;height:24px;border-radius:6px}
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteLabel{font-size:11px}
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteMeta{font-size:9px}
}
@media (orientation:portrait) and (max-width:540px){
  section[data-screen="battle"] [data-battle-playable-hand-row-roulette-live="1"][data-battle-playable-hand-row-roulette="1"]{right:12px;bottom:392px;left:auto;max-width:46vw;transform:scale(.86);transform-origin:right bottom}
}
@media (prefers-reduced-motion:reduce){
  [data-battle-playable-hand-row-roulette] .grBattleHandRouletteRow{transition:none}
}
`;

export function installBattlePlayableHandRowRouletteStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(BATTLE_PLAYABLE_HAND_ROW_ROULETTE_STYLE_ID)) return null;
  const style = documentSource.createElement('style');
  style.id = BATTLE_PLAYABLE_HAND_ROW_ROULETTE_STYLE_ID;
  style.textContent = BATTLE_PLAYABLE_HAND_ROW_ROULETTE_CSS;
  documentSource.head.appendChild(style);
  return style;
}

function rowMetaText(row) {
  const tokens = [];
  if (row.suit) tokens.push(row.suit);
  if (row.number !== null && row.number !== undefined && String(row.number).trim()) tokens.push(String(row.number));
  return tokens.join(' ');
}

export function renderBattlePlayableHandRowRoulette(host, model, {
  document: documentSource = host?.ownerDocument ?? globalThis.document,
  onSelect = null,
  onCommit = null,
} = {}) {
  if (!host || !documentSource || !model || model.schema !== BATTLE_PLAYABLE_HAND_ROW_ROULETTE_SCHEMA) return false;
  installBattlePlayableHandRowRouletteStyle(documentSource);
  host.setAttribute('data-battle-playable-hand-row-roulette', '1');
  host.setAttribute('data-empty', model.rows.length ? 'false' : 'true');
  host.setAttribute('data-reduced-motion', model.reducedMotion ? 'true' : 'false');
  host.setAttribute('data-low-perf', model.lowPerf ? 'true' : 'false');
  host.setAttribute('role', 'listbox');
  host.setAttribute('aria-label', '残り手札ルーレット');
  host.replaceChildren();

  const rail = documentSource.createElement('div');
  rail.className = 'grBattleHandRouletteRail';

  for (const row of model.rows) {
    const button = documentSource.createElement('button');
    button.type = 'button';
    button.className = 'grBattleHandRouletteRow';
    button.dataset.cardId = row.cardId;
    button.dataset.selected = row.selected ? 'true' : 'false';
    button.dataset.position = row.position;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', row.selected ? 'true' : 'false');
    button.setAttribute('aria-label', row.label);

    const thumb = documentSource.createElement('span');
    thumb.className = 'grBattleHandRouletteThumb';
    if (row.artUrl) {
      const image = documentSource.createElement('img');
      image.src = row.artUrl;
      image.alt = '';
      thumb.appendChild(image);
    } else {
      thumb.textContent = row.suit || '札';
    }

    const label = documentSource.createElement('span');
    label.className = 'grBattleHandRouletteLabel';
    label.textContent = row.shortLabel;

    const meta = documentSource.createElement('span');
    meta.className = 'grBattleHandRouletteMeta';
    meta.textContent = rowMetaText(row);

    button.append(thumb, label, meta);
    button.addEventListener('click', () => {
      if (row.selected) {
        if (typeof onCommit === 'function') onCommit(row.cardId);
      } else if (typeof onSelect === 'function') {
        onSelect(row.cardId);
      }
    });
    rail.appendChild(button);
  }

  host.appendChild(rail);
  return true;
}

export function mountBattlePlayableHandRowRoulette({
  document: documentSource = globalThis.document,
  host,
  controller,
  detentPx = DEFAULT_DETENT_PX,
  onDetent = null,
  onCommitResult = null,
} = {}) {
  if (!host || !documentSource || !controller) return null;
  let lastY = null;

  function render() {
    const model = controller.snapshot().model;
    renderBattlePlayableHandRowRoulette(host, model, {
      document: documentSource,
      onSelect(cardId) {
        controller.select(cardId);
        render();
      },
      async onCommit(cardId) {
        const result = await controller.requestCommit(cardId);
        if (typeof onCommitResult === 'function') onCommitResult(result);
        render();
      },
    });
  }

  function onPointerDown(event) {
    lastY = Number(event.clientY);
    host.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!Number.isFinite(lastY)) return;
    const nextY = Number(event.clientY);
    if (!Number.isFinite(nextY)) return;
    const deltaY = nextY - lastY;
    if (Math.abs(deltaY) < 1) return;
    lastY = nextY;
    const result = controller.drag(-deltaY, detentPx);
    if (result.detents.length) {
      if (typeof onDetent === 'function') {
        for (const detent of result.detents) onDetent(detent);
      }
      render();
    }
  }

  function onPointerEnd(event) {
    lastY = null;
    host.releasePointerCapture?.(event.pointerId);
  }

  function onWheel(event) {
    if (!event.deltaY) return;
    event.preventDefault();
    controller.step(event.deltaY > 0 ? 1 : -1);
    render();
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      controller.step(1);
      render();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      controller.step(-1);
      render();
    } else if (event.key === 'Enter' || event.key === ' ') {
      const cardId = controller.snapshot().model.selectedCardId;
      if (!cardId) return;
      event.preventDefault();
      controller.requestCommit(cardId).then((result) => {
        if (typeof onCommitResult === 'function') onCommitResult(result);
        render();
      });
    }
  }

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerEnd);
  host.addEventListener('pointercancel', onPointerEnd);
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('keydown', onKeyDown);
  host.tabIndex = host.tabIndex >= 0 ? host.tabIndex : 0;

  controller.refresh();
  render();

  return Object.freeze({
    refresh() {
      controller.refresh();
      render();
      return controller.snapshot();
    },
    destroy() {
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerEnd);
      host.removeEventListener('pointercancel', onPointerEnd);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('keydown', onKeyDown);
      host.replaceChildren();
    },
  });
}
