export const SLIDEPAD_SLOT_ROLL_SCHEMA = 'gameroad.slidepad-slot-roll.v1';

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (!(number > 0)) throw new Error(`${label} must be greater than 0`);
  return number;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) throw new Error('items must be an array');
  const seen = new Set();
  const normalized = items.map((item, index) => {
    const source = item && typeof item === 'object' ? item : { id: item };
    const id = String(source.id ?? '').trim();
    if (!id) throw new Error(`items[${index}].id must be non-empty`);
    if (seen.has(id)) throw new Error(`items must have unique ids: ${id}`);
    seen.add(id);
    return Object.freeze({ ...source, id });
  });
  return Object.freeze(normalized);
}

function freezeState(state) {
  return Object.freeze({
    schema: SLIDEPAD_SLOT_ROLL_SCHEMA,
    items: state.items,
    index: state.index,
    itemId: state.items[state.index]?.id ?? null,
    carryPx: state.carryPx,
    totalSteps: state.totalSteps,
    lastDirection: state.lastDirection,
  });
}

export function wrapSlotRollIndex(index, count) {
  const size = Math.trunc(finite(count, 'count'));
  if (size <= 0) return -1;
  const raw = Math.trunc(finite(index, 'index'));
  return ((raw % size) + size) % size;
}

export function createSlotRollState({ items = [], anchorIndex = 0 } = {}) {
  const normalized = normalizeItems(items);
  const index = normalized.length ? wrapSlotRollIndex(anchorIndex, normalized.length) : -1;
  return freezeState({ items: normalized, index, carryPx: 0, totalSteps: 0, lastDirection: 0 });
}

export function stepSlotRoll(state, direction) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (state.items.length < 2) return state;
  const sign = Math.sign(finite(direction, 'direction'));
  if (sign === 0) return state;
  return freezeState({
    items: state.items,
    index: wrapSlotRollIndex(state.index + sign, state.items.length),
    carryPx: state.carryPx,
    totalSteps: state.totalSteps + sign,
    lastDirection: sign,
  });
}

export function advanceSlotRollDrag(state, { deltaPx = 0, detentPx } = {}) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  const delta = finite(deltaPx, 'deltaPx');
  const detent = positive(detentPx, 'detentPx');
  if (state.items.length < 2 || delta === 0) return Object.freeze({ state, detents: Object.freeze([]) });

  let index = state.index;
  let carryPx = state.carryPx + delta;
  let totalSteps = state.totalSteps;
  let lastDirection = state.lastDirection;
  const detents = [];

  while (Math.abs(carryPx) >= detent) {
    const direction = carryPx > 0 ? 1 : -1;
    const fromIndex = index;
    const toIndex = wrapSlotRollIndex(index + direction, state.items.length);
    index = toIndex;
    totalSteps += direction;
    lastDirection = direction;
    carryPx -= direction * detent;
    detents.push(Object.freeze({
      direction,
      fromIndex,
      toIndex,
      fromItemId: state.items[fromIndex]?.id ?? null,
      toItemId: state.items[toIndex]?.id ?? null,
      wrapped: direction > 0 ? toIndex < fromIndex : toIndex > fromIndex,
    }));
  }

  return Object.freeze({
    state: freezeState({ items: state.items, index, carryPx, totalSteps, lastDirection }),
    detents: Object.freeze(detents),
  });
}

export function projectSlotRollWindow(state, { radius = 1 } = {}) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (!state.items.length) return Object.freeze([]);
  const distance = Math.max(0, Math.trunc(finite(radius, 'radius')));
  const projected = [];
  for (let offset = -distance; offset <= distance; offset += 1) {
    const index = wrapSlotRollIndex(state.index + offset, state.items.length);
    projected.push(Object.freeze({
      offset,
      index,
      item: state.items[index],
      itemId: state.items[index].id,
      selected: offset === 0,
    }));
  }
  return Object.freeze(projected);
}

export function resolveSlotRollCommit(state) {
  if (!state || state.schema !== SLIDEPAD_SLOT_ROLL_SCHEMA) throw new Error('state must be a Slot Roll state');
  if (!state.items.length || state.index < 0) return null;
  return Object.freeze({
    index: state.index,
    item: state.items[state.index],
    itemId: state.items[state.index].id,
    totalSteps: state.totalSteps,
    lastDirection: state.lastDirection,
  });
}

