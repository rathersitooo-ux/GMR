import {
  classifyHomeViewport,
  createHomeShellState,
  HOME_TOUCH_TARGET_MIN_PX,
} from './home-shell-presentation-core.mjs';
import { mountRogueRunFromCurrentBrowser } from './rogue-run-runtime-mount.mjs';
import {
  advanceSlotRollDrag,
  createSlotRollState,
  projectSlotRollWindow,
  resolveSlotRollCommit,
} from './slidepad-slot-roll-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_HOME_BOOT_PRESENTATION';
const STYLE_ID = 'gameroad-home-shell-runtime-style';
const HOME_SELECTOR = 'section[data-screen="home"]';
const SETUP_SELECTOR = 'section[data-screen="setup"]';
const SETUP_MODE_SELECTOR = '[data-mode]';
const DECORATIVE_GLOBAL_BRAND_SELECTOR = '.top .brand';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const SECONDARY_UTILITY_SELECTOR = '.codexHomeUtilities';
const SECONDARY_UTILITY_BUTTON_SELECTOR = '.homeUtilityBtn';
const SLIDEPAD_CENTER_SELECTOR = '#homePadCenter';
const SLIDEPAD_DEAD_ZONE_PX = 18;
const SLIDEPAD_DOWN_REJECT_RATIO = 1.15;
const SLIDEPAD_LOCAL_FEEDBACK_MAX_PX = 144;
const SLIDEPAD_TARGET_PULL_MAX_PX = 18;
const SLIDEPAD_SWITCH_ADVANTAGE = 0.22;
const SLIDEPAD_ROUTE_IDS = Object.freeze({
  battle: Object.freeze(['setup', 'battle']),
  shop: Object.freeze(['shop']),
  partner: Object.freeze(['partner', 'characters']),
  cards: Object.freeze(['cards']),
});
// The codex Home visual layer is still the current player-facing Home consumer. Do not destroy it
// during compatibility cleanup; only duplicate legacy controls are safe to remove here.
const LEGACY_HOME_SELECTORS = Object.freeze([
  '#codexHomePartnerChip',
  '.codexPartnerChip',
  '#codexHomeBattleCta',
  '.codexBattleCta',
]);

const runtime = {
  mounted: false,
  home: null,
  observer: null,
  resizeHandler: null,
  media: null,
  mediaHandler: null,
  refreshScheduled: false,
  active: false,
  enterCount: 0,
  reopenCount: 0,
  renderCount: 0,
  lastVariant: null,
  lastProfile: null,
  lastExpanded: null,
  lastRouteIds: [],
  lastSelectedRouteId: null,
  lastError: null,
  animations: new Set(),
  slidepad: {
    home: null,
    center: null,
    handlers: null,
    pointerId: null,
    originX: 0,
    originY: 0,
    moved: false,
    previewButton: null,
  },
  slotRoll: {
    home: null,
    center: null,
    handlers: null,
    pointerId: null,
    originX: 0,
    originY: 0,
    routeButton: null,
    state: null,
    lastX: 0,
    detentPx: 0,
    previewNode: null,
  },
};

export function removeLegacyHomeNodes(home) {
  if (!home || typeof home.querySelectorAll !== 'function') return 0;
  const nodes = new Set();
  for (const selector of LEGACY_HOME_SELECTORS) {
    for (const node of home.querySelectorAll(selector)) nodes.add(node);
  }
  let removed = 0;
  for (const node of nodes) {
    if (!node || typeof node.remove !== 'function') continue;
    node.remove();
    removed += 1;
  }
  return removed;
}

export function removeDecorativeGlobalBrand(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return 0;
  let removed = 0;
  for (const node of root.querySelectorAll(DECORATIVE_GLOBAL_BRAND_SELECTOR)) {
    if (!node || typeof node.remove !== 'function') continue;
    node.remove();
    removed += 1;
  }
  return removed;
}

// Compatibility/fallback mapping for non-pointer input. Pointer targeting below does not use
// this coarse quadrant resolver as its target authority.
export function resolveHomeSlidepadRole({
  dx = 0,
  dy = 0,
  deadZonePx = SLIDEPAD_DEAD_ZONE_PX,
  downRejectRatio = SLIDEPAD_DOWN_REJECT_RATIO,
} = {}) {
  const x = Number(dx);
  const y = Number(dy);
  const dead = Number(deadZonePx);
  const rejectRatio = Number(downRejectRatio);
  if (![x, y, dead, rejectRatio].every(Number.isFinite) || dead < 0 || rejectRatio <= 0) return null;
  const distance = Math.hypot(x, y);
  if (distance < dead) return null;
  if (y > Math.abs(x) * rejectRatio) return null;
  if (x < 0) return y < 0 ? 'partner' : 'cards';
  return y < 0 ? 'battle' : 'shop';
}

export function resolveHomeSlidepadRouteId(routeIds, role) {
  if (!Array.isArray(routeIds) || typeof role !== 'string') return null;
  const available = new Set(routeIds.map((value) => String(value || '').trim()).filter(Boolean));
  const candidates = SLIDEPAD_ROUTE_IDS[role];
  if (!candidates) return null;
  return candidates.find((id) => available.has(id)) || null;
}

export function resolveHomeSlidepadRelease({ dx = 0, dy = 0, routeIds = [], deadZonePx } = {}) {
  const role = resolveHomeSlidepadRole({ dx, dy, deadZonePx });
  const routeId = resolveHomeSlidepadRouteId(routeIds, role);
  return Object.freeze({ role, routeId, commit: Boolean(routeId) });
}

