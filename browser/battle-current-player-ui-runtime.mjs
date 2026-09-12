const SCHEMA = 'gameroad.battle-current-player-ui-runtime.v2';
const STYLE_ID = 'gameroad-battle-current-player-ui-r3-style';
const ROOT_ATTR = 'data-gr-current-player-ui';
const ZONE_ATTR = 'data-gr-current-ui-zone';

const SELECTOR_CANDIDATES = Object.freeze({
  battleMap: Object.freeze(['#battleMap']),
  board: Object.freeze(['#board']),
  boardPlayers: Object.freeze(['#boardPlayers']),
  controlledCharacter: Object.freeze(['#battleRuntime']),
  currentAction: Object.freeze(['[data-battle-current-action="1"]', '.battleTopStatus']),
  resources: Object.freeze(['[data-battle-critical-resource-hud="1"]', '.resourceStrip']),
  battleScreenHud: Object.freeze(['[data-battle-r75-hud="1"]']),
  public4p: Object.freeze(['#publicTurnHud']),
  hand: Object.freeze(['#hand']),
  battleInfo: Object.freeze(['.battleInfo']),
  thumbActions: Object.freeze(['.planBox']),
  quickDecision: Object.freeze(['.quickReadyGroup']),
  quickCoil: Object.freeze(['#quickCoil']),
  jankenSlidePad: Object.freeze(['[data-battle-janken-slidepad="1"]']),
  roulette: Object.freeze(['[data-battle-playable-hand-row-roulette-live="1"]']),
  targetConfirm: Object.freeze(['#targetBox']),
  secondaryActions: Object.freeze(['.battleRail']),
  legacyPhaseStrip: Object.freeze(['#phaseBar']),
  detailsDrawer: Object.freeze(['#battleDrawer']),
  partner: Object.freeze(['#partnerAdviceChatPresentation'])
});

