import { mountBattleCriticalResourceHud } from './battle-critical-resource-hud-runtime.mjs';
import { syncBattleCriticalResourceHudFromPlayer } from './battle-critical-resource-hud-live-adapter.mjs';

export const BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_SCHEMA =
  'gameroad.battle-critical-resource-hud-dock-bridge.v1';

const BRIDGE_ATTR = 'data-battle-critical-resource-dock-bridge';
const STYLE_ID = 'gameroad-battle-critical-resource-dock-bridge-style';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') {
    throw new TypeError('BATTLE_RESOURCE_DOCK_BRIDGE_DOCUMENT_REQUIRED');
  }
  return document;
}

function requireHost(value) {
  if (!value || typeof value !== 'object' || typeof value.appendChild !== 'function') {
    throw new TypeError('BATTLE_RESOURCE_DOCK_BRIDGE_HOST_REQUIRED');
  }
  return value;
}

function addBridgeStyle(document) {
  if (document.getElementById?.(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${BRIDGE_ATTR}="1"]{display:flex;align-items:center;gap:4px;min-width:0}
[${BRIDGE_ATTR}="1"] [data-resource="mana"],[${BRIDGE_ATTR}="1"] [data-resource="chip"]{display:none!important}
[${BRIDGE_ATTR}="1"] .grBattleResourceDockPayment{max-width:156px;font-size:8px;font-weight:900;line-height:1.08;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.86}
@media(max-height:420px),(max-width:720px){[${BRIDGE_ATTR}="1"]{gap:2px}[${BRIDGE_ATTR}="1"] .grBattleResourceDockPayment{max-width:116px;font-size:7px}}
@media(prefers-reduced-motion:reduce){[${BRIDGE_ATTR}="1"] *{transition:none!important;animation:none!important}}
`;
  document.head?.appendChild(style);
}

/**
 * Reuse the existing caller-authoritative Battle Resource HUD inside the legacy
 * resource dock without duplicating the dock's already-visible Mana/Chip views.
 *
 * The caller owns player selection and every resource/payment fact. This bridge
 * only forwards those facts to the existing live adapter and presents Honey plus
 * the already-validated atomic payment receipt.
 */
export function mountBattleCriticalResourceHudDockBridge(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const host = requireHost(options.host);
  addBridgeStyle(document);

  const resourceHud = mountBattleCriticalResourceHud(global, { host, snapshot: {} });
  resourceHud.root.setAttribute?.(BRIDGE_ATTR, '1');
  resourceHud.root.dataset.presentationOnly = 'true';
  resourceHud.root.dataset.bridgeAuthority = 'existing_resource_hud_and_caller_only';
  resourceHud.root.dataset.visibleResources = 'honey,payment_receipt';

  // Current Battle already has dedicated visible Mana art and compact Chip state.
  // Hide only this bridge instance's duplicate cells; do not alter those owners.
  resourceHud.manaCell.hidden = true;
  resourceHud.chipCell.hidden = true;
  resourceHud.honeyCell.hidden = false;

  const payment = document.createElement('span');
  payment.className = 'grBattleResourceDockPayment';
  payment.dataset.resource = 'payment_receipt';
  payment.hidden = true;
  payment.setAttribute?.('aria-live', 'polite');
  resourceHud.root.appendChild(payment);

  let destroyed = false;
  let lastModel = null;

  function sync({
    player = null,
    honeyDelta = null,
    honeyDeltaSource = null,
    paymentReceipt = null,
  } = {}) {
    if (destroyed) throw new Error('BATTLE_RESOURCE_DOCK_BRIDGE_DESTROYED');
    const model = syncBattleCriticalResourceHudFromPlayer({
      resourceHud,
      player,
      honeyDelta,
      honeyDeltaSource,
      paymentReceipt,
    });

    payment.textContent = model.payment.text;
    payment.hidden = !model.payment.resolved;
    payment.dataset.resolved = String(model.payment.resolved);

    const paymentAria = model.payment.resolved ? `、支払い ${model.payment.ariaText}` : '';
    resourceHud.root.setAttribute?.(
      'aria-label',
      `対戦資源 ハニー ${model.honey.text}${paymentAria}`,
    );
    lastModel = model;
    return model;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    return resourceHud.destroy();
  }

  sync({
    player: options.player ?? null,
    honeyDelta: options.honeyDelta ?? null,
    honeyDeltaSource: options.honeyDeltaSource ?? null,
    paymentReceipt: options.paymentReceipt ?? null,
  });

  return Object.freeze({
    schema: BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_SCHEMA,
    presentationOnly: true,
    gameStateWrite: false,
    resourceAuthority: 'CALLER_ONLY_VIA_EXISTING_RESOURCE_HUD',
    paymentCalculationAuthority: false,
    playerSelectionAuthority: false,
    root: resourceHud.root,
    honeyCell: resourceHud.honeyCell,
    paymentNode: payment,
    resourceHud,
    sync,
    snapshot: () => lastModel,
    destroy,
  });
}

export const BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_CONTRACT = deepFreeze({
  schema: BATTLE_CRITICAL_RESOURCE_HUD_DOCK_BRIDGE_SCHEMA,
  presentationOnly: true,
  gameStateWrite: false,
  playerSelectionAuthority: false,
  resourceCalculationAuthority: false,
  resourceStoreAuthority: false,
  paymentCalculationAuthority: false,
  paymentChoiceAuthority: false,
  rankCalculationAuthority: false,
  chipIdentityProjection: false,
  usesExistingResourceHud: true,
  usesExistingLiveAdapter: true,
  visibleResources: Object.freeze(['honey', 'payment_receipt']),
  bridgeHiddenDuplicates: Object.freeze(['mana', 'chip']),
  existingVisibleOwnersPreserved: Object.freeze(['mana_art_r8', 'compact_chip', 'hate', 'partner']),
  productionHtmlMutationOwnedHere: false,
});