// Battle field selection is intentionally housed in this already-publicly-packaged module.
// This keeps the Setup -> Battle player path live without manufacturing a second package/runtime registry.
export const BATTLE_FIELD_SELECTION_SCHEMA = 'gameroad.battle-field-selection.v1';
export const DEFAULT_BATTLE_FIELD_ID = 'FIELD-01';

const FIELD_STORAGE_KEY = 'gameroad.browser.battle-field-selection.v1';
const FIELD_STYLE_ID = 'gameroad-battle-field-selection-r1-style';
const FIELD_HOST_ID = 'gameroadBattleFieldSelection';
const FIELD_SETUP_SELECTOR = 'section[data-screen="setup"]';
const FIELD_BATTLE_SELECTOR = 'section[data-screen="battle"]';
const FIELD_START_SELECTOR = '#startMatch';
const field = (spec) => Object.freeze(spec);

export const BATTLE_FIELD_CATALOG = Object.freeze([
  field({ id: 'FIELD-01', name: '滝根渓谷・主戦場', shortName: '滝根渓谷', landmark: '滝', role: '標準', preview: 'linear-gradient(135deg,#183a2c 0%,#315c43 45%,#bc8b43 74%,#dce5d8 100%)', battleBackground: 'radial-gradient(circle at 18% 18%,rgba(219,236,224,.18),transparent 30%),linear-gradient(142deg,#10251c 0%,#224333 48%,#4f3d27 75%,#17261f 100%)' }),
  field({ id: 'FIELD-02', name: '巨大花園・土壌回廊', shortName: '巨大花園', landmark: '巨大花', role: '花園', preview: 'linear-gradient(135deg,#725a3e 0%,#9cbd67 38%,#e2a6ba 72%,#f4d7a2 100%)', battleBackground: 'radial-gradient(circle at 72% 18%,rgba(238,183,203,.25),transparent 34%),linear-gradient(145deg,#3e3326 0%,#6d7f43 43%,#9d6d73 72%,#332c26 100%)' }),
  field({ id: 'FIELD-03', name: '結晶祠・洞窟回廊', shortName: '結晶祠', landmark: '結晶', role: '洞窟', preview: 'linear-gradient(135deg,#11151b 0%,#26303a 43%,#b9dce7 72%,#eef2ef 100%)', battleBackground: 'radial-gradient(circle at 64% 20%,rgba(190,229,239,.26),transparent 31%),linear-gradient(145deg,#0d1116 0%,#1b252d 47%,#29414c 75%,#101419 100%)' }),
  field({ id: 'FIELD-04', name: '夕暮れ湿地・蜜灯', shortName: '夕暮れ湿地', landmark: '蜜灯', role: '湿地', preview: 'linear-gradient(135deg,#101b2d 0%,#4d3a2a 42%,#d8943c 72%,#f2c96b 100%)', battleBackground: 'radial-gradient(circle at 16% 24%,rgba(232,150,57,.28),transparent 31%),linear-gradient(150deg,#111a2b 0%,#203044 43%,#453525 72%,#171923 100%)' }),
  field({ id: 'FIELD-05', name: '樹冠吊橋・空中枝路', shortName: '樹冠吊橋', landmark: '吊橋', role: '樹冠', preview: 'linear-gradient(135deg,#33542f 0%,#776044 43%,#91c3d8 73%,#d8eced 100%)', battleBackground: 'radial-gradient(circle at 74% 13%,rgba(192,229,240,.26),transparent 34%),linear-gradient(145deg,#1c3726 0%,#3c5630 42%,#5e4a34 67%,#234154 100%)' }),
  field({ id: 'FIELD-08', name: '雨季水路・流木競技場', shortName: '雨季水路', landmark: '流木', role: '雨季', preview: 'linear-gradient(135deg,#263b43 0%,#4e6972 43%,#79654d 72%,#dce7e8 100%)', battleBackground: 'repeating-linear-gradient(102deg,rgba(230,240,242,.07) 0 1px,transparent 1px 18px),linear-gradient(145deg,#1d3037 0%,#38515a 46%,#554b3d 72%,#18262b 100%)' }),
  field({ id: 'FIELD-09', name: '雪根庭園・冬眠洞', shortName: '雪根庭園', landmark: '雪根', role: '冬季', preview: 'linear-gradient(135deg,#4a3b2f 0%,#6b7e68 36%,#d6e1df 69%,#fff 100%)', battleBackground: 'radial-gradient(circle at 72% 16%,rgba(245,249,248,.2),transparent 34%),linear-gradient(145deg,#2f302d 0%,#45594a 43%,#66756a 66%,#2f3a35 100%)' }),
]);

