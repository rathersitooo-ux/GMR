const SCHEMA = 'gameroad.home-shell-presentation.v1';
const VIEWPORT_VARIANTS = Object.freeze({
  WIDE_LANDSCAPE: 'wide-landscape',
  SHORT_LANDSCAPE: 'short-landscape',
  PORTRAIT: 'portrait',
});
const TOUCH_TARGET_MIN_PX = 44;
const SETUP_STAGING_STYLE_ID = 'gameroad-setup-staging-presentation-r1';
const UPDATE_BANNER_ID = 'gameroadUpdateBanner';
const UPDATE_DETAILS_TRIGGER_CLASS = 'gameroadUpdateDetailsTrigger';
const UPDATE_DETAILS_DIALOG_ID = 'gameroadUpdateDetailsDialog';
const UPDATE_DETAILS_STYLE_ID = 'gameroad-update-details-style-r1';
const RELEASE_COMMS_URL = './gameroad-release-comms.json';
const UPDATE_MESSAGE = 'アップデートがあります';
const SETUP_STAGING_CSS = `
section[data-screen="setup"] .setupHero{position:relative;padding:clamp(14px,2.2vw,24px);border-radius:22px;background:linear-gradient(145deg,color-mix(in srgb,currentColor 10%,transparent),color-mix(in srgb,currentColor 3%,transparent));box-shadow:0 16px 38px rgba(0,0,0,.18),inset 0 0 0 1px color-mix(in srgb,currentColor 18%,transparent)}
section[data-screen="setup"] .setupBox{display:grid;gap:12px;padding:clamp(12px,2vw,20px);border-radius:20px;background:color-mix(in srgb,currentColor 4%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 14%,transparent)}
section[data-screen="setup"] [data-content],
section[data-screen="setup"] [data-mode]{min-height:44px !important;padding:10px 14px !important;touch-action:manipulation;display:flex;align-items:center;justify-content:center;border-radius:14px !important;border:1px solid color-mix(in srgb,currentColor 20%,transparent) !important;background:color-mix(in srgb,currentColor 3%,transparent) !important;box-shadow:0 3px 10px rgba(0,0,0,.1);opacity:.76;filter:saturate(.82) brightness(.94);transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease,filter .16s ease,opacity .16s ease}
section[data-screen="setup"] [data-content]:hover,
section[data-screen="setup"] [data-mode]:hover{opacity:.94;filter:saturate(.96) brightness(1.01);border-color:color-mix(in srgb,currentColor 34%,transparent) !important}
section[data-screen="setup"] [data-content].on,
section[data-screen="setup"] [data-mode].on{position:relative;font-weight:850 !important;opacity:1;filter:brightness(1.12) saturate(1.08);outline:2px solid currentColor;outline-offset:-2px;background:color-mix(in srgb,currentColor 18%,transparent) !important;box-shadow:0 10px 24px rgba(0,0,0,.24),inset 0 0 0 1px color-mix(in srgb,currentColor 35%,transparent);transform:translateY(-2px) scale(1.012)}
section[data-screen="setup"] [data-content]:focus-visible,
section[data-screen="setup"] [data-mode]:focus-visible{outline:3px solid currentColor;outline-offset:3px;opacity:1;filter:none}
section[data-screen="setup"] #startMatch{position:relative;width:100%;min-height:62px !important;margin-top:clamp(10px,2vh,18px);font-size:clamp(16px,2.25vw,20px) !important;font-weight:900 !important;letter-spacing:.045em;border-width:2px !important;box-shadow:0 14px 34px rgba(0,0,0,.34),0 0 0 1px currentColor;touch-action:manipulation;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease}
section[data-screen="setup"] #startMatch:not(:disabled){filter:brightness(1.18) saturate(1.1);box-shadow:0 16px 38px rgba(0,0,0,.38),0 0 0 2px color-mix(in srgb,currentColor 72%,transparent)}
section[data-screen="setup"] #startMatch:not(:disabled):hover{filter:brightness(1.25) saturate(1.14);transform:translateY(-1px)}
section[data-screen="setup"] #startMatch:not(:disabled):active{filter:brightness(1.08) saturate(1.03);transform:translateY(1px) scale(.992);box-shadow:0 7px 18px rgba(0,0,0,.28),0 0 0 2px color-mix(in srgb,currentColor 60%,transparent)}
section[data-screen="setup"] #startMatch:disabled{opacity:.52;box-shadow:0 5px 14px rgba(0,0,0,.18)}
section[data-screen="setup"] #startMatch:focus-visible{outline:3px solid currentColor;outline-offset:4px}
@media (prefers-reduced-motion:reduce){section[data-screen="setup"] [data-content],section[data-screen="setup"] [data-mode],section[data-screen="setup"] #startMatch{transition:none}section[data-screen="setup"] [data-content].on,section[data-screen="setup"] [data-mode].on,section[data-screen="setup"] #startMatch:not(:disabled):hover,section[data-screen="setup"] #startMatch:not(:disabled):active{transform:none}}
@media (max-width:540px){section[data-screen="setup"]{overflow-y:auto;overscroll-behavior:contain}section[data-screen="setup"] .setupHero{padding:14px;border-radius:18px}section[data-screen="setup"] .setupBox{gap:10px;padding:12px;border-radius:18px}section[data-screen="setup"] [data-content],section[data-screen="setup"] [data-mode]{min-height:48px !important}section[data-screen="setup"] #startMatch{position:sticky;bottom:max(10px,env(safe-area-inset-bottom));z-index:20;min-height:64px !important;margin-top:12px}}
@media (max-height:430px) and (orientation:landscape){section[data-screen="setup"] .setupHero{padding:9px 12px}section[data-screen="setup"] .setupBox{gap:7px;padding:9px 11px}section[data-screen="setup"] [data-content],section[data-screen="setup"] [data-mode]{min-height:44px !important;padding-block:7px !important}section[data-screen="setup"] #startMatch{min-height:50px !important;margin-top:7px}}
`;
const UPDATE_DETAILS_CSS = `
.${UPDATE_DETAILS_TRIGGER_CLASS}{appearance:none;border:0;background:none;color:inherit;font:inherit;font-weight:inherit;line-height:inherit;padding:0;margin:0;text-decoration:underline;text-decoration-thickness:.08em;text-underline-offset:.18em;cursor:pointer;touch-action:manipulation}
.${UPDATE_DETAILS_TRIGGER_CLASS}:focus-visible{outline:2px solid currentColor;outline-offset:3px;border-radius:4px}
#${UPDATE_DETAILS_DIALOG_ID}[hidden]{display:none!important}
#${UPDATE_DETAILS_DIALOG_ID}{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(6,9,18,.62);backdrop-filter:blur(8px)}
#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsPanel{width:min(640px,100%);max-height:min(78vh,720px);overflow:auto;overscroll-behavior:contain;background:color-mix(in srgb,#111827 92%,transparent);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:18px;box-shadow:0 24px 72px rgba(0,0,0,.46);padding:18px 18px 20px}
#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsHead{display:flex;gap:12px;align-items:center;justify-content:space-between;position:sticky;top:-18px;margin:-18px -18px 12px;padding:18px;background:color-mix(in srgb,#111827 96%,transparent);z-index:1}
#${UPDATE_DETAILS_DIALOG_ID} h2{margin:0;font-size:clamp(18px,3vw,24px)}
#${UPDATE_DETAILS_DIALOG_ID} h3{margin:16px 0 8px;font-size:clamp(16px,2.5vw,20px)}
#${UPDATE_DETAILS_DIALOG_ID} ul{margin:0;padding-left:1.35em;display:grid;gap:8px}
#${UPDATE_DETAILS_DIALOG_ID} li{line-height:1.55}
#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsClose{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:700;cursor:pointer;touch-action:manipulation}
#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsClose:focus-visible{outline:3px solid #fff;outline-offset:2px}
#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsStatus{margin:16px 0;line-height:1.6}
@media (max-height:430px) and (orientation:landscape){#${UPDATE_DETAILS_DIALOG_ID}{align-items:stretch;padding:8px max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left))}#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsPanel{max-height:none;border-radius:14px;padding:12px 14px 14px}#${UPDATE_DETAILS_DIALOG_ID} .gameroadUpdateDetailsHead{top:-12px;margin:-12px -14px 8px;padding:12px 14px}}
`;

