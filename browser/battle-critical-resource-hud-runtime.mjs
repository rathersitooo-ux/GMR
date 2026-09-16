const RESOURCE_HUD_SCHEMA = 'gameroad.battle-critical-resource-hud.v1';
const RESOURCE_HUD_ATTR = 'data-battle-critical-resource-hud';
const STYLE_ID = 'gameroad-battle-critical-resource-hud-style';
const UNRESOLVED = '—';
const BATTLE_SHELL_VISUAL_ORDER = Object.freeze([
  'BOARD_WORLD',
  'CURRENT_ACTION',
  'HAND_JANKEN',
  'PUBLIC_4P',
  'RESOURCE_DETAIL'
]);

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
[${RESOURCE_HUD_ATTR}="1"]{display:flex;align-items:stretch;gap:3px;min-width:0;pointer-events:none;opacity:.72}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{display:grid;grid-template-columns:auto;align-content:center;gap:1px;min-width:36px;padding:2px 4px;border:1px solid rgba(225,244,215,.13);border-radius:7px;background:rgba(3,20,17,.44);color:inherit;text-shadow:inherit;box-shadow:none}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:8px;font-weight:900;line-height:1;letter-spacing:.04em;opacity:.58;white-space:nowrap}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:13px;font-weight:1000;line-height:1.05}
[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:7px;font-weight:800;line-height:1.05;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:64px}
[${RESOURCE_HUD_ATTR}="1"] [data-resolved="false"] .grBattleResourceValue{opacity:.46}