const FIELD_BY_ID = new Map(BATTLE_FIELD_CATALOG.map((entry) => [entry.id, entry]));
let selectedBattleFieldId = DEFAULT_BATTLE_FIELD_ID;
let battleFieldSessionId = '';
let battleFieldMounted = false;

export function resolveBattleField(fieldId) {
  return FIELD_BY_ID.get(String(fieldId || '').trim()) || null;
}

function currentBattleField() {
  return resolveBattleField(selectedBattleFieldId) || resolveBattleField(DEFAULT_BATTLE_FIELD_ID);
}

function readStoredBattleField() {
  try {
    const parsed = JSON.parse(globalThis.sessionStorage?.getItem(FIELD_STORAGE_KEY) || 'null');
    return resolveBattleField(parsed?.fieldId)?.id || null;
  } catch { return null; }
}

function writeStoredBattleField(fieldId) {
  try { globalThis.sessionStorage?.setItem(FIELD_STORAGE_KEY, JSON.stringify({ schema: BATTLE_FIELD_SELECTION_SCHEMA, fieldId })); } catch {}
}

function installBattleFieldStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(FIELD_STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = FIELD_STYLE_ID;
  style.textContent = `
#${FIELD_HOST_ID}{margin:10px 0 12px;padding:10px;border:1px solid rgba(231,243,238,.2);border-radius:14px;background:rgba(8,18,15,.72);box-shadow:0 10px 26px rgba(0,0,0,.16)}
#${FIELD_HOST_ID} .grFieldHead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 0 8px}#${FIELD_HOST_ID} .grFieldTitle{font-size:13px;font-weight:850;color:#f1f7f4}#${FIELD_HOST_ID} .grFieldCurrent{font-size:11px;font-weight:750;color:#b8d9cd;max-width:62%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${FIELD_HOST_ID} .grFieldChoices{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(120px,1fr);gap:7px;overflow-x:auto;overscroll-behavior-x:contain;padding:1px 1px 5px;scrollbar-width:thin}#${FIELD_HOST_ID} .grFieldChoice{appearance:none;border:1px solid rgba(226,241,235,.18);border-radius:11px;background:rgba(13,27,22,.82);color:#e9f3ef;padding:0;min-height:72px;text-align:left;overflow:hidden;cursor:pointer;touch-action:manipulation;transition:border-color 110ms ease,box-shadow 110ms ease,transform 110ms ease}#${FIELD_HOST_ID} .grFieldChoice[aria-pressed="true"]{border-color:#d5eee4;box-shadow:0 0 0 2px rgba(184,217,205,.22) inset,0 0 0 2px rgba(184,217,205,.11);transform:translateY(-1px)}#${FIELD_HOST_ID} .grFieldChoice:focus-visible{outline:3px solid #d8f0e7;outline-offset:2px}
#${FIELD_HOST_ID} .grFieldPreview{height:31px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid rgba(255,255,255,.12);font-size:10px;font-weight:900;letter-spacing:.12em;text-shadow:0 1px 3px rgba(0,0,0,.7)}#${FIELD_HOST_ID} .grFieldText{display:block;padding:6px 7px 7px}#${FIELD_HOST_ID} .grFieldName{display:block;font-size:11px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${FIELD_HOST_ID} .grFieldRole{display:block;margin-top:3px;font-size:9px;color:#a9c4ba}
section[data-screen="battle"] #battlePhaseSurface[data-battle-field-surface="1"]{background:var(--gameroad-battle-field-background)!important}
@media(max-width:700px){#${FIELD_HOST_ID}{margin:7px 0 8px;padding:7px 8px;border-radius:11px}#${FIELD_HOST_ID} .grFieldChoices{grid-auto-columns:108px;gap:6px}#${FIELD_HOST_ID} .grFieldChoice{min-height:62px}#${FIELD_HOST_ID} .grFieldPreview{height:24px}#${FIELD_HOST_ID} .grFieldText{padding:5px 6px}}
@media(orientation:landscape) and (max-height:420px) and (max-width:900px){#${FIELD_HOST_ID}{position:fixed;left:16px;top:58px;width:calc(46vw - 24px);max-width:290px;box-sizing:border-box;z-index:4;margin:0;padding:6px 7px;border-radius:10px}#${FIELD_HOST_ID} .grFieldHead{margin-bottom:5px}#${FIELD_HOST_ID} .grFieldChoices{grid-auto-columns:minmax(92px,1fr);padding-bottom:2px}#${FIELD_HOST_ID} .grFieldChoice{min-height:50px}#${FIELD_HOST_ID} .grFieldPreview{height:20px}#${FIELD_HOST_ID} .grFieldText{padding:3px 5px 4px}#${FIELD_HOST_ID} .grFieldRole{display:none}}
@media(prefers-reduced-motion:reduce){#${FIELD_HOST_ID} .grFieldChoice{transition:none}}
`;
  documentSource.head.append(style);
}