const updateDetailsRuntime = {
  trigger: null,
  dialog: null,
  loadPromise: null,
  releaseNotes: null,
};

function nonEmpty(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function viewport(input = {}) {
  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || width <= 0) throw new Error('viewport.width must be a finite positive number');
  if (!Number.isFinite(height) || height <= 0) throw new Error('viewport.height must be a finite positive number');
  return Object.freeze({ width, height });
}

function uniqueRouteIds(routeIds) {
  if (!Array.isArray(routeIds)) throw new Error('routeIds must be an array');
  const ids = routeIds.map((value, index) => nonEmpty(value, `routeIds[${index}]`));
  if (new Set(ids).size !== ids.length) throw new Error('routeIds must be unique');
  return Object.freeze(ids);
}

function freezeObject(value) {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeObject));
  const out = {};
  for (const [key, item] of Object.entries(value)) out[key] = freezeObject(item);
  return Object.freeze(out);
}

export function parsePublishedReleaseNotes(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (payload.schema !== 'gameroad.release-comms.v1' || payload.channel !== 'public') return null;
  const section = payload.release_notes;
  if (!section || section.state !== 'PUBLISHED' || !Array.isArray(section.items) || section.items.length < 1 || section.items.length > 20) return null;
  const seen = new Set();
  const items = [];
  for (const item of section.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const keys = Object.keys(item).sort();
    if (JSON.stringify(keys) !== JSON.stringify(['changes', 'id', 'title'])) return null;
    if (typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(item.id) || seen.has(item.id)) return null;
    if (typeof item.title !== 'string' || item.title.trim() !== item.title || item.title.length < 1 || item.title.length > 120) return null;
    if (!Array.isArray(item.changes) || item.changes.length < 1 || item.changes.length > 20) return null;
    const changes = [];
    for (const change of item.changes) {
      if (typeof change !== 'string' || change.trim() !== change || change.length < 1 || change.length > 300) return null;
      changes.push(change);
    }
    seen.add(item.id);
    items.push(Object.freeze({ id: item.id, title: item.title, changes: Object.freeze(changes) }));
  }
  return Object.freeze(items);
}