const STYLE_TEXT = `
.screen.battle[${ROOT_ATTR}="1"]{--gr-ui-edge:clamp(6px,1.2vw,12px);--gr-ui-gap:clamp(4px,.9vw,9px);--gr-thumb-w:clamp(208px,31vw,248px);--gr-thumb-h:clamp(160px,29vh,196px);--gr-bottom-h:clamp(86px,25vh,124px);isolation:isolate;overflow:hidden}
.screen.battle[${ROOT_ATTR}="1"] #battleMap{position:absolute!important;inset:0!important;overflow:hidden!important}
.screen.battle[${ROOT_ATTR}="1"] #board{z-index:2}
.screen.battle[${ROOT_ATTR}="1"] #boardPlayers{z-index:7}
.screen.battle[${ROOT_ATTR}="1"] #battleRuntime{z-index:8}
.screen.battle[${ROOT_ATTR}="1"] #phaseBar{display:none!important}
.screen.battle[${ROOT_ATTR}="1"] [data-battle-r75-hud="1"]{z-index:33!important}
.screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="current-action"]{position:absolute!important;z-index:32!important;top:calc(var(--gr-ui-edge) + clamp(42px,9vh,72px))!important;left:var(--gr-ui-edge)!important;right:auto!important;bottom:auto!important;max-width:min(38vw,310px)!important;transform:none!important;margin:0!important;pointer-events:none!important}
.screen.battle[${ROOT_ATTR}="1"] #publicTurnHud{position:absolute!important;z-index:31!important;top:var(--gr-ui-edge)!important;left:50%!important;right:auto!important;bottom:auto!important;transform:translateX(-50%)!important;width:min(48vw,500px)!important;max-height:54px!important;overflow:hidden!important;padding:3px 6px!important;pointer-events:none!important}
.screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="resources"]{position:absolute!important;z-index:32!important;left:var(--gr-ui-edge)!important;right:auto!important;top:auto!important;bottom:var(--gr-ui-edge)!important;width:auto!important;max-width:min(22vw,170px)!important;pointer-events:none!important}
.screen.battle[${ROOT_ATTR}="1"] .battleInfo{position:absolute!important;z-index:25!important;left:clamp(104px,16vw,190px)!important;right:calc(var(--gr-thumb-w) + var(--gr-ui-edge) + var(--gr-ui-gap))!important;top:auto!important;bottom:var(--gr-ui-edge)!important;height:var(--gr-bottom-h)!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(138px,28%)!important;align-items:end!important;gap:var(--gr-ui-gap)!important;padding:0!important;background:none!important;border:0!important;box-shadow:none!important;pointer-events:none!important}
.screen.battle[${ROOT_ATTR}="1"] #hand{position:relative!important;inset:auto!important;min-width:0!important;max-width:none!important;height:100%!important;display:flex!important;align-items:flex-end!important;justify-content:center!important;gap:clamp(2px,.45vw,6px)!important;padding:0!important;overflow:visible!important;pointer-events:auto!important}
.screen.battle[${ROOT_ATTR}="1"] .planBox{position:relative!important;inset:auto!important;width:100%!important;min-width:0!important;max-width:190px!important;justify-self:end!important;align-self:end!important;padding:5px!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:4px!important;transform:none!important;margin:0!important;box-sizing:border-box!important;pointer-events:auto!important}
.screen.battle[${ROOT_ATTR}="1"] .planBox .planSelect{min-width:0!important}
.screen.battle[${ROOT_ATTR}="1"] .planBox select{width:100%!important;min-width:0!important}
.screen.battle[${ROOT_ATTR}="1"] .planBox .quickReadyGroup{grid-column:1/-1!important;justify-self:end!important;display:flex!important;align-items:center!important;gap:5px!important}
.screen.battle[${ROOT_ATTR}="1"] [data-battle-janken-slidepad="1"]{position:absolute!important;z-index:44!important;width:var(--gr-thumb-w)!important;height:var(--gr-thumb-h)!important;right:var(--gr-ui-edge)!important;left:auto!important;bottom:var(--gr-ui-edge)!important;top:auto!important;transform:none!important;margin:0!important;box-sizing:border-box!important}
.screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{position:absolute!important;z-index:43!important;left:auto!important;right:var(--gr-ui-edge)!important;bottom:calc(var(--gr-thumb-h) + var(--gr-ui-edge) + 4px)!important;max-width:min(236px,36vw)!important;transform-origin:right bottom!important}
.screen.battle[${ROOT_ATTR}="1"][data-gr-roulette-enabled="false"] [data-battle-playable-hand-row-roulette-live="1"]{display:none!important}
.screen.battle[${ROOT_ATTR}="1"] #targetBox{position:absolute!important;z-index:45!important;right:calc(var(--gr-thumb-w) + var(--gr-ui-edge) + var(--gr-ui-gap))!important;left:auto!important;bottom:var(--gr-ui-edge)!important;top:auto!important;width:min(34vw,280px)!important;max-height:44vh!important;overflow:auto!important}
.screen.battle[${ROOT_ATTR}="1"] .battleRail{position:absolute!important;z-index:34!important;top:var(--gr-ui-edge)!important;right:var(--gr-ui-edge)!important;left:auto!important;bottom:auto!important;width:auto!important;height:auto!important;max-width:min(28vw,340px)!important;max-height:44px!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-end!important;gap:4px!important;padding:0!important;margin:0!important;transform:none!important;overflow-x:auto!important;overflow-y:hidden!important;white-space:nowrap!important;background:none!important;border:0!important;pointer-events:auto!important;scrollbar-width:none!important}
.screen.battle[${ROOT_ATTR}="1"] .battleRail .railBtn{min-width:44px!important;min-height:36px!important;width:auto!important;height:36px!important;max-height:36px!important;padding:5px 8px!important;margin:0!important;transform:none!important;box-sizing:border-box!important;flex:0 0 auto!important;font-size:9px!important}
.screen.battle[${ROOT_ATTR}="1"][data-gr-decision-active="false"] #quickCoil{display:none!important}
.screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="partner"]{position:absolute!important;z-index:30!important;left:var(--gr-ui-edge)!important;right:auto!important;bottom:calc(var(--gr-ui-edge) + 48px)!important;width:min(23vw,170px)!important;max-height:30vh!important;overflow:hidden!important}
.screen.battle[${ROOT_ATTR}="1"] #battleDrawer{z-index:60!important}
.screen.battle[${ROOT_ATTR}="1"][data-gr-stale="true"] #hand,
.screen.battle[${ROOT_ATTR}="1"][data-gr-reconnecting="true"] #hand,
.screen.battle[${ROOT_ATTR}="1"][data-gr-stale="true"] .planBox,
.screen.battle[${ROOT_ATTR}="1"][data-gr-reconnecting="true"] .planBox,
.screen.battle[${ROOT_ATTR}="1"][data-gr-stale="true"] [data-battle-janken-slidepad="1"],
.screen.battle[${ROOT_ATTR}="1"][data-gr-reconnecting="true"] [data-battle-janken-slidepad="1"],
.screen.battle[${ROOT_ATTR}="1"][data-gr-stale="true"] [data-battle-playable-hand-row-roulette-live="1"],
.screen.battle[${ROOT_ATTR}="1"][data-gr-reconnecting="true"] [data-battle-playable-hand-row-roulette-live="1"],
.screen.battle[${ROOT_ATTR}="1"][data-gr-stale="true"] #targetBox,
.screen.battle[${ROOT_ATTR}="1"][data-gr-reconnecting="true"] #targetBox{pointer-events:none!important;opacity:.55!important}
.screen.battle[${ROOT_ATTR}="1"][data-gr-reduced-motion="true"] [${ZONE_ATTR}],
.screen.battle[${ROOT_ATTR}="1"][data-gr-reduced-motion="true"] [${ZONE_ATTR}] *{transition:none!important;animation:none!important;scroll-behavior:auto!important}
.screen.battle[${ROOT_ATTR}="1"][data-gr-low-perf="true"] [${ZONE_ATTR}]{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
@media(max-height:430px) and (orientation:landscape){
  .screen.battle[${ROOT_ATTR}="1"]{--gr-thumb-w:208px;--gr-thumb-h:160px;--gr-bottom-h:clamp(82px,26vh,106px)}
  .screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="current-action"]{top:46px!important;max-width:32vw!important}
  .screen.battle[${ROOT_ATTR}="1"] #publicTurnHud{width:min(44vw,400px)!important;max-height:44px!important;padding:2px 4px!important}
  .screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="resources"]{max-width:104px!important;font-size:8px!important}
  .screen.battle[${ROOT_ATTR}="1"] .battleInfo{left:104px!important;grid-template-columns:minmax(0,1fr) minmax(126px,27%)!important}
  .screen.battle[${ROOT_ATTR}="1"] .planBox{max-width:172px!important;padding:3px!important}
  .screen.battle[${ROOT_ATTR}="1"] .battleRail{max-width:168px!important}
  .screen.battle[${ROOT_ATTR}="1"] .planBox label,.screen.battle[${ROOT_ATTR}="1"] .endpointChip label{font-size:7px!important}
  .screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{max-width:min(190px,31vw)!important}
  .screen.battle[${ROOT_ATTR}="1"] .battleRail .railBtn{min-height:32px!important;height:32px!important;max-height:32px!important;padding:3px 6px!important;font-size:8px!important}
  .screen.battle[${ROOT_ATTR}="1"] #targetBox{width:min(30vw,230px)!important}
}
@media(max-width:520px) and (orientation:portrait){
  .screen.battle[${ROOT_ATTR}="1"]{--gr-thumb-w:176px;--gr-thumb-h:172px;--gr-bottom-h:28vh}
  .screen.battle[${ROOT_ATTR}="1"] #publicTurnHud{top:48px!important;width:76vw!important}
  .screen.battle[${ROOT_ATTR}="1"] [${ZONE_ATTR}="resources"]{max-width:30vw!important;bottom:calc(28vh + var(--gr-ui-edge) + var(--gr-ui-gap))!important}
  .screen.battle[${ROOT_ATTR}="1"] .battleInfo{left:1.5%!important;right:calc(var(--gr-thumb-w) + var(--gr-ui-edge) + var(--gr-ui-gap))!important;height:28vh!important;grid-template-columns:1fr!important;grid-template-rows:minmax(0,1fr) auto!important}
  .screen.battle[${ROOT_ATTR}="1"] .planBox{max-width:none!important;grid-template-columns:repeat(4,minmax(0,1fr))!important}
  .screen.battle[${ROOT_ATTR}="1"] [data-battle-janken-slidepad="1"]{width:var(--gr-thumb-w)!important;height:var(--gr-thumb-h)!important;right:var(--gr-ui-edge)!important;bottom:var(--gr-ui-edge)!important}
  .screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{right:var(--gr-ui-edge)!important;bottom:calc(var(--gr-thumb-h) + var(--gr-ui-edge) + 4px)!important;max-width:min(164px,42vw)!important}
  .screen.battle[${ROOT_ATTR}="1"] .battleRail{left:var(--gr-ui-edge)!important;right:var(--gr-ui-edge)!important;top:118px!important;width:auto!important;max-width:none!important;justify-content:flex-start!important}
  .screen.battle[${ROOT_ATTR}="1"] #targetBox{width:96vw!important;right:2vw!important;bottom:30vh!important}
}
`;