function renderBattleField(documentSource) {
  const current = currentBattleField();
  const host = documentSource?.getElementById?.(FIELD_HOST_ID);
  if (host) {
    const label = host.querySelector?.('[data-field-current]');
    if (label) label.textContent = current.name;
    for (const button of host.querySelectorAll?.('[data-field-id]') || []) button.setAttribute?.('aria-pressed', button.dataset?.fieldId === current.id ? 'true' : 'false');
  }
  const battle = documentSource?.querySelector?.(FIELD_BATTLE_SELECTOR);
  if (battle?.dataset) {
    battle.dataset.battleFieldId = current.id;
    battle.dataset.battleFieldName = current.name;
    if (battleFieldSessionId) battle.dataset.battleFieldSessionId = battleFieldSessionId;
    else delete battle.dataset.battleFieldSessionId;
    const surface = battle.querySelector?.('#battlePhaseSurface');
    if (surface) {
      surface.dataset.battleFieldSurface = '1';
      surface.style?.setProperty?.('--gameroad-battle-field-background', current.battleBackground);
    }
  }
  if (documentSource?.documentElement?.dataset) documentSource.documentElement.dataset.gameroadBattleFieldId = current.id;
}

function emitBattleField(documentSource, source) {
  if (typeof globalThis.CustomEvent !== 'function' || !documentSource?.dispatchEvent) return;
  const current = currentBattleField();
  documentSource.dispatchEvent(new globalThis.CustomEvent('gameroad:battle-field-selection', { detail: Object.freeze({ schema: BATTLE_FIELD_SELECTION_SCHEMA, fieldId: current.id, fieldName: current.name, sessionId: battleFieldSessionId || null, source }) }));
}

export function selectBattleField(fieldId, { document: documentSource = globalThis.document, persist = true, source = 'player' } = {}) {
  const selected = resolveBattleField(fieldId);
  if (!selected) return false;
  selectedBattleFieldId = selected.id;
  if (persist) writeStoredBattleField(selected.id);
  renderBattleField(documentSource);
  emitBattleField(documentSource, source);
  return true;
}

function makeBattleFieldButton(documentSource, entry) {
  const button = documentSource.createElement('button');
  button.type = 'button'; button.className = 'grFieldChoice'; button.dataset.fieldId = entry.id; button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `${entry.name}を選択`);
  const preview = documentSource.createElement('span'); preview.className = 'grFieldPreview'; preview.style.background = entry.preview; preview.textContent = entry.landmark; preview.setAttribute('aria-hidden', 'true');
  const text = documentSource.createElement('span'); text.className = 'grFieldText';
  const name = documentSource.createElement('span'); name.className = 'grFieldName'; name.textContent = entry.shortName;
  const role = documentSource.createElement('span'); role.className = 'grFieldRole'; role.textContent = entry.role;
  text.append(name, role); button.append(preview, text);
  button.addEventListener('click', () => selectBattleField(entry.id, { document: documentSource }));
  return button;
}

