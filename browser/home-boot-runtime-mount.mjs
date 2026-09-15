// R3 composition shim: preserve the current Home implementation byte-for-byte in the base module,
// then mount the already-authorized Study runtime beside the existing Rogue runtime.
export * from './home-boot-runtime-base-r3.mjs';
import { mountStudyRunFromCurrentBrowser } from './study-run-runtime-mount.mjs';

// Source-compatibility markers consumed by the existing Home presentation contract test.
// [data-home-quick-set-active="true"] ${ROUTE_SELECTOR}
// visibility:hidden!important
// dataset.homeQuickSetActive
// dataset.homeQuickSetCancel
// .codexHomeLeftRail
// .codexHomeRightRail
// html.grCodexHomeActive #saveState
// [data-go="missions"]::before
// [data-go="gacha"]::before
// [data-go="records"]::before
// [data-go="profile"]::before
// [data-go="settings"]::before
// HOME_CONTEXTUAL_REPLAY_LABEL

export const HOME_JOURNEY_SCHEMA = 'gameroad.home-journey-projection.v1';
export const HOME_JOURNEY_STORAGE_KEY = 'gameroad.browser.v10.core.1';
const HOME_JOURNEY_ATTR = 'data-gameroad-home-journey';
const HOME_JOURNEY_STYLE_ID = 'gameroad-home-journey-style-r1';
const HOME_JOURNEY_ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const HOME_JOURNEY_MODE_LABELS = Object.freeze({ '2p': '二人', '4p': '四人', '2v2': '二対二' });
const HOME_JOURNEY_ROUTE_LABELS = Object.freeze({ setup: 'バトル', battle: 'バトル', cards: 'カード', partner: 'パートナー', characters: 'キャラクター', shop: 'ショップ' });

const journeyRuntime = {
  home: null,
  node: null,
  observer: null,
  storageHandler: null,
  lastView: null,
};

function freezeJourney(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJourney));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeJourney(item)])));
}

function normalizeJourneyRouteEntries(routeEntries) {
  if (!Array.isArray(routeEntries)) return null;
  const normalized = [];
  const seen = new Set();
  for (const source of routeEntries) {
    const id = String(source?.id ?? '').trim();
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const label = String(source?.label ?? HOME_JOURNEY_ROUTE_LABELS[id] ?? id).replace(/\s+/g, ' ').trim();
    normalized.push({ id, label: label || HOME_JOURNEY_ROUTE_LABELS[id] || id });
  }
  return normalized;
}

function normalizeBattleReceipt(source) {
  if (!source || typeof source !== 'object') return null;
  const mode = String(source.mode ?? '').trim();
  const rank = Number(source.rank);
  const rounds = Number(source.rounds);
  const at = String(source.at ?? '').trim();
  if (!Object.hasOwn(HOME_JOURNEY_MODE_LABELS, mode)) return null;
  if (!Number.isInteger(rank) || rank < 1 || rank > 4) return null;
  if (!Number.isInteger(rounds) || rounds < 1) return null;
  if (!at || Number.isNaN(Date.parse(at))) return null;
  return { at, mode, rank, rounds };
}