function requireDocument(global) {
  const document = global?.document;
  if (!document || typeof document.createElement !== 'function') throw new TypeError('BATTLE_CURRENT_PLAYER_UI_DOCUMENT_REQUIRED');
  return document;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

function rectOf(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  if (!rect) return null;
  return Object.freeze({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height });
}

function overlaps(a, b) {
  if (!a || !b) return false;
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function addStyle(document) {
  const prior = document.getElementById?.(STYLE_ID);
  if (prior) return { node: prior, created: false };
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  (document.head ?? document.documentElement ?? document.body)?.appendChild?.(style);
  return { node: style, created: true };
}

function locate(root, selectors, provided) {
  if (provided) return provided;
  for (const selector of selectors) {
    const node = root?.querySelector?.(selector) ?? null;
    if (node) return node;
  }
  return null;
}

function rememberAttr(records, node, name) {
  if (!node || typeof node.getAttribute !== 'function') return;
  records.push({ node, name, had: node.hasAttribute?.(name) ?? node.getAttribute(name) != null, value: node.getAttribute(name) });
}

function writeAttr(records, node, name, value) {
  if (!node || typeof node.setAttribute !== 'function') return;
  rememberAttr(records, node, name);
  node.setAttribute(name, value);
}

function restoreAttrs(records) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record.had) record.node.setAttribute?.(record.name, record.value ?? '');
    else record.node.removeAttribute?.(record.name);
  }
}

