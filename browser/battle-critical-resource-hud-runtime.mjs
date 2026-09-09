const RESOURCE_HUD_SCHEMA = 'gameroad.battle-critical-resource-hud.v1';
const RESOURCE_HUD_ATTR = 'data-battle-critical-resource-hud';
const STYLE_ID = 'gameroad-battle-critical-resource-hud-style';
const UNRESOLVED = '—';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function signedInteger(value) {
  return Number.isSafeInteger(value) ? value : null;
}

function authorityLabel(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function projectBattleCriticalResourceSnapshot(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const honeyValue = nonNegativeInteger(source.honey);
  const chipCount = nonNegativeInteger(source.chipCount);
  const honeyDelta = signedInteger(source.honeyDelta);
  const honeyDeltaSource = authorityLabel(source.honeyDeltaSource);

  return deepFreeze({
    schema: RESOURCE_HUD_SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    honey: {
      resolved: honeyValue !== null,
      value: honeyValue,
      text: honeyValue === null ? UNRESOLVED : String(honeyValue),
      deltaResolved: honeyDelta !== null && honeyDeltaSource !== null,
      delta: honeyDelta,
      deltaSource: honeyDeltaSource,
      deltaText: honeyDelta !== null && honeyDeltaSource !== null
        ? `${honeyDelta > 0 ? '+' : ''}${honeyDelta}・${honeyDeltaSource}`
        : ''
    },
    chip: {
      resolved: chipCount !== null,
      count: chipCount,
      text: chipCount === null ? UNRESOLVED : String(chipCount)
    }
  });
}

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('BATTLE_RESOURCE_HUD_DOCUMENT_REQUIRED');
  }
  return document;
}

function createNode(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function addStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = createNode(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[${RESOURCE_HUD_ATTR}="1"]{display:flex;align-items:stretch;gap:4px;min-width:0;pointer-events:none}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{display:grid;grid-template-columns:auto;align-content:center;gap:1px;min-width:42px;padding:3px 6px;border:1px solid rgba(225,244,215,.18);border-radius:8px;background:rgba(3,20,17,.64);color:inherit;text-shadow:inherit}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:9px;font-weight:900;line-height:1;letter-spacing:.06em;opacity:.76;white-space:nowrap}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:15px;font-weight:1000;line-height:1.05}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:8px;font-weight:800;line-height:1.05;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:82px}
[${RESOURCE_HUD_ATTR}="1"] [data-resolved="false"] .grBattleResourceValue{opacity:.54}
@media(max-height:420px),(max-width:720px){[${RESOURCE_HUD_ATTR}="1"]{gap:2px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{min-width:36px;padding:2px 4px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:8px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:13px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:7px;max-width:58px}}
@media(prefers-reduced-motion:reduce){[${RESOURCE_HUD_ATTR}="1"] *{transition:none!important;animation:none!important}}
`;
  document.head?.appendChild(style);
}

function createResourceCell(document, label, key) {
  const cell = createNode(document, 'div', 'grBattleResourceCell');
  cell.dataset.resource = key;
  const name = createNode(document, 'small', '', label);
  const value = createNode(document, 'b', 'grBattleResourceValue', UNRESOLVED);
  const delta = createNode(document, 'span', 'grBattleResourceDelta');
  delta.hidden = true;
  cell.appendChild(name);
  cell.appendChild(value);
  cell.appendChild(delta);
  return { cell, value, delta };
}

export function mountBattleCriticalResourceHud(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const host = options.host;
  if (!host || typeof host.appendChild !== 'function') {
    throw new TypeError('BATTLE_RESOURCE_HUD_HOST_REQUIRED');
  }
  addStyle(document);

  const root = createNode(document, 'div', 'grBattleCriticalResourceHud');
  root.setAttribute?.(RESOURCE_HUD_ATTR, '1');
  root.dataset.presentationOnly = 'true';
  root.dataset.authority = 'caller_authoritative_resource_snapshot_only';
  root.setAttribute?.('aria-label', '対戦資源');

  const honey = createResourceCell(document, 'ハニー', 'honey');
  const chip = createResourceCell(document, 'チップ', 'chip');
  root.appendChild(honey.cell);
  root.appendChild(chip.cell);
  host.appendChild(root);

  let destroyed = false;
  let lastSnapshot = null;

  function sync(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_RESOURCE_HUD_DESTROYED');
    const model = projectBattleCriticalResourceSnapshot(snapshot);
    honey.value.textContent = model.honey.text;
    chip.value.textContent = model.chip.text;
    setData(honey.cell, 'resolved', model.honey.resolved);
    setData(chip.cell, 'resolved', model.chip.resolved);
    setData(root, 'honeyResolved', model.honey.resolved);
    setData(root, 'chipResolved', model.chip.resolved);
    honey.delta.textContent = model.honey.deltaText;
    honey.delta.hidden = !model.honey.deltaResolved;
    setData(honey.delta, 'resolved', model.honey.deltaResolved);
    root.setAttribute?.('aria-label', `対戦資源 ハニー ${model.honey.text}、チップ ${model.chip.text}`);
    lastSnapshot = model;
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (root.parentNode && typeof root.parentNode.removeChild === 'function') root.parentNode.removeChild(root);
    return true;
  }

  sync(options.snapshot ?? {});

  return Object.freeze({
    schema: RESOURCE_HUD_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    resourceAuthority: 'CALLER_ONLY',
    root,
    honeyCell: honey.cell,
    chipCell: chip.cell,
    sync,
    snapshot: () => lastSnapshot,
    destroy
  });
}

export const BATTLE_CRITICAL_RESOURCE_HUD_RUNTIME = deepFreeze({
  schema: RESOURCE_HUD_SCHEMA,
  mount: 'explicit_caller_mount_only',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  resourceAuthority: 'CALLER_ONLY',
  resources: Object.freeze(['honey', 'chipCount']),
  unresolvedToken: UNRESOLVED,
  honeyDeltaAuthority: 'CALLER_ONLY_OPTIONAL',
  chipIdentityPublicityOwnedHere: false,
  resourceCalculationOwnedHere: false,
  resourceStoreOwnedHere: false,
  productionHtmlMutationOwnedHere: false
});