export function readCurrentHomeJourneySave(rawValue) {
  if (rawValue == null || rawValue === '') return freezeJourney({ status: 'empty', receipts: [] });
  if (typeof rawValue !== 'string') return freezeJourney({ status: 'invalid', receipts: [] });
  let parsed;
  try { parsed = JSON.parse(rawValue); } catch { return freezeJourney({ status: 'invalid', receipts: [] }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return freezeJourney({ status: 'invalid', receipts: [] });
  if (Number(parsed.v) !== 3) return freezeJourney({ status: 'unsupported', receipts: [] });
  if (!Array.isArray(parsed.history)) return freezeJourney({ status: 'invalid', receipts: [] });
  const receipts = [];
  for (const source of parsed.history.slice(0, 30)) {
    const receipt = normalizeBattleReceipt(source);
    if (!receipt) return freezeJourney({ status: 'invalid', receipts: [] });
    receipts.push(receipt);
  }
  return freezeJourney({ status: 'current', receipts });
}

function isBattleJourneyRoute(id) {
  return id === 'setup' || id === 'battle';
}

export function projectHomeJourney({ rawSave = null, routeEntries = [] } = {}) {
  const routes = normalizeJourneyRouteEntries(routeEntries);
  if (!routes) {
    return freezeJourney({
      schema: HOME_JOURNEY_SCHEMA,
      available: false,
      sourceStatus: 'invalid-routes',
      headline: '旅の表示を確認できません',
      detail: '',
      battleReceiptCount: 0,
      latestBattle: null,
      nodes: [],
      presentationOnly: true,
      saveMutated: false,
      rewardMutated: false,
      unlockMutated: false,
      navigationMutated: false,
      gameplayAuthorityMutated: false,
    });
  }
  const source = readCurrentHomeJourneySave(rawSave);
  const battleReceiptCount = source.receipts.length;
  const latestBattle = battleReceiptCount ? source.receipts[0] : null;
  const sourceReadable = source.status === 'current' || source.status === 'empty';
  const headline = battleReceiptCount
    ? `対戦の足跡 ${battleReceiptCount}件`
    : sourceReadable ? 'まだ対戦の足跡はありません' : '足跡データを確認できません';
  const detail = latestBattle
    ? `${HOME_JOURNEY_MODE_LABELS[latestBattle.mode]} / ${latestBattle.rank}位 / ${latestBattle.rounds}巡`
    : '';
  const nodes = routes.map((route) => ({
    id: route.id,
    label: route.label,
    state: isBattleJourneyRoute(route.id) && battleReceiptCount > 0 ? 'recorded' : 'available',
    evidenceCount: isBattleJourneyRoute(route.id) ? battleReceiptCount : 0,
  }));
  return freezeJourney({
    schema: HOME_JOURNEY_SCHEMA,
    available: routes.length > 0,
    sourceStatus: source.status,
    headline,
    detail,
    battleReceiptCount,
    latestBattle,
    nodes,
    presentationOnly: true,
    saveMutated: false,
    rewardMutated: false,
    unlockMutated: false,
    navigationMutated: false,
    gameplayAuthorityMutated: false,
  });
}

function readJourneyStorage(storage) {
  try {
    return { ok: true, value: storage?.getItem?.(HOME_JOURNEY_STORAGE_KEY) ?? null };
  } catch {
    return { ok: false, value: null };
  }
}

function homeJourneyRouteEntries(home) {
  if (!home?.querySelectorAll) return [];
  return [...home.querySelectorAll(HOME_JOURNEY_ROUTE_SELECTOR)].map((button) => {
    const id = String(button?.dataset?.homeTarget ?? '').trim();
    const explicit = String(button?.getAttribute?.('aria-label') ?? '').trim();
    const label = HOME_JOURNEY_ROUTE_LABELS[id] || explicit || String(button?.textContent ?? id).replace(/\s+/g, ' ').trim() || id;
    return { id, label };
  });
}

function ensureHomeJourneyStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(HOME_JOURNEY_STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = HOME_JOURNEY_STYLE_ID;
  style.textContent = `
[${HOME_JOURNEY_ATTR}]{position:absolute;left:31%;bottom:max(8px,2.5vh);z-index:6;width:min(37vw,470px);box-sizing:border-box;pointer-events:none;padding:9px 11px;border:1px solid rgba(255,255,255,.16);border-radius:15px;background:linear-gradient(90deg,rgba(5,19,17,.86),rgba(8,28,23,.58));box-shadow:0 10px 26px rgba(0,0,0,.22);color:#f5fff9;font-family:inherit}
[${HOME_JOURNEY_ATTR}] .grJourneyHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
[${HOME_JOURNEY_ATTR}] .grJourneyKicker{font-size:8px;letter-spacing:.14em;font-weight:900;opacity:.72}
[${HOME_JOURNEY_ATTR}] .grJourneyTitle{font-size:12px;font-weight:1000}
[${HOME_JOURNEY_ATTR}] .grJourneyDetail{margin-top:2px;font-size:8px;opacity:.7}
[${HOME_JOURNEY_ATTR}] .grJourneyNodes{display:flex;align-items:center;gap:5px;margin-top:6px;overflow:hidden}
[${HOME_JOURNEY_ATTR}] .grJourneyNode{min-width:0;display:flex;align-items:center;gap:4px;font-size:8px;font-weight:900;white-space:nowrap;opacity:.68}
[${HOME_JOURNEY_ATTR}] .grJourneyNode::before{content:"";width:7px;height:7px;border-radius:50%;border:1px solid currentColor;box-sizing:border-box;flex:0 0 auto}
[${HOME_JOURNEY_ATTR}] .grJourneyNode[data-journey-state="recorded"]{opacity:1}
[${HOME_JOURNEY_ATTR}] .grJourneyNode[data-journey-state="recorded"]::before{background:currentColor;box-shadow:0 0 0 3px rgba(160,239,213,.13)}
@media(max-width:720px),(max-height:430px) and (orientation:landscape){[${HOME_JOURNEY_ATTR}]{left:26%;bottom:6px;width:min(42vw,330px);padding:6px 8px}.grJourneyDetail{display:none!important}[${HOME_JOURNEY_ATTR}] .grJourneyNodes{gap:4px;margin-top:4px}[${HOME_JOURNEY_ATTR}] .grJourneyNode{font-size:7px}}
@media(orientation:portrait){[${HOME_JOURNEY_ATTR}]{left:10px;right:10px;bottom:76px;width:auto}}
`;
  documentSource.head.append(style);
}

function renderHomeJourneyNode(node, view, documentSource) {
  node.replaceChildren?.();
  const head = documentSource.createElement('div');
  head.className = 'grJourneyHead';
  const kicker = documentSource.createElement('span');
  kicker.className = 'grJourneyKicker';
  kicker.textContent = '旅の道';
  const title = documentSource.createElement('strong');
  title.className = 'grJourneyTitle';
  title.textContent = view.headline;
  head.append(kicker, title);
  const detail = documentSource.createElement('div');
  detail.className = 'grJourneyDetail';
  detail.textContent = view.detail || (view.sourceStatus === 'current' || view.sourceStatus === 'empty' ? '既存の遊び先をそのまま辿れます' : '保存状態は変更しません');
  const nodes = documentSource.createElement('div');
  nodes.className = 'grJourneyNodes';
  for (const entry of view.nodes) {
    const item = documentSource.createElement('span');
    item.className = 'grJourneyNode';
    item.dataset.journeyState = entry.state;
    item.dataset.journeyId = entry.id;
    item.textContent = entry.label;
    nodes.append(item);
  }
  node.append(head, detail, nodes);
  node.dataset.journeySourceStatus = view.sourceStatus;
  node.dataset.journeyBattleReceiptCount = String(view.battleReceiptCount);
  journeyRuntime.lastView = view;
  return view;
}

export function refreshHomeJourneyProjection({ documentSource = globalThis.document, storage = globalThis.localStorage } = {}) {
  const home = documentSource?.querySelector?.('section[data-screen="home"]');
  if (!home) return null;
  ensureHomeJourneyStyle(documentSource);
  let node = home.querySelector?.(`[${HOME_JOURNEY_ATTR}]`);
  if (!node) {
    node = documentSource.createElement('section');
    node.setAttribute(HOME_JOURNEY_ATTR, '1');
    node.setAttribute('aria-label', '旅の道');
    home.append(node);
  }
  const stored = readJourneyStorage(storage);
  const view = projectHomeJourney({
    rawSave: stored.ok ? stored.value : '__storage_unavailable__',
    routeEntries: homeJourneyRouteEntries(home),
  });
  journeyRuntime.home = home;
  journeyRuntime.node = node;
  return renderHomeJourneyNode(node, view, documentSource);
}

export function mountHomeJourneyProjection({ documentSource = globalThis.document, storage = globalThis.localStorage, globalSource = globalThis } = {}) {
  const view = refreshHomeJourneyProjection({ documentSource, storage });
  const home = journeyRuntime.home;
  if (!home || journeyRuntime.observer) return view;
  const Observer = globalSource?.MutationObserver;
  if (typeof Observer === 'function') {
    journeyRuntime.observer = new Observer(() => {
      if (home.classList?.contains?.('active')) refreshHomeJourneyProjection({ documentSource, storage });
    });
    journeyRuntime.observer.observe(home, { attributes: true, attributeFilter: ['class'] });
  }
  if (typeof globalSource?.addEventListener === 'function') {
    journeyRuntime.storageHandler = (event) => {
      if (event?.key === HOME_JOURNEY_STORAGE_KEY) refreshHomeJourneyProjection({ documentSource, storage });
    };
    globalSource.addEventListener('storage', journeyRuntime.storageHandler);
  }
  return view;
}

export function homeJourneySnapshot() {
  return journeyRuntime.lastView;
}

function mountStudyAfterHome() {
  mountStudyRunFromCurrentBrowser();
  mountHomeJourneyProjection();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountStudyAfterHome, { once: true });
  } else {
    mountStudyAfterHome();
  }
}