function relocate(records, node, parent) {
  if (!node || !parent || node.parentNode === parent || typeof parent.appendChild !== 'function') return false;
  records.push({ node, parent: node.parentNode ?? null, nextSibling: node.nextSibling ?? null });
  parent.appendChild(node);
  return true;
}

function restoreRelocations(records) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (!record.parent) continue;
    if (record.nextSibling && record.nextSibling.parentNode === record.parent && typeof record.parent.insertBefore === 'function') record.parent.insertBefore(record.node, record.nextSibling);
    else record.parent.appendChild?.(record.node);
  }
}

function boolToken(value) {
  return value === true ? 'true' : value === false ? 'false' : null;
}

export function mountBattleCurrentPlayerUi(global = globalThis, options = {}) {
  const document = requireDocument(global);
  const root = options.root ?? document.querySelector?.('section.screen.battle[data-screen="battle"]') ?? document.querySelector?.('.screen.battle');
  if (!root) throw new TypeError('BATTLE_CURRENT_PLAYER_UI_ROOT_REQUIRED');
  const attrs = [];
  const relocations = [];
  const style = addStyle(document);
  const surfaces = {};
  for (const [key, selectors] of Object.entries(SELECTOR_CANDIDATES)) surfaces[key] = locate(root, selectors, options[key]);

  writeAttr(attrs, root, ROOT_ATTR, '1');
  writeAttr(attrs, root, 'data-gr-ui-authority', 'presentation-only');
  writeAttr(attrs, root, 'data-gr-ui-privacy', 'public-only-no-private-count-projection');
  writeAttr(attrs, root, 'data-gr-ui-layout', 'world-primary-thumb-reserved');

  const zones = [
    ['battleMap', 'world'], ['board', 'board'], ['boardPlayers', 'four-player-board'],
    ['controlledCharacter', 'controlled-character'], ['currentAction', 'current-action'],
    ['resources', 'resources'], ['battleScreenHud', 'top-hud'], ['public4p', 'four-player-public'],
    ['hand', 'ordinary-hand'], ['thumbActions', 'thumb-actions'], ['quickDecision', 'quick-decision'],
    ['jankenSlidePad', 'janken-slidepad'], ['roulette', 'conditional-roulette'],
    ['targetConfirm', 'target-confirm'], ['secondaryActions', 'secondary-actions'],
    ['legacyPhaseStrip', 'legacy-phase-strip'], ['detailsDrawer', 'details-on-demand'], ['partner', 'partner']
  ];
  for (const [key, zone] of zones) if (surfaces[key]) writeAttr(attrs, surfaces[key], ZONE_ATTR, zone);
  if (surfaces.legacyPhaseStrip) writeAttr(attrs, surfaces.legacyPhaseStrip, 'data-gr-current-ui-disposition', 'legacy-hidden');
  if (surfaces.detailsDrawer) writeAttr(attrs, surfaces.detailsDrawer, 'data-gr-current-ui-disposition', 'on-demand');

  const overlayParent = surfaces.battleMap ?? root;
  relocate(relocations, surfaces.resources, overlayParent);
  relocate(relocations, surfaces.partner, overlayParent);

  let destroyed = false;
  function sync(snapshot = {}) {
    if (destroyed) throw new Error('BATTLE_CURRENT_PLAYER_UI_DESTROYED');
    setData(root, 'grDecisionActive', boolToken(snapshot.decisionActive));
    setData(root, 'grJankenActive', boolToken(snapshot.jankenActive));
    setData(root, 'grRouletteEnabled', boolToken(snapshot.rouletteEnabled));
    setData(root, 'grStale', boolToken(snapshot.stale));
    setData(root, 'grReconnecting', boolToken(snapshot.reconnecting));
    setData(root, 'grReducedMotion', boolToken(snapshot.reducedMotion));
    setData(root, 'grLowPerf', boolToken(snapshot.lowPerf));
    if (typeof snapshot.focus === 'string' && snapshot.focus.trim()) setData(root, 'grFocus', snapshot.focus.trim());
    else setData(root, 'grFocus', null);
    return inspect();
  }

  function inspect() {
    const keys = ['battleMap', 'board', 'controlledCharacter', 'currentAction', 'resources', 'battleScreenHud', 'public4p', 'hand', 'thumbActions', 'jankenSlidePad', 'roulette', 'targetConfirm', 'secondaryActions', 'partner'];
    const geometry = Object.fromEntries(keys.map((key) => [key, rectOf(surfaces[key])]));
    const collisions = Object.freeze({
      handVsJanken: overlaps(geometry.hand, geometry.jankenSlidePad),
      thumbActionsVsJanken: overlaps(geometry.thumbActions, geometry.jankenSlidePad),
      rouletteVsJanken: overlaps(geometry.roulette, geometry.jankenSlidePad),
      targetVsJanken: overlaps(geometry.targetConfirm, geometry.jankenSlidePad),
      resourcesVsHand: overlaps(geometry.resources, geometry.hand),
      partnerVsHand: overlaps(geometry.partner, geometry.hand)
    });
    return Object.freeze({
      schema: SCHEMA,
      mounted: !destroyed,
      rootDecorated: root.getAttribute?.(ROOT_ATTR) === '1',
      presentationOnly: true,
      gameplayAuthority: false,
      gameStateWrite: false,
      privacyPolicy: 'PUBLIC_ONLY_NO_PRIVATE_COUNT_PROJECTION',
      legacyPhaseStripHiddenByComposition: Boolean(surfaces.legacyPhaseStrip),
      resolvedLiveConsumers: Object.freeze({
        currentAction: Boolean(surfaces.currentAction),
        resources: Boolean(surfaces.resources),
        partner: Boolean(surfaces.partner),
        jankenSlidePad: Boolean(surfaces.jankenSlidePad),
        roulette: Boolean(surfaces.roulette)
      }),
      zones: Object.freeze(Object.fromEntries(zones.filter(([key]) => surfaces[key]).map(([key, zone]) => [key, zone]))),
      geometry: Object.freeze(geometry),
      collisions
    });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    restoreRelocations(relocations);
    restoreAttrs(attrs);
    if (style.created && style.node?.parentNode?.removeChild) style.node.parentNode.removeChild(style.node);
    return true;
  }

  if (options.initialState) sync(options.initialState);
  return Object.freeze({ schema: SCHEMA, root, surfaces: Object.freeze({ ...surfaces }), sync, inspect, destroy, presentationOnly: true, gameplayAuthority: false, gameStateWrite: false });
}