export function resolveHomeSlidepadTargetTranslation({ originX, originY, targetRect } = {}) {
  const ox = Number(originX);
  const oy = Number(originY);
  const left = Number(targetRect?.left);
  const top = Number(targetRect?.top);
  const width = Number(targetRect?.width);
  const height = Number(targetRect?.height);
  if (![ox, oy, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return Object.freeze({
    x: left + width / 2 - ox,
    y: top + height / 2 - oy,
  });
}

function targetCandidate({ originX, originY, unitX, unitY, target }) {
  const routeId = String(target?.routeId || '').trim();
  const rect = target?.rect;
  const left = Number(rect?.left);
  const top = Number(rect?.top);
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (!routeId || ![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const vx = left + width / 2 - originX;
  const vy = top + height / 2 - originY;
  const forward = vx * unitX + vy * unitY;
  if (!(forward > 0)) return null;
  const perpendicular = Math.abs(vx * unitY - vy * unitX);
  const targetReach = Math.max(width, height, HOME_TOUCH_TARGET_MIN_PX) / 2;
  const miss = Math.max(0, perpendicular - targetReach);
  const score = miss / Math.max(forward, 1) + forward * 0.00025;
  return Object.freeze({ routeId, score, forward, perpendicular, targetReach });
}

// Pointer intent is the straight drag ray. Existing targets compete by their actual on-screen
// geometry; the user is not required to drive the finger into a button centre.
export function resolveHomeSlidepadRayTarget({
  originX = 0,
  originY = 0,
  pointerX = 0,
  pointerY = 0,
  targets = [],
  currentRouteId = null,
  deadZonePx = SLIDEPAD_DEAD_ZONE_PX,
  downRejectRatio = SLIDEPAD_DOWN_REJECT_RATIO,
  switchAdvantage = SLIDEPAD_SWITCH_ADVANTAGE,
} = {}) {
  const ox = Number(originX);
  const oy = Number(originY);
  const px = Number(pointerX);
  const py = Number(pointerY);
  const dead = Number(deadZonePx);
  const rejectRatio = Number(downRejectRatio);
  const advantage = Number(switchAdvantage);
  if (![ox, oy, px, py, dead, rejectRatio, advantage].every(Number.isFinite)
    || dead < 0 || rejectRatio <= 0 || advantage < 0 || advantage >= 1 || !Array.isArray(targets)) return null;

  const dx = px - ox;
  const dy = py - oy;
  const distance = Math.hypot(dx, dy);
  if (distance < dead) return null;
  if (dy > Math.abs(dx) * rejectRatio) return null;
  const unitX = dx / distance;
  const unitY = dy / distance;
  const candidates = targets
    .map((target) => targetCandidate({ originX: ox, originY: oy, unitX, unitY, target }))
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || b.forward - a.forward);
  if (!candidates.length) return null;

  const best = candidates[0];
  const current = currentRouteId == null
    ? null
    : candidates.find((candidate) => candidate.routeId === String(currentRouteId));
  if (current && current.routeId !== best.routeId) {
    // A newly crossed ray must be materially better before the gummy attachment lets go.
    const retainLimit = best.score * (1 + advantage) + 0.02;
    if (current.score <= retainLimit) return current;
  }
  return best;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}{
  min-width:${HOME_TOUCH_TARGET_MIN_PX}px;
  min-height:${HOME_TOUCH_TARGET_MIN_PX}px;
  touch-action:manipulation;
  transition:opacity 120ms ease-out,filter 120ms ease-out,outline-color 120ms ease-out,translate 120ms ease-out,scale 120ms ease-out;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}[data-home-target="setup"],
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}[data-home-target="battle"]{
  opacity:1;
  filter:brightness(1.16) saturate(1.08);
  outline:2px solid currentColor;
  outline-offset:3px;
  font-weight:800;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:not([data-home-target="setup"]):not([data-home-target="battle"]){
  opacity:.72;
  filter:brightness(.88) saturate(.78);
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:not([data-home-target="setup"]):not([data-home-target="battle"]):hover,
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:not([data-home-target="setup"]):not([data-home-target="battle"]):focus-visible,
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:not([data-home-target="setup"]):not([data-home-target="battle"])[data-home-slidepad-preview="true"]{
  opacity:1;
  filter:brightness(1.06) saturate(1);
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}:focus-visible{
  outline:2px solid currentColor;
  outline-offset:3px;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}[data-home-slidepad-preview="true"]{
  opacity:1;
  outline:2px solid currentColor;
  outline-offset:4px;
  filter:brightness(1.12) saturate(1.05);
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR}[data-home-slidepad-attached="true"]{
  opacity:1;
  translate:var(--gameroad-home-slidepad-attach-x,0px) var(--gameroad-home-slidepad-attach-y,0px);
  scale:1.035;
  filter:brightness(1.16) saturate(1.08) drop-shadow(0 0 9px currentColor);
  outline:3px solid currentColor;
  outline-offset:2px;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${SLIDEPAD_CENTER_SELECTOR}{
  touch-action:none;
  translate:var(--gameroad-home-slidepad-x, 0px) var(--gameroad-home-slidepad-y, 0px);
}
/* Wide layout keeps duplicate utility navigation visually subordinate. The frameless utility
   control itself is shared by every mounted Home projection so responsive reflow cannot restore
   panel chrome or shrink the semantic touch target. */
${HOME_SELECTOR}[data-home-shell-variant="wide-landscape"] ${SECONDARY_UTILITY_SELECTOR}{
  opacity:.38!important;
  filter:saturate(.55) brightness(.82)!important;
  transition:opacity 120ms ease-out,filter 120ms ease-out!important;
}
${HOME_SELECTOR}[data-home-shell-variant="wide-landscape"] ${SECONDARY_UTILITY_SELECTOR}:hover,
${HOME_SELECTOR}[data-home-shell-variant="wide-landscape"] ${SECONDARY_UTILITY_SELECTOR}:focus-within{
  opacity:.94!important;
  filter:none!important;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${SECONDARY_UTILITY_SELECTOR} ${SECONDARY_UTILITY_BUTTON_SELECTOR}{
  min-width:${HOME_TOUCH_TARGET_MIN_PX}px!important;
  min-height:${HOME_TOUCH_TARGET_MIN_PX}px!important;
  border-color:transparent!important;
  background:transparent!important;
  box-shadow:none!important;
  backdrop-filter:none!important;
}
${HOME_SELECTOR}[data-home-shell-mounted="true"] ${SECONDARY_UTILITY_SELECTOR} ${SECONDARY_UTILITY_BUTTON_SELECTOR}:focus-visible{
  opacity:1!important;
  outline:2px solid currentColor!important;
  outline-offset:3px!important;
}
@media (prefers-reduced-motion:reduce){
  ${HOME_SELECTOR}[data-home-shell-mounted="true"] ${ROUTE_SELECTOR},
  ${HOME_SELECTOR}[data-home-shell-variant="wide-landscape"] ${SECONDARY_UTILITY_SELECTOR}{
    scroll-behavior:auto;
    transition:none!important;
  }
}
`;
  document.head.append(style);
}

function routeButtons(home) {
  return [...home.querySelectorAll(ROUTE_SELECTOR)].filter((node) => node instanceof HTMLElement);
}

function routeId(button) {
  const value = String(button?.dataset?.homeTarget || '').trim();
  return value || null;
}

function roleForRouteId(id) {
  for (const [role, ids] of Object.entries(SLIDEPAD_ROUTE_IDS)) {
    if (ids.includes(id)) return role;
  }
  return null;
}

function selectedRouteId(buttons) {
  const selected = buttons.find((button) => (
    button.getAttribute('aria-current') === 'page'
    || button.getAttribute('aria-current') === 'true'
    || button.getAttribute('aria-pressed') === 'true'
  ));
  return selected ? routeId(selected) : null;
}

function reducedMotion() {
  return Boolean(runtime.media?.matches);
}

function isHomeActive(home) {
  if (!home?.isConnected) return false;
  if (home.hasAttribute('hidden')) return false;
  if (home.classList.contains('active')) return true;
  const style = getComputedStyle(home);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function explicitExpandedState(home) {
  const center = home?.querySelector?.(SLIDEPAD_CENTER_SELECTOR);
  if (center instanceof HTMLElement) {
    const ariaExpanded = center.getAttribute('aria-expanded');
    if (ariaExpanded === 'false') return false;
    if (ariaExpanded === 'true') return true;
  }
  if (home?.dataset?.homeSlidepadStowed === 'true') return false;
  return true;
}

export function shouldDismissHomeSlidepadOnBlankDoubleClick({ expanded, home, target } = {}) {
  if (expanded !== true || !home || !target) return false;
  if (target !== home && typeof home.contains === 'function' && !home.contains(target)) return false;
  if (typeof target.closest === 'function') {
    const interactive = target.closest([
      SLIDEPAD_CENTER_SELECTOR,
      ROUTE_SELECTOR,
      SECONDARY_UTILITY_SELECTOR,
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[data-home-target]',
    ].join(','));
    if (interactive) return false;
  }
  return true;
}

function clearAnimations() {
  for (const animation of runtime.animations) {
    try { animation.cancel(); } catch {}
  }
  runtime.animations.clear();
}

function runReopenEntrance(buttons) {
  clearAnimations();
  if (reducedMotion()) return;
  buttons.forEach((button, index) => {
    if (typeof button.animate !== 'function') return;
    const animation = button.animate([
      { opacity: 0.48, filter: 'brightness(.78) saturate(.72)', transform: 'translateY(7px) scale(.986)' },
      { opacity: 1, filter: 'none', transform: 'translateY(0) scale(1)' },
    ], {
      duration: 260,
      delay: Math.min(index, 8) * 24,
      easing: 'cubic-bezier(.16,.82,.18,1)',
      fill: 'none',
    });
    runtime.animations.add(animation);
    animation.finished.catch(() => undefined).finally(() => runtime.animations.delete(animation));
  });
}

function markHome(home, { variant, profile, expanded, routeIds, selectedRouteId: selected }) {
  home.dataset.homeShellMounted = 'true';
  home.dataset.homeShellVariant = variant;
  home.dataset.homeShellProfile = profile;
  home.dataset.homeShellExpanded = expanded ? 'true' : 'false';
  home.dataset.homeShellRouteCount = String(routeIds.length);
  if (selected) home.dataset.homeShellSelectedRoute = selected;
  else delete home.dataset.homeShellSelectedRoute;
  home.style.setProperty('--gameroad-home-shell-touch-min', `${HOME_TOUCH_TARGET_MIN_PX}px`);
}

function unmarkHome(home) {
  if (!home) return;
  delete home.dataset.homeShellMounted;
  delete home.dataset.homeShellVariant;
  delete home.dataset.homeShellProfile;
  delete home.dataset.homeShellExpanded;
  delete home.dataset.homeShellRouteCount;
  delete home.dataset.homeShellSelectedRoute;
  home.style.removeProperty('--gameroad-home-shell-touch-min');
}

function resetKnob(center) {
  if (!(center instanceof HTMLElement)) return;
  center.style.removeProperty('--gameroad-home-slidepad-x');
  center.style.removeProperty('--gameroad-home-slidepad-y');
  delete center.dataset.homeSlidepadDragging;
}

function clearButtonAttachment(button) {
  if (!(button instanceof HTMLElement)) return;
  delete button.dataset.homeSlidepadPreview;
  delete button.dataset.homeSlidepadAttached;
  button.style.removeProperty('--gameroad-home-slidepad-attach-x');
  button.style.removeProperty('--gameroad-home-slidepad-attach-y');
}

function setPreview(button) {
  const previous = runtime.slidepad.previewButton;
  if (previous && previous !== button) clearButtonAttachment(previous);
  runtime.slidepad.previewButton = button instanceof HTMLElement ? button : null;
  if (runtime.slidepad.previewButton) runtime.slidepad.previewButton.dataset.homeSlidepadPreview = 'true';
}

function clearPreview() {
  if (runtime.slidepad.previewButton) clearButtonAttachment(runtime.slidepad.previewButton);
  runtime.slidepad.previewButton = null;
}

export function normalizeHomeSetupModeItems(items = []) {
  if (!Array.isArray(items)) return Object.freeze([]);
  const normalized = [];
  const seen = new Set();
  for (const source of items) {
    const id = String(source?.id ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = String(source?.label ?? id).trim() || id;
    normalized.push(Object.freeze({ id, label, selected: source?.selected === true, control: source?.control ?? null }));
  }
  return Object.freeze(normalized);
}

export function createHomeSetupModeSlotRoll({ items = [], centerWidth = 0 } = {}) {
  const modes = normalizeHomeSetupModeItems(items);
  const anchorIndex = modes.findIndex((item) => item.selected);
  const width = Number(centerWidth);
  if (modes.length < 2 || anchorIndex < 0 || !Number.isFinite(width) || width <= 0) return null;
  return Object.freeze({
    state: createSlotRollState({ items: modes.map(({ id, label }) => ({ id, label })), anchorIndex }),
    detentPx: width,
  });
}

function currentSetupModeItems() {
  const setup = document.querySelector(SETUP_SELECTOR);
  if (!(setup instanceof HTMLElement)) return Object.freeze([]);
  return normalizeHomeSetupModeItems([...setup.querySelectorAll(SETUP_MODE_SELECTOR)]
    .filter((node) => node instanceof HTMLElement)
    .map((control) => ({
      id: control.dataset.mode,
      label: control.textContent,
      selected: control.classList.contains('on') || control.getAttribute('aria-pressed') === 'true',
      control,
    })));
}

function clearSlotRollProjection() {
  runtime.slotRoll.previewNode?.remove?.();
  if (runtime.slotRoll.routeButton instanceof HTMLElement) {
    delete runtime.slotRoll.routeButton.dataset.homeSlotRollActive;
    delete runtime.slotRoll.routeButton.dataset.homeSlotRollItem;
  }
  runtime.slotRoll.routeButton = null;
  runtime.slotRoll.state = null;
  runtime.slotRoll.lastX = 0;
  runtime.slotRoll.detentPx = 0;
  runtime.slotRoll.previewNode = null;
}

function renderSlotRollProjection(home, button) {
  const state = runtime.slotRoll.state;
  if (!(home instanceof HTMLElement) || !(button instanceof HTMLElement) || !state) return;
  let node = runtime.slotRoll.previewNode;
  if (!(node instanceof HTMLElement)) {
    node = document.createElement('div');
    node.dataset.homeSlotRollPreview = 'true';
    node.setAttribute('aria-live', 'polite');
    node.style.cssText = 'position:fixed;z-index:80;pointer-events:none;white-space:nowrap;padding:7px 10px;border-radius:999px;background:rgba(9,13,30,.9);border:1px solid currentColor;box-shadow:0 8px 24px rgba(0,0,0,.32);font-size:11px;font-weight:800;line-height:1.2;transform:translate(-50%,-100%);';
    home.appendChild(node);
    runtime.slotRoll.previewNode = node;
  }
  const windowItems = projectSlotRollWindow(state, { radius: 1 });
  node.textContent = windowItems.map((entry) => entry.selected ? `【${entry.item.label}】` : entry.item.label).join('  ‹  ');
  const rect = button.getBoundingClientRect();
  node.style.left = `${rect.left + rect.width / 2}px`;
  node.style.top = `${Math.max(8, rect.top - 8)}px`;
  button.dataset.homeSlotRollActive = 'true';
  button.dataset.homeSlotRollItem = state.itemId || '';
}

function beginOrAdvanceHomeModeSlotRoll(home, button, event) {
  if (!(button instanceof HTMLElement) || roleForRouteId(routeId(button)) !== 'battle') {
    clearSlotRollProjection();
    return null;
  }
  if (runtime.slotRoll.routeButton !== button || !runtime.slotRoll.state) {
    const centerRect = runtime.slotRoll.center?.getBoundingClientRect?.();
    const created = createHomeSetupModeSlotRoll({ items: currentSetupModeItems(), centerWidth: centerRect?.width });
    if (!created) {
      clearSlotRollProjection();
      return null;
    }
    clearSlotRollProjection();
    runtime.slotRoll.routeButton = button;
    runtime.slotRoll.state = created.state;
    runtime.slotRoll.lastX = Number(event.clientX);
    runtime.slotRoll.detentPx = created.detentPx;
    renderSlotRollProjection(home, button);
    return runtime.slotRoll.state;
  }
  const nextX = Number(event.clientX);
  const deltaPx = nextX - runtime.slotRoll.lastX;
  runtime.slotRoll.lastX = nextX;
  const advanced = advanceSlotRollDrag(runtime.slotRoll.state, { deltaPx, detentPx: runtime.slotRoll.detentPx });
  runtime.slotRoll.state = advanced.state;
  renderSlotRollProjection(home, button);
  return runtime.slotRoll.state;
}

function releaseRouteButtonAtEvent(home, event) {
  const buttons = routeButtons(home);
  const target = resolveHomeSlidepadRayTarget({
    originX: runtime.slotRoll.originX,
    originY: runtime.slotRoll.originY,
    pointerX: Number(event.clientX),
    pointerY: Number(event.clientY),
    currentRouteId: routeId(runtime.slotRoll.routeButton),
    targets: buttons.map((button) => ({ routeId: routeId(button), rect: button.getBoundingClientRect() })),
  });
  return target ? buttons.find((button) => routeId(button) === target.routeId) || null : null;
}

function selectSetupModeAfterExistingRoute(itemId) {
  if (!itemId) return;
  queueMicrotask(() => {
    const setup = document.querySelector(SETUP_SELECTOR);
    if (!(setup instanceof HTMLElement) || !setup.classList.contains('active')) return;
    const control = currentSetupModeItems().find((item) => item.id === itemId)?.control;
    if (!(control instanceof HTMLElement)) return;
    if (control.classList.contains('on') || control.getAttribute('aria-pressed') === 'true') return;
    control.click();
  });
}

function unbindHomeModeSlotRoll() {
  const center = runtime.slotRoll.center;
  const handlers = runtime.slotRoll.handlers;
  clearSlotRollProjection();
  if (center instanceof HTMLElement && handlers) {
    center.removeEventListener('pointerdown', handlers.pointerdown);
    center.removeEventListener('pointermove', handlers.pointermove);
    center.removeEventListener('pointerup', handlers.pointerupCapture, true);
    center.removeEventListener('pointercancel', handlers.pointercancel);
    center.removeEventListener('lostpointercapture', handlers.lostpointercapture);
    delete center.dataset.homeSlotRollBound;
  }
  runtime.slotRoll.home = null;
  runtime.slotRoll.center = null;
  runtime.slotRoll.handlers = null;
  runtime.slotRoll.pointerId = null;
  runtime.slotRoll.originX = 0;
  runtime.slotRoll.originY = 0;
}

function bindHomeModeSlotRoll(home) {
  const center = home.querySelector(SLIDEPAD_CENTER_SELECTOR);
  if (!(center instanceof HTMLElement)) {
    if (runtime.slotRoll.center) unbindHomeModeSlotRoll();
    return;
  }
  if (runtime.slotRoll.home === home && runtime.slotRoll.center === center && runtime.slotRoll.handlers) return;
  unbindHomeModeSlotRoll();
  runtime.slotRoll.home = home;
  runtime.slotRoll.center = center;
  center.dataset.homeSlotRollBound = 'true';
  const handlers = {
    pointerdown(event) {
      if (!runtime.active) return;
      runtime.slotRoll.pointerId = event.pointerId;
      const rect = center.getBoundingClientRect();
      runtime.slotRoll.originX = rect.left + rect.width / 2;
      runtime.slotRoll.originY = rect.top + rect.height / 2;
      clearSlotRollProjection();
    },
    pointermove(event) {
      if (event.pointerId !== runtime.slotRoll.pointerId || !runtime.active) return;
      const button = home.querySelector(`${ROUTE_SELECTOR}[data-home-slidepad-preview="true"]`);
      beginOrAdvanceHomeModeSlotRoll(home, button, event);
    },
    pointerupCapture(event) {
      if (event.pointerId !== runtime.slotRoll.pointerId) return;
      const releaseButton = releaseRouteButtonAtEvent(home, event);
      const commit = releaseButton instanceof HTMLElement && releaseButton === runtime.slotRoll.routeButton
        && roleForRouteId(routeId(releaseButton)) === 'battle'
        ? resolveSlotRollCommit(runtime.slotRoll.state)
        : null;
      runtime.slotRoll.pointerId = null;
      runtime.slotRoll.originX = 0;
      runtime.slotRoll.originY = 0;
      clearSlotRollProjection();
      if (commit?.itemId) selectSetupModeAfterExistingRoute(commit.itemId);
    },
    pointercancel(event) {
      if (event.pointerId !== runtime.slotRoll.pointerId) return;
      runtime.slotRoll.pointerId = null;
      clearSlotRollProjection();
    },
    lostpointercapture(event) {
      if (event.pointerId !== runtime.slotRoll.pointerId) return;
      runtime.slotRoll.pointerId = null;
      clearSlotRollProjection();
    },
  };
  runtime.slotRoll.handlers = handlers;
  center.addEventListener('pointerdown', handlers.pointerdown);
  center.addEventListener('pointermove', handlers.pointermove);
  center.addEventListener('pointerup', handlers.pointerupCapture, true);
  center.addEventListener('pointercancel', handlers.pointercancel);
  center.addEventListener('lostpointercapture', handlers.lostpointercapture);
}

export function resolveHomeSlidepadFeedbackTranslation({
  dx = 0,
  dy = 0,
  maxPx = SLIDEPAD_LOCAL_FEEDBACK_MAX_PX,
} = {}) {
  const x = Number(dx);
  const y = Number(dy);
  const max = Number(maxPx);
  if (![x, y, max].every(Number.isFinite) || max < 0) return null;
  const distance = Math.hypot(x, y);
  if (distance <= 0 || max === 0) return Object.freeze({ x: 0, y: 0 });
  const gain = Math.min(1, max / distance);
  return Object.freeze({ x: x * gain, y: y * gain });
}

function moveKnobWithGesture(center, dx, dy) {
  if (!(center instanceof HTMLElement)) return;
  const translation = resolveHomeSlidepadFeedbackTranslation({ dx, dy });
  if (!translation) return;
  center.style.setProperty('--gameroad-home-slidepad-x', `${translation.x.toFixed(1)}px`);
  center.style.setProperty('--gameroad-home-slidepad-y', `${translation.y.toFixed(1)}px`);
}

function applyTargetAdhesion(button) {
  if (!(button instanceof HTMLElement)) return;
  const rect = button.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const vx = runtime.slidepad.originX - cx;
  const vy = runtime.slidepad.originY - cy;
  const distance = Math.hypot(vx, vy);
  const pull = distance > 0 ? Math.min(SLIDEPAD_TARGET_PULL_MAX_PX, Math.max(4, distance * 0.015)) : 0;
  const x = distance > 0 ? vx / distance * pull : 0;
  const y = distance > 0 ? vy / distance * pull : 0;
  button.style.setProperty('--gameroad-home-slidepad-attach-x', `${x.toFixed(1)}px`);
  button.style.setProperty('--gameroad-home-slidepad-attach-y', `${y.toFixed(1)}px`);
  button.dataset.homeSlidepadAttached = 'true';
}

function resetGesture({ releaseCapture = true } = {}) {
  const center = runtime.slidepad.center;
  const pointerId = runtime.slidepad.pointerId;
  runtime.slidepad.pointerId = null;
  runtime.slidepad.originX = 0;
  runtime.slidepad.originY = 0;
  runtime.slidepad.moved = false;
  clearPreview();
  resetKnob(center);
  if (releaseCapture && center instanceof HTMLElement && pointerId != null) {
    try {
      if (center.hasPointerCapture?.(pointerId)) center.releasePointerCapture(pointerId);
    } catch {}
  }
}

function unbindSlidepad() {
  const home = runtime.slidepad.home;
  const center = runtime.slidepad.center;
  const handlers = runtime.slidepad.handlers;
  resetGesture();
  if (center instanceof HTMLElement && handlers) {
    center.removeEventListener('pointerdown', handlers.pointerdown);
    center.removeEventListener('pointermove', handlers.pointermove);
    center.removeEventListener('pointerup', handlers.pointerup);
    center.removeEventListener('pointercancel', handlers.pointercancel);
    center.removeEventListener('lostpointercapture', handlers.lostpointercapture);
    delete center.dataset.homeSlidepadBound;
  }
  if (home instanceof HTMLElement && handlers) home.removeEventListener('dblclick', handlers.dblclick);
  runtime.slidepad.home = null;
  runtime.slidepad.center = null;
  runtime.slidepad.handlers = null;
}

function bindSlidepad(home) {
  const center = home.querySelector(SLIDEPAD_CENTER_SELECTOR);
  if (!(center instanceof HTMLElement)) {
    if (runtime.slidepad.center) unbindSlidepad();
    return;
  }
  if (runtime.slidepad.home === home && runtime.slidepad.center === center && runtime.slidepad.handlers) return;
  unbindSlidepad();
  runtime.slidepad.home = home;
  runtime.slidepad.center = center;
  center.dataset.homeSlidepadBound = 'true';

  const pointerVector = (event) => ({
    dx: Number(event.clientX) - runtime.slidepad.originX,
    dy: Number(event.clientY) - runtime.slidepad.originY,
  });

  const updateFromPointer = (event) => {
    const { dx, dy } = pointerVector(event);
    const distance = Math.hypot(dx, dy);
    if (distance >= SLIDEPAD_DEAD_ZONE_PX) runtime.slidepad.moved = true;
    const buttons = routeButtons(home);
    const currentRouteId = routeId(runtime.slidepad.previewButton);
    const target = resolveHomeSlidepadRayTarget({
      originX: runtime.slidepad.originX,
      originY: runtime.slidepad.originY,
      pointerX: Number(event.clientX),
      pointerY: Number(event.clientY),
      currentRouteId,
      targets: buttons.map((button) => ({ routeId: routeId(button), rect: button.getBoundingClientRect() })),
    });
    const button = target ? buttons.find((candidate) => routeId(candidate) === target.routeId) || null : null;
    setPreview(button);
    if (button) applyTargetAdhesion(button);
    moveKnobWithGesture(center, dx, dy);
    return { dx, dy, role: button ? roleForRouteId(routeId(button)) : null, button };
  };

  const handlers = {
    dblclick(event) {
      if (!runtime.active) return;
      const expanded = explicitExpandedState(home);
      if (!shouldDismissHomeSlidepadOnBlankDoubleClick({ expanded, home, target: event.target })) return;
      event.preventDefault();
      event.stopPropagation();
      center.click();
    },
    pointerdown(event) {
      if (!runtime.active || runtime.slidepad.pointerId != null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      const rect = center.getBoundingClientRect();
      runtime.slidepad.pointerId = event.pointerId;
      runtime.slidepad.originX = rect.left + rect.width / 2;
      runtime.slidepad.originY = rect.top + rect.height / 2;
      runtime.slidepad.moved = false;
      center.dataset.homeSlidepadDragging = 'true';
      try { center.setPointerCapture?.(event.pointerId); } catch {}
      updateFromPointer(event);
    },
    pointermove(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      updateFromPointer(event);
      if (runtime.slidepad.moved) event.preventDefault();
    },
    pointerup(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      const { button } = updateFromPointer(event);
      const moved = runtime.slidepad.moved;
      resetGesture();
      event.preventDefault();
      event.stopPropagation();
      if (!runtime.active) return;
      if (!moved) {
        center.click();
        return;
      }
      if (button) button.click();
    },
    pointercancel(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      resetGesture();
    },
    lostpointercapture(event) {
      if (event.pointerId !== runtime.slidepad.pointerId) return;
      resetGesture({ releaseCapture: false });
    },
  };
  runtime.slidepad.handlers = handlers;
  home.addEventListener('dblclick', handlers.dblclick);
  center.addEventListener('pointerdown', handlers.pointerdown);
  center.addEventListener('pointermove', handlers.pointermove);
  center.addEventListener('pointerup', handlers.pointerup);
  center.addEventListener('pointercancel', handlers.pointercancel);
  center.addEventListener('lostpointercapture', handlers.lostpointercapture);
}

export function refreshHomeBootPresentation() {
  removeDecorativeGlobalBrand();
  const home = document.querySelector(HOME_SELECTOR);
  if (!(home instanceof HTMLElement)) {
    runtime.lastError = 'HOME_DOM_UNAVAILABLE';
    runtime.active = false;
    unbindHomeModeSlotRoll();
    unbindSlidepad();
    return snapshot();
  }
  if (runtime.home && runtime.home !== home) {
    unbindHomeModeSlotRoll();
    unbindSlidepad();
    unmarkHome(runtime.home);
  }
  runtime.home = home;
  removeLegacyHomeNodes(home);

  const buttons = routeButtons(home);
  const ids = buttons.map(routeId).filter(Boolean);
  const selected = selectedRouteId(buttons);
  const expanded = explicitExpandedState(home);
  let state;
  try {
    state = createHomeShellState({ expanded, routeIds: ids, selectedRouteId: selected });
  } catch (error) {
    runtime.lastError = String(error?.message || error || 'HOME_STATE_INVALID');
    return snapshot();
  }

  const variant = classifyHomeViewport({ width: innerWidth, height: innerHeight });
  const profile = reducedMotion() ? 'reduced' : 'full';
  const active = isHomeActive(home);
  const reopening = runtime.lastExpanded === false && state.expanded === true;
  markHome(home, {
    variant,
    profile,
    expanded: state.expanded,
    routeIds: state.routeIds,
    selectedRouteId: state.selectedRouteId,
  });
  bindSlidepad(home);
  bindHomeModeSlotRoll(home);

  const entering = active && !runtime.active;
  runtime.active = active;
  runtime.lastVariant = variant;
  runtime.lastProfile = profile;
  runtime.lastExpanded = state.expanded;
  runtime.lastRouteIds = [...state.routeIds];
  runtime.lastSelectedRouteId = state.selectedRouteId;
  runtime.lastError = null;
  runtime.renderCount += 1;
  if (entering) runtime.enterCount += 1;
  if (active && reopening) {
    runtime.reopenCount += 1;
    runReopenEntrance(buttons);
  }
  return snapshot();
}

function scheduleRefresh() {
  if (runtime.refreshScheduled) return;
  runtime.refreshScheduled = true;
  const run = () => {
    runtime.refreshScheduled = false;
    refreshHomeBootPresentation();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else queueMicrotask(run);
}

export function mountHomeBootPresentation() {
  if (runtime.mounted) return snapshot();
  removeDecorativeGlobalBrand();
  ensureStyle();
  runtime.media = matchMedia('(prefers-reduced-motion: reduce)');
  runtime.resizeHandler = () => scheduleRefresh();
  runtime.mediaHandler = () => scheduleRefresh();
  addEventListener('resize', runtime.resizeHandler, { passive: true });
  runtime.media.addEventListener?.('change', runtime.mediaHandler);
  runtime.observer = new MutationObserver(() => scheduleRefresh());
  runtime.observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-current', 'aria-pressed', 'aria-expanded', 'data-home-target', 'data-home-slidepad-stowed'],
  });
  runtime.mounted = true;
  refreshHomeBootPresentation();
  mountRogueRunFromCurrentBrowser();
  return snapshot();
}

export function unmountHomeBootPresentation() {
  clearAnimations();
  runtime.observer?.disconnect();
  if (runtime.resizeHandler) removeEventListener('resize', runtime.resizeHandler);
  runtime.media?.removeEventListener?.('change', runtime.mediaHandler);
  unbindHomeModeSlotRoll();
  unbindSlidepad();
  unmarkHome(runtime.home);
  runtime.mounted = false;
  runtime.active = false;
  runtime.refreshScheduled = false;
  runtime.observer = null;
  runtime.home = null;
  return snapshot();
}

export function snapshot() {
  return Object.freeze({
    mounted: runtime.mounted,
    active: runtime.active,
    enterCount: runtime.enterCount,
    reopenCount: runtime.reopenCount,
    renderCount: runtime.renderCount,
    viewportVariant: runtime.lastVariant,
    presentationProfile: runtime.lastProfile,
    expanded: runtime.lastExpanded,
    routeIds: Object.freeze([...runtime.lastRouteIds]),
    selectedRouteId: runtime.lastSelectedRouteId,
    touchTargetMinPx: HOME_TOUCH_TARGET_MIN_PX,
    slidepadGestureBound: Boolean(runtime.slidepad.center && runtime.slidepad.handlers),
    slidepadBlankDoubleClickDismissBound: Boolean(runtime.slidepad.home && runtime.slidepad.handlers),
    slidepadPointerActive: runtime.slidepad.pointerId != null,
    slidepadTargeting: 'straight-ray-target-side-adhesion',
    slotRollModeBranchBound: Boolean(runtime.slotRoll.center && runtime.slotRoll.handlers),
    slotRollModeBranchActive: Boolean(runtime.slotRoll.state),
    slotRollModeItemId: runtime.slotRoll.state?.itemId ?? null,
    slotRollModeSource: 'setup-data-mode-current-dom',
    projectionStatus: 'scene-target-projection-mounted',
    lastError: runtime.lastError,
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  globalThis[GLOBAL_KEY] = Object.freeze({
    mount: mountHomeBootPresentation,
    refresh: refreshHomeBootPresentation,
    snapshot,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountHomeBootPresentation(), { once: true });
  } else {
    mountHomeBootPresentation();
  }
}

const QUICK_SETTINGS_GLOBAL_KEY = 'GAMEROAD_QUICK_SETTINGS';
const QUICK_SETTINGS_STYLE_ID = 'gameroad-shared-quick-settings-style-r1';
const QUICK_SETTINGS_OVERLAY_ATTR = 'data-gameroad-quick-settings';

export const QUICK_SETTINGS_CONTROL_IDS = Object.freeze({
  reduceMotion: 'reduceMotion',
  lowPerf: 'lowPerf',
  musicVolume: 'musicVolume',
  sfxVolume: 'sfxVolume',
  partnerVoiceVolume: 'partnerVoiceVolume',
  musicMute: 'musicMute',
  sfxMute: 'sfxMute',
  partnerVoiceMute: 'partnerVoiceMute',
});

export const QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS = Object.freeze(['masterVolume']);

const QUICK_SETTINGS_AUDIO_ROWS = Object.freeze([
  Object.freeze({ label: 'BGM', volume: 'musicVolume', mute: 'musicMute', muted: 'musicMuted' }),
  Object.freeze({ label: '効果音', volume: 'sfxVolume', mute: 'sfxMute', muted: 'sfxMuted' }),
  Object.freeze({ label: 'Voice', volume: 'partnerVoiceVolume', mute: 'partnerVoiceMute', muted: 'partnerVoiceMuted' }),
]);

const QUICK_SETTINGS_TOGGLE_ROWS = Object.freeze([
  Object.freeze({ key: 'reduceMotion', label: '動き軽減' }),
  Object.freeze({ key: 'lowPerf', label: '軽量表示' }),
]);

const quickSettingsRuntime = {
  overlay: null,
  trigger: null,
  bypassTrigger: null,
  installed: false,
};

function quickSettingsPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function quickSettingsToggleOn(control) {
  const aria = control?.getAttribute?.('aria-pressed');
  if (aria === 'true') return true;
  if (aria === 'false') return false;
  const value = String(control?.textContent || '').trim().toLowerCase();
  return value === 'on' || value === 'オン' || value.includes(' on');
}

function quickSettingsControl(documentSource, key) {
  const id = QUICK_SETTINGS_CONTROL_IDS[key];
  return id ? documentSource?.getElementById?.(id) ?? null : null;
}

export function inspectExistingQuickSettingsAuthority(documentSource = globalThis.document) {
  const controls = {};
  const missing = [];
  for (const key of Object.keys(QUICK_SETTINGS_CONTROL_IDS)) {
    const control = quickSettingsControl(documentSource, key);
    controls[key] = control;
    if (!control) missing.push(key);
  }
  return Object.freeze({
    settingsSection: documentSource?.querySelector?.('section[data-screen="settings"]') ?? null,
    controls: Object.freeze(controls),
    missing: Object.freeze(missing),
    knownAuthorityGaps: QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS,
  });
}

export function readExistingQuickSettings(documentSource = globalThis.document) {
  const authority = inspectExistingQuickSettingsAuthority(documentSource);
  const controls = authority.controls;
  return Object.freeze({
    musicVolume: controls.musicVolume ? quickSettingsPercent(controls.musicVolume.value) : null,
    sfxVolume: controls.sfxVolume ? quickSettingsPercent(controls.sfxVolume.value) : null,
    partnerVoiceVolume: controls.partnerVoiceVolume ? quickSettingsPercent(controls.partnerVoiceVolume.value) : null,
    musicMuted: controls.musicMute ? quickSettingsToggleOn(controls.musicMute) : null,
    sfxMuted: controls.sfxMute ? quickSettingsToggleOn(controls.sfxMute) : null,
    partnerVoiceMuted: controls.partnerVoiceMute ? quickSettingsToggleOn(controls.partnerVoiceMute) : null,
    reduceMotion: controls.reduceMotion ? quickSettingsToggleOn(controls.reduceMotion) : null,
    lowPerf: controls.lowPerf ? quickSettingsToggleOn(controls.lowPerf) : null,
    missing: authority.missing,
    knownAuthorityGaps: authority.knownAuthorityGaps,
  });
}

function dispatchExistingQuickSetting(globalSource, control, type) {
  if (!control?.dispatchEvent) return false;
  const EventCtor = globalSource?.Event;
  if (typeof EventCtor === 'function') control.dispatchEvent(new EventCtor(type, { bubbles: true }));
  else control.dispatchEvent({ type, bubbles: true, target: control });
  return true;
}

export function setExistingQuickSettingsVolume(key, value, documentSource = globalThis.document, globalSource = globalThis) {
  if (!['musicVolume', 'sfxVolume', 'partnerVoiceVolume'].includes(key)) return false;
  const control = quickSettingsControl(documentSource, key);
  if (!control) return false;
  control.value = String(quickSettingsPercent(value));
  dispatchExistingQuickSetting(globalSource, control, 'input');
  dispatchExistingQuickSetting(globalSource, control, 'change');
  return true;
}

export function toggleExistingQuickSetting(key, documentSource = globalThis.document) {
  if (!['musicMute', 'sfxMute', 'partnerVoiceMute', 'reduceMotion', 'lowPerf'].includes(key)) return false;
  const control = quickSettingsControl(documentSource, key);
  if (!control || typeof control.click !== 'function') return false;
  control.click();
  return true;
}

function isHomeSettingsTrigger(trigger) {
  if (!trigger) return false;
  const candidates = [
    trigger?.dataset?.homeTarget,
    trigger?.dataset?.go,
    trigger?.dataset?.rootGo,
    trigger?.dataset?.screen,
    trigger?.dataset?.target,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  if (candidates.includes('settings')) return true;
  const label = String(trigger?.getAttribute?.('aria-label') || trigger?.textContent || '').trim();
  return label === '設定' || label.includes('設定');
}

export function resolveQuickSettingsTrigger(target) {
  if (!target || typeof target.closest !== 'function') return null;
  const battleTrigger = target.closest('.grBattleHudSettings,[data-battle-r75-hud] [data-action="settings"]');
  if (battleTrigger) return Object.freeze({ surface: 'battle', trigger: battleTrigger });
  const home = target.closest(HOME_SELECTOR);
  if (!home) return null;
  const trigger = target.closest(`${SECONDARY_UTILITY_BUTTON_SELECTOR},[data-home-target="settings"],[data-go="settings"],[data-root-go="settings"]`);
  if (!trigger || !home.contains?.(trigger) || !isHomeSettingsTrigger(trigger)) return null;
  return Object.freeze({ surface: 'home', trigger });
}

function quickSettingsNode(documentSource, tag, className = '', label = '') {
  const value = documentSource.createElement(tag);
  if (className) value.className = className;
  if (label) value.textContent = label;
  return value;
}

function ensureQuickSettingsStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(QUICK_SETTINGS_STYLE_ID)) return;
  const style = quickSettingsNode(documentSource, 'style');
  style.id = QUICK_SETTINGS_STYLE_ID;
  style.textContent = `
[${QUICK_SETTINGS_OVERLAY_ATTR}][hidden]{display:none!important}
[${QUICK_SETTINGS_OVERLAY_ATTR}]{position:fixed;inset:0;z-index:100100;display:flex;align-items:flex-end;justify-content:flex-end;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:rgba(4,10,14,.44);backdrop-filter:blur(4px)}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsPanel{width:min(410px,100%);max-height:min(88vh,640px);overflow:auto;display:grid;gap:10px;padding:14px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:rgba(13,28,31,.97);color:#f7fbfa;box-shadow:0 20px 58px rgba(0,0,0,.42);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsHead{display:flex;align-items:center;justify-content:space-between;gap:10px}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsHead h2{margin:0;font-size:18px}
[${QUICK_SETTINGS_OVERLAY_ATTR}] button,[${QUICK_SETTINGS_OVERLAY_ATTR}] input{touch-action:manipulation}
[${QUICK_SETTINGS_OVERLAY_ATTR}] button{min-height:44px;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:800}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsClose{min-width:44px}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsRow{display:grid;grid-template-columns:minmax(62px,auto) minmax(110px,1fr) minmax(76px,auto);align-items:center;gap:8px}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsRow>span{font-weight:800}
[${QUICK_SETTINGS_OVERLAY_ATTR}] input[type="range"]{width:100%;min-height:44px}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsToggle{grid-column:2/4;width:100%}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsDetails{width:100%}
[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsStatus{margin:0;font-size:12px;opacity:.72}
[${QUICK_SETTINGS_OVERLAY_ATTR}] button:focus-visible,[${QUICK_SETTINGS_OVERLAY_ATTR}] input:focus-visible{outline:3px solid currentColor;outline-offset:2px}
@media(max-height:430px) and (orientation:landscape){[${QUICK_SETTINGS_OVERLAY_ATTR}]{align-items:stretch}[${QUICK_SETTINGS_OVERLAY_ATTR}] .grSharedQuickSettingsPanel{max-height:none;width:min(390px,52vw);gap:7px;padding:10px}}
`;
  documentSource.head.append(style);
}

function removeQuickSettingsNode(value) {
  if (!value?.parentNode) return;
  if (typeof value.remove === 'function') value.remove();
  else value.parentNode.removeChild?.(value);
}

export function closeSharedQuickSettings() {
  const overlay = quickSettingsRuntime.overlay;
  if (!overlay) return false;
  quickSettingsRuntime.overlay = null;
  removeQuickSettingsNode(overlay);
  quickSettingsRuntime.trigger?.setAttribute?.('aria-expanded', 'false');
  quickSettingsRuntime.trigger?.focus?.();
  quickSettingsRuntime.trigger = null;
  return true;
}

export function openSharedQuickSettings({ surface = 'home', trigger = null, documentSource = globalThis.document, globalSource = globalThis } = {}) {
  if (!documentSource?.body || typeof documentSource.createElement !== 'function') return false;
  closeSharedQuickSettings();
  ensureQuickSettingsStyle(documentSource);
  quickSettingsRuntime.trigger = trigger;

  const overlay = quickSettingsNode(documentSource, 'div');
  overlay.setAttribute?.(QUICK_SETTINGS_OVERLAY_ATTR, '1');
  overlay.setAttribute?.('role', 'dialog');
  overlay.setAttribute?.('aria-modal', 'true');
  overlay.dataset.surface = surface === 'battle' ? 'battle' : 'home';
  overlay.dataset.authority = 'existing-settings-controls-only';
  overlay.dataset.authorityGap = QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS.join(',');
  const panel = quickSettingsNode(documentSource, 'section', 'grSharedQuickSettingsPanel');
  const head = quickSettingsNode(documentSource, 'div', 'grSharedQuickSettingsHead');
  const title = quickSettingsNode(documentSource, 'h2', '', surface === 'battle' ? '対戦設定' : '簡易設定');
  const closeButton = quickSettingsNode(documentSource, 'button', 'grSharedQuickSettingsClose', '閉じる');
  closeButton.setAttribute?.('type', 'button');
  head.append(title, closeButton);
  panel.append(head);

  const refresh = () => {
    const current = readExistingQuickSettings(documentSource);
    for (const row of QUICK_SETTINGS_AUDIO_ROWS) {
      const range = overlay.querySelector?.(`[data-quick-volume="${row.volume}"]`);
      const mute = overlay.querySelector?.(`[data-quick-toggle="${row.mute}"]`);
      const value = current[row.volume];
      if (range) {
        range.disabled = value == null;
        if (value != null) range.value = String(value);
      }
      const muted = current[row.muted];
      if (mute) {
        mute.disabled = muted == null;
        mute.textContent = muted === true ? 'MUTE ON' : muted === false ? 'MUTE OFF' : '未接続';
        mute.setAttribute?.('aria-pressed', muted === true ? 'true' : 'false');
      }
    }
    for (const row of QUICK_SETTINGS_TOGGLE_ROWS) {
      const button = overlay.querySelector?.(`[data-quick-toggle="${row.key}"]`);
      const enabled = current[row.key];
      if (button) {
        button.disabled = enabled == null;
        button.textContent = enabled === true ? 'ON' : enabled === false ? 'OFF' : '未接続';
        button.setAttribute?.('aria-pressed', enabled === true ? 'true' : 'false');
      }
    }
    const status = overlay.querySelector?.('.grSharedQuickSettingsStatus');
    if (status) status.textContent = current.missing.length ? `未接続: ${current.missing.join(', ')}` : '';
  };

  for (const row of QUICK_SETTINGS_AUDIO_ROWS) {
    const wrap = quickSettingsNode(documentSource, 'div', 'grSharedQuickSettingsRow');
    wrap.append(quickSettingsNode(documentSource, 'span', '', row.label));
    const range = quickSettingsNode(documentSource, 'input');
    range.setAttribute?.('type', 'range');
    range.setAttribute?.('min', '0');
    range.setAttribute?.('max', '100');
    range.setAttribute?.('step', '1');
    range.setAttribute?.('aria-label', `${row.label}音量`);
    range.dataset.quickVolume = row.volume;
    range.addEventListener?.('input', () => {
      setExistingQuickSettingsVolume(row.volume, range.value, documentSource, globalSource);
      refresh();
    });
    const mute = quickSettingsNode(documentSource, 'button');
    mute.setAttribute?.('type', 'button');
    mute.setAttribute?.('aria-label', `${row.label}ミュート`);
    mute.dataset.quickToggle = row.mute;
    mute.addEventListener?.('click', () => {
      toggleExistingQuickSetting(row.mute, documentSource);
      refresh();
    });
    wrap.append(range, mute);
    panel.append(wrap);
  }

  for (const row of QUICK_SETTINGS_TOGGLE_ROWS) {
    const wrap = quickSettingsNode(documentSource, 'div', 'grSharedQuickSettingsRow');
    wrap.append(quickSettingsNode(documentSource, 'span', '', row.label));
    const button = quickSettingsNode(documentSource, 'button', 'grSharedQuickSettingsToggle');
    button.setAttribute?.('type', 'button');
    button.dataset.quickToggle = row.key;
    button.addEventListener?.('click', () => {
      toggleExistingQuickSetting(row.key, documentSource);
      refresh();
    });
    wrap.append(button);
    panel.append(wrap);
  }

  if (surface !== 'battle' && trigger) {
    const detail = quickSettingsNode(documentSource, 'button', 'grSharedQuickSettingsDetails', '詳細設定');
    detail.setAttribute?.('type', 'button');
    detail.addEventListener?.('click', () => {
      closeSharedQuickSettings();
      quickSettingsRuntime.bypassTrigger = trigger;
      trigger.click?.();
      if (quickSettingsRuntime.bypassTrigger === trigger) quickSettingsRuntime.bypassTrigger = null;
    });
    panel.append(detail);
  }

  const status = quickSettingsNode(documentSource, 'p', 'grSharedQuickSettingsStatus');
  panel.append(status);
  overlay.append(panel);
  overlay.addEventListener?.('click', (event) => { if (event?.target === overlay) closeSharedQuickSettings(); });
  closeButton.addEventListener?.('click', closeSharedQuickSettings);
  documentSource.body.append(overlay);
  quickSettingsRuntime.overlay = overlay;
  trigger?.setAttribute?.('aria-haspopup', 'dialog');
  trigger?.setAttribute?.('aria-expanded', 'true');
  refresh();
  closeButton.focus?.();
  return true;
}

function installSharedQuickSettingsCapture(documentSource = globalThis.document) {
  if (quickSettingsRuntime.installed || !documentSource?.addEventListener) return false;
  quickSettingsRuntime.installed = true;
  documentSource.addEventListener('click', (event) => {
    const match = resolveQuickSettingsTrigger(event?.target);
    if (!match) return;
    if (quickSettingsRuntime.bypassTrigger === match.trigger) {
      quickSettingsRuntime.bypassTrigger = null;
      return;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    openSharedQuickSettings({ surface: match.surface, trigger: match.trigger, documentSource, globalSource: globalThis });
  }, true);
  documentSource.addEventListener('keydown', (event) => {
    if (event?.key === 'Escape' && quickSettingsRuntime.overlay) closeSharedQuickSettings();
  });
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  installSharedQuickSettingsCapture(document);
  globalThis[QUICK_SETTINGS_GLOBAL_KEY] = Object.freeze({
    inspect: inspectExistingQuickSettingsAuthority,
    read: readExistingQuickSettings,
    setVolume: setExistingQuickSettingsVolume,
    toggle: toggleExistingQuickSetting,
    open: openSharedQuickSettings,
    close: closeSharedQuickSettings,
    knownAuthorityGaps: QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS,
  });
}