function ensureBattleFieldPicker(documentSource) {
  const setup = documentSource?.querySelector?.(FIELD_SETUP_SELECTOR);
  if (!setup) return null;
  const existing = documentSource.getElementById?.(FIELD_HOST_ID);
  if (existing) return existing;
  const host = documentSource.createElement('section'); host.id = FIELD_HOST_ID; host.dataset.battleFieldSelection = '1'; host.setAttribute('aria-label', '対戦フィールド');
  const head = documentSource.createElement('div'); head.className = 'grFieldHead';
  const title = documentSource.createElement('span'); title.className = 'grFieldTitle'; title.textContent = '対戦フィールド';
  const current = documentSource.createElement('span'); current.className = 'grFieldCurrent'; current.dataset.fieldCurrent = '1'; current.setAttribute('aria-live', 'polite'); head.append(title, current);
  const choices = documentSource.createElement('div'); choices.className = 'grFieldChoices'; choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '対戦フィールドを選択');
  for (const entry of BATTLE_FIELD_CATALOG) choices.append(makeBattleFieldButton(documentSource, entry));
  host.append(head, choices);
  const setupBox = setup.querySelector?.('.setupBox') || setup;
  const start = setup.querySelector?.(FIELD_START_SELECTOR);
  if (start?.parentElement === setupBox && typeof setupBox.insertBefore === 'function') setupBox.insertBefore(host, start); else setupBox.append?.(host);
  return host;
}

function bindBattleFieldStart(documentSource) {
  const start = documentSource?.querySelector?.(`${FIELD_SETUP_SELECTOR} ${FIELD_START_SELECTOR}`);
  if (!start || start.dataset?.battleFieldSelectionBound === '1') return;
  start.dataset.battleFieldSelectionBound = '1';
  start.addEventListener?.('click', () => {
    if (start.disabled) return;
    globalThis.setTimeout?.(() => {
      const battle = documentSource.querySelector?.(FIELD_BATTLE_SELECTOR);
      if (!battle?.classList?.contains?.('active')) return;
      const matchId = globalThis.__GAMEROAD_TEST__?.state?.match?.id;
      battleFieldSessionId = typeof matchId === 'string' && matchId.trim() ? matchId.trim() : `local-${Date.now().toString(36)}`;
      renderBattleField(documentSource); emitBattleField(documentSource, 'match_start');
    }, 0);
  });
}

export function mountBattleFieldSelection({ document: documentSource = globalThis.document } = {}) {
  if (!documentSource?.querySelector) return false;
  installBattleFieldStyle(documentSource);
  const stored = readStoredBattleField(); if (stored) selectedBattleFieldId = stored;
  ensureBattleFieldPicker(documentSource); bindBattleFieldStart(documentSource); renderBattleField(documentSource); battleFieldMounted = true;
  return true;
}

export function battleFieldSelectionSnapshot() {
  const current = currentBattleField();
  return Object.freeze({ schema: BATTLE_FIELD_SELECTION_SCHEMA, mounted: battleFieldMounted, fieldId: current.id, fieldName: current.name, sessionId: battleFieldSessionId || null });
}

if (typeof globalThis === 'object') globalThis.GAMEROAD_BATTLE_FIELD_SELECTION = Object.freeze({ schema: BATTLE_FIELD_SELECTION_SCHEMA, catalog: BATTLE_FIELD_CATALOG, defaultFieldId: DEFAULT_BATTLE_FIELD_ID, resolve: resolveBattleField, select: selectBattleField, snapshot: battleFieldSelectionSnapshot, mount: mountBattleFieldSelection });
if (typeof globalThis.document === 'object') {
  if (globalThis.document.readyState === 'loading') globalThis.document.addEventListener('DOMContentLoaded', () => mountBattleFieldSelection(), { once: true });
  else mountBattleFieldSelection();
}