export const BATTLE_CURRENT_PLAYER_UI_SELECTORS = SELECTOR_CANDIDATES;

export const BATTLE_CURRENT_PLAYER_UI_RUNTIME = Object.freeze({
  schema: SCHEMA,
  mount: 'explicit-caller-mount',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  primaryViewport: '667x375',
  viewports: Object.freeze(['667x375', '1280x720', '390x844']),
  hierarchy: Object.freeze(['world-board-controlled-character', 'current-action', 'ordinary-hand-active-input', 'top-hud-public-state', 'resources-partner', 'right-thumb-family', 'details-on-demand']),
  liveConsumerPolicy: 'CURRENT_SELECTORS_WITH_LEGACY_FALLBACK_ONLY',
  thumbFamilyPolicy: 'RESERVE_EXISTING_JANKEN_SLIDEPAD_AND_CONDITIONAL_ROULETTE',
  quickPolicy: 'LOCAL_TO_EXPLICIT_SELF_DECISION_ONLY',
  roulettePolicy: 'CONDITIONAL_CALLER_AUTHORITY_ONLY',
  privacyPolicy: 'NO_OPPONENT_PRIVATE_COUNT_OR_EXACT_HATE_PROJECTION',
  legacyPhaseStripPolicy: 'HIDDEN_BY_CURRENT_COMPOSITION',
  secondaryActionPolicy: 'COMPACT_HORIZONTAL_NOT_TALL_RIGHT_RAIL',
  lowPerfPolicy: 'REMOVE_COMPOSITOR_BACKDROP_FILTER_ONLY',
  unresolvedGameplayPolicy: 'DO_NOT_INFER',
  productionHtmlMutationOwnedHere: false
});