/* Late presentation-only Battle shell hierarchy. The live board remains caller-owned and visually primary. */
[data-gr-battle-screen="1"] .grBattleScreenTop{height:clamp(34px,6.2vh,50px);gap:clamp(3px,.65vw,7px);padding:clamp(3px,.5vh,5px) clamp(6px,1vw,10px);background:linear-gradient(180deg,rgba(4,10,11,.48),rgba(4,10,11,.08) 78%,rgba(4,10,11,0));text-shadow:0 1px 7px rgba(0,0,0,.58)}
[data-gr-battle-screen="1"] .grBattleHudSettings{width:clamp(26px,3.4vw,34px);height:clamp(26px,3.4vw,34px);border-color:rgba(235,247,238,.34);background:rgba(8,28,25,.56);box-shadow:0 2px 8px rgba(0,0,0,.18)}
[data-gr-battle-screen="1"] .grBattleHudMetric{min-width:clamp(38px,5.4vw,58px);padding:2px 4px;border-color:rgba(225,244,215,.12);background:rgba(3,20,17,.42)}
[data-gr-battle-screen="1"] .grBattleHudMetric small{font-size:clamp(7px,.58vw,9px);opacity:.52}
[data-gr-battle-screen="1"] .grBattleHudMetric b{font-size:clamp(11px,1.05vw,14px)}
[data-gr-battle-screen="1"] .grBattleHudCenter{gap:clamp(3px,.45vw,6px);opacity:.72}
[data-gr-battle-screen="1"] .grBattleHudChain{gap:2px;opacity:.62}
[data-gr-battle-screen="1"] .grBattleHudPlayedCard{width:clamp(22px,3vw,32px);height:clamp(28px,4vw,40px);border-radius:5px;font-size:clamp(7px,.64vw,9px)}
[data-gr-battle-screen="1"] .grBattleHudLoad{width:clamp(38px,5vw,50px);height:clamp(32px,4.6vw,44px);border-color:rgba(255,233,158,.48);box-shadow:0 3px 10px rgba(0,0,0,.16)}
[data-gr-battle-screen="1"] .grBattleHudLoad small{font-size:clamp(7px,.58vw,9px);opacity:.58}
[data-gr-battle-screen="1"] .grBattleHudLoad b{font-size:clamp(11px,1.2vw,15px)}
[data-gr-battle-screen="1"] [data-battle-current-action]{z-index:10;top:clamp(44px,7.5vh,64px);max-width:min(52vw,460px);padding:4px 9px;background:rgba(4,28,24,.74);box-shadow:0 4px 12px rgba(0,0,0,.18);font-size:clamp(10px,.92vw,13px)}
[data-gr-battle-screen="1"] [data-battle-causal-trace]{z-index:7;top:clamp(80px,12vh,106px);width:min(52vw,520px);gap:3px;opacity:.76}
[data-gr-battle-screen="1"] [data-battle-causal-trace] .grBattleCausalTraceStage{padding:3px 5px;border-color:rgba(245,248,225,.24);background:rgba(4,28,24,.54);box-shadow:0 3px 9px rgba(0,0,0,.14);font-size:clamp(8px,.7vw,10px);opacity:.82}
[data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{z-index:5;top:clamp(74px,11vh,92px);right:clamp(6px,1vw,10px);left:56%;height:clamp(48px,8vh,64px);gap:3px;opacity:.72}
[data-gr-battle-screen="1"] [data-battle-screen-lane]{gap:2px;padding:3px 4px;border-color:rgba(219,241,207,.12);background:linear-gradient(180deg,rgba(19,56,49,.40),rgba(6,25,24,.28));box-shadow:0 2px 7px rgba(2,20,17,.10)}
[data-gr-battle-screen="1"] .grBattleLaneIdentity b{font-size:clamp(10px,.9vw,12px)}
[data-gr-battle-screen="1"] .grBattleLaneIdentity small{font-size:clamp(8px,.68vw,10px);opacity:.58}
[data-gr-battle-screen="1"] .grBattleLanePublicCard{width:clamp(22px,3vw,30px);height:clamp(30px,4vw,40px);opacity:.86}
[data-gr-battle-screen="1"] [data-battle-shield-lane-rail]{gap:2px;margin-top:2px;opacity:.62}
[data-gr-battle-screen="1"] .grBattleLaneRole{padding:3px 5px;font-size:clamp(8px,.68vw,10px);opacity:.68}
[data-gr-battle-screen="1"] .grBattleLaneAfterstate{gap:2px;font-size:clamp(8px,.72vw,10px);opacity:.58}
[data-gr-battle-screen="1"] .grBattleLaneAfterstate span{padding:2px 3px;background:rgba(2,19,16,.38);border-color:rgba(225,244,215,.08)}
[data-gr-battle-screen="1"] [data-battle-progress-guide]{z-index:3;width:min(22vw,180px);opacity:.26;font-size:clamp(8px,.7vw,10px)}
[data-gr-battle-screen="1"] [data-battle-field-landmark]{z-index:1;opacity:.10;filter:none}

@media(max-height:420px) and (orientation:landscape){
  [data-gr-battle-screen="1"] .grBattleScreenTop{height:34px;padding:2px 5px;gap:3px}
  [data-gr-battle-screen="1"] .grBattleHudSettings{width:26px;height:26px}
  [data-gr-battle-screen="1"] .grBattleHudMetric{min-width:32px;padding:1px 3px}
  [data-gr-battle-screen="1"] .grBattleHudMetric small{font-size:7px}
  [data-gr-battle-screen="1"] .grBattleHudMetric b{font-size:11px}
  [data-gr-battle-screen="1"] .grBattleHudPlayedCard{width:20px;height:27px}
  [data-gr-battle-screen="1"] .grBattleHudLoad{width:36px;height:30px}
  [data-gr-battle-screen="1"] [data-battle-current-action]{top:38px;left:50%;right:auto;transform:translateX(-50%);max-width:min(54vw,360px);padding:3px 7px;font-size:10px}
  [data-gr-battle-screen="1"] [data-battle-causal-trace]{top:70px;left:6px;transform:none;width:48%;gap:2px}
  [data-gr-battle-screen="1"] [data-battle-causal-trace] .grBattleCausalTraceStage{padding:2px 3px;font-size:7px}
  [data-gr-battle-screen="1"] [data-battle-screen-causal-grid]{top:70px;left:54%;right:4px;height:42px;gap:2px;opacity:.64}
  [data-gr-battle-screen="1"] [data-battle-screen-lane]{padding:2px 3px;border-radius:6px}
  [data-gr-battle-screen="1"] .grBattleLaneIdentity b{font-size:9px}
  [data-gr-battle-screen="1"] .grBattleLaneIdentity small{font-size:7px}
  [data-gr-battle-screen="1"] .grBattleLanePublicCard{width:19px;height:26px;right:2px;top:2px}
  [data-gr-battle-screen="1"] [data-battle-shield-lane-rail]{margin-top:1px;opacity:.48}
  [data-gr-battle-screen="1"] [data-battle-progress-guide]{display:none!important}
  [data-gr-battle-screen="1"] [data-battle-field-landmark]{opacity:.06}
  [${RESOURCE_HUD_ATTR}="1"]{gap:1px;opacity:.58}
  [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{min-width:28px;padding:1px 2px;border-radius:5px}
  [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:7px;opacity:.48}
  [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:10px}
  [${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:6px;max-width:42px}
}
@media(max-width:720px){[${RESOURCE_HUD_ATTR}="1"]{gap:2px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell{min-width:32px;padding:2px 3px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceCell small{font-size:7px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceValue{font-size:11px}[${RESOURCE_HUD_ATTR}="1"] .grBattleResourceDelta{font-size:6px;max-width:50px}}
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
    visualPriority: 'RESOURCE_DETAIL',
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
  productionHtmlMutationOwnedHere: false,
  battleShellHierarchyStyleHook: 'LATE_PRESENTATION_ONLY',
  battleShellVisualOrder: BATTLE_SHELL_VISUAL_ORDER,
  constrainedLandscapeAcceptanceTarget: '667x375',
  persistentRightRailOwnedHere: false
});