export function isUpdateBannerMessage(value) {
  return typeof value === 'string' && value.includes(UPDATE_MESSAGE);
}

function ensureSharedShellPresentation() {
  if (typeof document === 'undefined' || !document.head || document.getElementById(SETUP_STAGING_STYLE_ID)) return false;
  const style = document.createElement('style');
  style.id = SETUP_STAGING_STYLE_ID;
  style.textContent = SETUP_STAGING_CSS;
  document.head.append(style);
  return true;
}

function ensureUpdateDetailsStyle() {
  if (typeof document === 'undefined' || !document.head || document.getElementById(UPDATE_DETAILS_STYLE_ID)) return false;
  const style = document.createElement('style');
  style.id = UPDATE_DETAILS_STYLE_ID;
  style.textContent = UPDATE_DETAILS_CSS;
  document.head.append(style);
  return true;
}

function closeUpdateDetails() {
  const dialog = updateDetailsRuntime.dialog;
  if (!(dialog instanceof HTMLElement)) return;
  dialog.hidden = true;
  updateDetailsRuntime.trigger?.focus?.();
}

function ensureUpdateDetailsDialog() {
  if (typeof document === 'undefined' || !document.body) return null;
  const existing = document.getElementById(UPDATE_DETAILS_DIALOG_ID);
  if (existing instanceof HTMLElement) {
    updateDetailsRuntime.dialog = existing;
    return existing;
  }
  ensureUpdateDetailsStyle();
  const root = document.createElement('div');
  root.id = UPDATE_DETAILS_DIALOG_ID;
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${UPDATE_DETAILS_DIALOG_ID}Title`);
  const panel = document.createElement('section');
  panel.className = 'gameroadUpdateDetailsPanel';
  const head = document.createElement('div');
  head.className = 'gameroadUpdateDetailsHead';
  const title = document.createElement('h2');
  title.id = `${UPDATE_DETAILS_DIALOG_ID}Title`;
  title.textContent = 'アップデート内容';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'gameroadUpdateDetailsClose';
  close.textContent = '閉じる';
  close.addEventListener('click', closeUpdateDetails);
  head.append(title, close);
  const content = document.createElement('div');
  content.dataset.updateDetailsContent = 'true';
  panel.append(head, content);
  root.append(panel);
  root.addEventListener('click', (event) => {
    if (event.target === root) closeUpdateDetails();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeUpdateDetails();
    }
  });
  document.body.append(root);
  updateDetailsRuntime.dialog = root;
  return root;
}

function renderUpdateDetails(dialog, items) {
  const content = dialog?.querySelector?.('[data-update-details-content="true"]');
  if (!(content instanceof HTMLElement)) return;
  content.replaceChildren();
  for (const item of items) {
    const article = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = item.title;
    const list = document.createElement('ul');
    for (const change of item.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      list.append(li);
    }
    article.append(heading, list);
    content.append(article);
  }
}

function renderUpdateDetailsStatus(dialog, text) {
  const content = dialog?.querySelector?.('[data-update-details-content="true"]');
  if (!(content instanceof HTMLElement)) return;
  content.replaceChildren();
  const status = document.createElement('p');
  status.className = 'gameroadUpdateDetailsStatus';
  status.textContent = text;
  content.append(status);
}

async function loadPublishedReleaseNotes() {
  if (updateDetailsRuntime.releaseNotes) return updateDetailsRuntime.releaseNotes;
  if (updateDetailsRuntime.loadPromise) return updateDetailsRuntime.loadPromise;
  if (typeof fetch !== 'function') return null;
  updateDetailsRuntime.loadPromise = (async () => {
    try {
      const response = await fetch(RELEASE_COMMS_URL, { cache: 'no-store', credentials: 'same-origin' });
      if (!response?.ok) return null;
      const items = parsePublishedReleaseNotes(await response.json());
      if (items) updateDetailsRuntime.releaseNotes = items;
      return items;
    } catch {
      return null;
    } finally {
      updateDetailsRuntime.loadPromise = null;
    }
  })();
  return updateDetailsRuntime.loadPromise;
}

async function openUpdateDetails() {
  const dialog = ensureUpdateDetailsDialog();
  if (!(dialog instanceof HTMLElement)) return;
  dialog.hidden = false;
  renderUpdateDetailsStatus(dialog, '更新内容を読み込んでいます…');
  dialog.querySelector?.('.gameroadUpdateDetailsClose')?.focus?.();
  const items = await loadPublishedReleaseNotes();
  if (!items) {
    renderUpdateDetailsStatus(dialog, '更新内容を取得できませんでした。');
    return;
  }
  renderUpdateDetails(dialog, items);
}

function updateBannerTextNode(banner) {
  if (typeof document === 'undefined' || typeof document.createTreeWalker !== 'function' || typeof NodeFilter === 'undefined') return null;
  const walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (isUpdateBannerMessage(node.textContent || '') && parent && !parent.closest('button,a,input,select,textarea,[role="button"]')) return node;
    node = walker.nextNode();
  }
  return null;
}

export function ensureHomeUpdateDetailsConsumer() {
  if (typeof document === 'undefined') return false;
  const banner = document.getElementById(UPDATE_BANNER_ID);
  if (!(banner instanceof HTMLElement)) return false;
  const existing = banner.querySelector(`.${UPDATE_DETAILS_TRIGGER_CLASS}`);
  if (existing instanceof HTMLButtonElement) {
    updateDetailsRuntime.trigger = existing;
    return true;
  }
  const textNode = updateBannerTextNode(banner);
  if (!textNode?.parentNode) return false;
  ensureUpdateDetailsStyle();
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = UPDATE_DETAILS_TRIGGER_CLASS;
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', UPDATE_DETAILS_DIALOG_ID);
  trigger.title = 'アップデート内容を表示';
  textNode.parentNode.insertBefore(trigger, textNode);
  trigger.append(textNode);
  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openUpdateDetails();
  });
  updateDetailsRuntime.trigger = trigger;
  return true;
}

export function classifyHomeViewport(input = {}) {
  const { width, height } = viewport(input);
  if (height > width) return VIEWPORT_VARIANTS.PORTRAIT;
  if (height < 480) return VIEWPORT_VARIANTS.SHORT_LANDSCAPE;
  return VIEWPORT_VARIANTS.WIDE_LANDSCAPE;
}

export function createHomeShellState({ expanded = true, selectedRouteId = null, routeIds = [] } = {}) {
  ensureSharedShellPresentation();
  ensureHomeUpdateDetailsConsumer();
  const ids = uniqueRouteIds(routeIds);
  const selected = selectedRouteId == null ? null : nonEmpty(selectedRouteId, 'selectedRouteId');
  if (selected !== null && !ids.includes(selected)) throw new Error('selectedRouteId must exist in routeIds');
  return Object.freeze({
    schema: SCHEMA,
    route: 'Home',
    expanded: Boolean(expanded),
    selectedRouteId: selected,
    routeIds: ids,
  });
}

function regionMap(variant, expanded) {
  if (variant === VIEWPORT_VARIANTS.PORTRAIT) {
    return freezeObject({
      hero: { x: 0, y: 0, width: 1, height: expanded ? 0.57 : 0.62 },
      navigation: { x: 0, y: expanded ? 0.57 : 0.62, width: 1, height: expanded ? 0.43 : 0.38 },
    });
  }
  if (variant === VIEWPORT_VARIANTS.SHORT_LANDSCAPE) {
    return freezeObject({
      navigation: { x: 0, y: 0, width: expanded ? 0.42 : 0.38, height: 1 },
      hero: { x: expanded ? 0.42 : 0.38, y: 0, width: expanded ? 0.58 : 0.62, height: 1 },
    });
  }
  return freezeObject({
    navigation: { x: 0, y: 0, width: expanded ? 0.34 : 0.30, height: 1 },
    hero: { x: expanded ? 0.34 : 0.30, y: 0, width: expanded ? 0.66 : 0.70, height: 1 },
  });
}

function presentationProfile({ reducedMotion, lowPerf }) {
  if (lowPerf) return 'lowperf-static';
  if (reducedMotion) return 'reduced';
  return 'full';
}

function validateHomeProjection(projection) {
  if (!projection || typeof projection !== 'object') throw new Error('homeProjection is required');
  nonEmpty(projection.projectionKey, 'homeProjection.projectionKey');
  if (projection.orientation !== 'landscape' && projection.orientation !== 'portrait') {
    throw new Error('homeProjection.orientation must be landscape or portrait');
  }
  return projection;
}

export function projectHomeShell({
  viewport: viewportInput,
  homeProjection,
  state,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const v = viewport(viewportInput);
  const projection = validateHomeProjection(homeProjection);
  if (!state || state.schema !== SCHEMA || state.route !== 'Home') throw new Error('valid Home shell state is required');
  const variant = classifyHomeViewport(v);
  const expectedOrientation = variant === VIEWPORT_VARIANTS.PORTRAIT ? 'portrait' : 'landscape';
  if (projection.orientation !== expectedOrientation) throw new Error('homeProjection.orientation does not match viewport');

  return Object.freeze({
    schema: SCHEMA,
    route: 'Home',
    viewport: v,
    viewportVariant: variant,
    orientation: expectedOrientation,
    expanded: state.expanded,
    selectedRouteId: state.selectedRouteId,
    routeIds: state.routeIds,
    touchTargetMinPx: TOUCH_TARGET_MIN_PX,
    presentationProfile: presentationProfile({ reducedMotion: Boolean(reducedMotion), lowPerf: Boolean(lowPerf) }),
    regions: regionMap(variant, state.expanded),
    scene: freezeObject({
      projectionKey: projection.projectionKey,
      sceneAsset: projection.sceneAsset ?? null,
      focalAnchor: projection.focalAnchor ?? null,
      safeComposition: projection.safeComposition ?? {},
      bleed: projection.bleed ?? {},
      compositionStatus: projection.compositionStatus ?? 'ready',
      needsPortraitComposition: Boolean(projection.needsPortraitComposition),
      fallbackSceneAsset: projection.fallbackSceneAsset ?? null,
      fallbackPolicy: projection.fallbackPolicy ?? 'none',
    }),
    liveSlots: Object.freeze(['routeIds', 'selectedRouteId']),
  });
}

export const HOME_SHELL_PRESENTATION_SCHEMA = SCHEMA;
export const HOME_VIEWPORT_VARIANTS = VIEWPORT_VARIANTS;
export const HOME_TOUCH_TARGET_MIN_PX = TOUCH_TARGET_MIN_PX;
export const HOME_UPDATE_DETAILS_MANIFEST_URL = RELEASE_COMMS_URL;
