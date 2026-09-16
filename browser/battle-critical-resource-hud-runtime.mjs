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

function projectPaymentReceipt(value, manaCurrent, honeyCurrent) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cost = nonNegativeInteger(value.cost);
  const manaPaid = nonNegativeInteger(value.manaPaid);
  const honeyPaid = nonNegativeInteger(value.honeyPaid);
  const manaAfter = nonNegativeInteger(value.manaAfter);
  const honeyAfter = nonNegativeInteger(value.honeyAfter);
  const source = authorityLabel(value.source);
  const complete = cost !== null
    && manaPaid !== null
    && honeyPaid !== null
    && manaAfter !== null
    && honeyAfter !== null
    && source !== null;
  if (!complete) return null;
  if (manaPaid + honeyPaid !== cost) return null;
  if (honeyPaid > 0 && manaAfter !== 0) return null;
  if (manaCurrent === null || honeyCurrent === null) return null;
  if (manaAfter !== manaCurrent || honeyAfter !== honeyCurrent) return null;
  return Object.freeze({ cost, manaPaid, honeyPaid, manaAfter, honeyAfter, source });
}

export function projectBattleCriticalResourceSnapshot(snapshot = {}) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const manaCurrent = nonNegativeInteger(source.manaCurrent);
  const manaMax = nonNegativeInteger(source.manaMax);
  const manaResolved = manaCurrent !== null && manaMax !== null && manaMax > 0 && manaCurrent <= manaMax;
  const honeyValue = nonNegativeInteger(source.honey);
  const chipCount = nonNegativeInteger(source.chipCount);
  const honeyDelta = signedInteger(source.honeyDelta);
  const honeyDeltaSource = authorityLabel(source.honeyDeltaSource);
  const paymentReceipt = projectPaymentReceipt(
    source.paymentReceipt,
    manaResolved ? manaCurrent : null,
    honeyValue,
  );

  return deepFreeze({
    schema: RESOURCE_HUD_SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    mana: {
      resolved: manaResolved,
      current: manaResolved ? manaCurrent : null,
      max: manaResolved ? manaMax : null,
      text: manaResolved ? `${manaCurrent}/${manaMax}` : UNRESOLVED
    },
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
    },
    payment: {
      resolved: paymentReceipt !== null,
      cost: paymentReceipt?.cost ?? null,
      manaPaid: paymentReceipt?.manaPaid ?? null,
      honeyPaid: paymentReceipt?.honeyPaid ?? null,
      manaAfter: paymentReceipt?.manaAfter ?? null,
      honeyAfter: paymentReceipt?.honeyAfter ?? null,
      source: paymentReceipt?.source ?? null,
      text: paymentReceipt
        ? `${paymentReceipt.source}・支払${paymentReceipt.cost}・マナ${paymentReceipt.manaPaid}＋ハニー${paymentReceipt.honeyPaid}`
        : '',
      ariaText: paymentReceipt
        ? `${paymentReceipt.source}、支払${paymentReceipt.cost}、マナ${paymentReceipt.manaPaid}、ハニー${paymentReceipt.honeyPaid}、残りマナ${paymentReceipt.manaAfter}、残りハニー${paymentReceipt.honeyAfter}`
        : ''
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
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{display:grid;grid-template-columns:auto;align-content:center;gap:1px;min-width:42px;padding:3px 6px;border:1px solid rgba(225,244,215,.12);border-radius:8px;background:rgba(3,20,17,.48);color:inherit;text-shadow:inherit;box-shadow:none}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:9px;font-weight:900;line-height:1;letter-spacing:.06em;opacity:.68;white-space:nowrap}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:15px;font-weight:1000;line-height:1.05}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:8px;font-weight:800;line-height:1.05;opacity:.66;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:82px}
[${RESOURCE_HUD_ATTR}="1"] [data-resolved="false"] .grBattleResourceValue{opacity:.54}
@media(max-height:420px),(max-width:720px){[${RESOURCE_HUD_ATTR}="1"]{gap:2px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{min-width:36px;padding:2px 4px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:8px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:13px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:7px;max-width:58px}}
/* WU07: late, Battle-shell-scoped presentation contract. No gameplay/state authority. */
@media(max-height:420px) and (orientation:landscape){
[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:46px!important;bottom:auto!important;left:42%!important;right:4px!important;height:48px!important;gap:3px!important;opacity:.78}
[data-gr-battle-screen="1"] [data-battle-screen-lane]{min-height:0!important;padding:3px 4px!important;border-color:rgba(225,244,215,.18)!important;background:rgba(5,32,27,.46)!important;box-shadow:none!important;transform:none!important}
[data-gr-battle-screen="1"] [data-battle-screen-lane] .grBattleLaneIdentity b{font-size:11px!important;line-height:1.05!important}
[data-gr-battle-screen="1"] [data-battle-screen-lane] .grBattleLaneIdentity small{font-size:8px!important;margin-top:1px!important;opacity:.62!important}
[data-gr-battle-screen="1"] [data-battle-shield-lane-rail]{margin-top:1px!important;gap:1px!important;opacity:.72}
[data-gr-battle-screen="1"] [data-battle-shield-slot]{padding:1px 2px!important;gap:1px!important}
[data-gr-battle-screen="1"] .grBattleLaneRole,[data-gr-battle-screen="1"] .grBattleLaneAfterstate{display:none!important}
[data-gr-battle-screen="1"] [data-battle-current-action]{top:103px!important;left:50%!important;right:auto!important;transform:translateX(-50%)!important;z-index:10!important;max-width:min(58vw,390px)!important;min-height:24px!important;padding:5px 11px!important;border-color:rgba(255,239,170,.66)!important;background:rgba(4,28,24,.90)!important;box-shadow:0 6px 18px rgba(0,0,0,.26),0 0 0 1px rgba(255,239,170,.08)!important;font-size:11px!important;letter-spacing:.04em!important}
[data-gr-battle-screen="1"] [${RESOURCE_HUD_ATTR}="1"]{max-width:176px;gap:1px;opacity:.66;transform:scale(.86);transform-origin:left top;flex-wrap:nowrap}
[data-gr-battle-screen="1"] [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{min-width:31px;padding:1px 3px;border-color:rgba(225,244,215,.08);background:rgba(3,20,17,.36)}
[data-gr-battle-screen="1"] [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:7px;opacity:.60}
[data-gr-battle-screen="1"] [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:11px}
[data-gr-battle-screen="1"] [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:6px;max-width:46px}
}
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
  root.dataset.visualPriority = 'resource_detail';
  root.setAttribute?.('aria-label', '対戦資源');

  const mana = createResourceCell(document, 'マナ', 'mana');
  const honey = createResourceCell(document, 'ハニー', 'honey');
  const chip = createResourceCell(document, 'チップ', 'chip');
  root.appendChild(mana.cell);
  root.appendChild(honey.cell);
  root.appendChild(chip.cell);
  host.appendChild(root);

  let destroyed = false;
  let lastSnapshot = null;

  function sync(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_RESOURCE_HUD_DESTROYED');
    const model = projectBattleCriticalResourceSnapshot(snapshot);
    mana.value.textContent = model.mana.text;
    honey.value.textContent = model.honey.text;
    chip.value.textContent = model.chip.text;
    setData(mana.cell, 'resolved', model.mana.resolved);
    setData(honey.cell, 'resolved', model.honey.resolved);
    setData(chip.cell, 'resolved', model.chip.resolved);
    setData(root, 'manaResolved', model.mana.resolved);
    setData(root, 'honeyResolved', model.honey.resolved);
    setData(root, 'chipResolved', model.chip.resolved);
    setData(root, 'paymentResolved', model.payment.resolved);
    mana.delta.textContent = model.payment.text;
    mana.delta.hidden = !model.payment.resolved;
    setData(mana.delta, 'resolved', model.payment.resolved);
    honey.delta.textContent = model.honey.deltaText;
    honey.delta.hidden = !model.honey.deltaResolved;
    setData(honey.delta, 'resolved', model.honey.deltaResolved);
    const paymentAria = model.payment.resolved ? `、支払い ${model.payment.ariaText}` : '';
    root.setAttribute?.('aria-label', `対戦資源 マナ ${model.mana.text}、ハニー ${model.honey.text}、チップ ${model.chip.text}${paymentAria}`);
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
    visualPriority: 'resource_detail',
    root,
    manaCell: mana.cell,
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
  visualHierarchyContract: Object.freeze(['board_world', 'current_action', 'hand_janken', 'four_player_public', 'resource_detail']),
  primaryShortLandscapeTarget: '667x375',
  resources: Object.freeze(['manaCurrent', 'manaMax', 'honey', 'chipCount']),
  unresolvedToken: UNRESOLVED,
  honeyDeltaAuthority: 'CALLER_ONLY_OPTIONAL',
  paymentReceiptAuthority: 'CALLER_ONLY_ATOMIC',
  paymentCalculationOwnedHere: false,
  paymentChoiceOwnedHere: false,
  physicalManaIdentityProjection: false,
  chipIdentityPublicityOwnedHere: false,
  resourceCalculationOwnedHere: false,
  resourceStoreOwnedHere: false,
  productionHtmlMutationOwnedHere: false
});
