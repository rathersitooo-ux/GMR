import {
  DAILY_TOUR_MODES,
  advanceDailyTour,
  createDailyTourPlan,
  getNextDailyTourStop,
  summarizeDailyTour,
} from './daily-tour-core.mjs';
import {
  answerBrainTrainingItem,
  createBrainTrainingSession,
  getNextBrainTrainingItem,
  skipBrainTrainingItem,
  summarizeBrainTrainingSession,
} from './brain-training-core.mjs';
import { getBrainTrainingExerciseBank } from './brain-training-exercise-bank.mjs';

const GLOBAL_KEY = 'GAMEROAD_DAILY_TOUR_RUNTIME';
const HOME_SELECTOR = 'section[data-screen="home"]';
const ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const LAUNCHER_ID = 'gameroad-daily-tour-launcher';
const OVERLAY_ID = 'gameroad-daily-tour-overlay';
const STYLE_ID = 'gameroad-daily-tour-runtime-style';

const runtime = {
  mounted: false,
  registry: null,
  registryStatus: 'idle',
  plan: null,
  brainSession: null,
  externalPendingId: null,
  overlay: null,
  observer: null,
  lastError: null,
};

function normalizeRegistryEntries(registry) {
  return Array.isArray(registry?.entries) ? registry.entries : [];
}

export function deriveDailyTourAvailability(registry, routeIds = []) {
  const routes = new Set(Array.isArray(routeIds) ? routeIds.filter(Boolean) : []);
  return Object.freeze(normalizeRegistryEntries(registry)
    .filter((entry) => entry?.class === 'TOUR_ELIGIBLE' && entry?.tourPolicy?.canAppearInPlan === true)
    .map((entry) => {
      const id = String(entry.modeId || '').trim();
      if (!id) return null;
      const finale = entry?.tourPolicy?.finaleRole === 'OPTIONAL_FINALE';
      const supported = id === 'brain_training' || finale || routes.has(id);
      return Object.freeze({ id, supported, finale, runtimeState: entry.runtimeState || 'UNKNOWN' });
    })
    .filter(Boolean));
}

export function createDailyTourPlanFromSelection({ dayKey, registry, routeIds = [], selectedIds = [], includeBattle = false } = {}) {
  const available = deriveDailyTourAvailability(registry, routeIds);
  const selected = new Set(Array.isArray(selectedIds) ? selectedIds : []);
  const regular = available.filter((entry) => entry.supported && !entry.finale && selected.has(entry.id));
  const battle = available.find((entry) => entry.id === 'battle' && entry.finale && entry.supported);
  if (regular.length === 0 && !(includeBattle && battle)) return null;
  if (regular.length === 0 && includeBattle && battle) {
    return createDailyTourPlan({ dayKey, mode: DAILY_TOUR_MODES.BATTLE_ONLY, stops: [], includeBattleFinale: true });
  }
  return createDailyTourPlan({
    dayKey,
    mode: DAILY_TOUR_MODES.CUSTOM,
    stops: regular.map((entry) => ({ id: entry.id, registered: true, eligible: true })),
    registeredStopIds: regular.map((entry) => entry.id),
    customOrder: regular.map((entry) => entry.id),
    includeBattleFinale: Boolean(includeBattle && battle),
  });
}

function homeRouteIds() {
  const home = document.querySelector(HOME_SELECTOR);
  if (!(home instanceof HTMLElement)) return [];
  return [...home.querySelectorAll(ROUTE_SELECTOR)]
    .map((node) => String(node?.dataset?.homeTarget || '').trim())
    .filter(Boolean);
}

function currentDayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadRegistry() {
  if (runtime.registry) return runtime.registry;
  runtime.registryStatus = 'loading';
  const candidates = [
    new URL('./daily-tour-mode-registry.v1.json', import.meta.url),
    new URL('../data/daily-tour-mode-registry.v1.json', import.meta.url),
  ];
  let lastError = null;
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
      const registry = await response.json();
      if (registry?.schemaVersion !== 'gameroad-daily-tour-mode-registry-v1') {
        throw new Error('registry schema mismatch');
      }
      runtime.registry = registry;
      runtime.registryStatus = 'ready';
      runtime.lastError = null;
      return registry;
    } catch (error) {
      lastError = error;
    }
  }
  runtime.registryStatus = 'error';
  runtime.lastError = String(lastError?.message || lastError || 'REGISTRY_UNAVAILABLE');
  throw lastError || new Error('REGISTRY_UNAVAILABLE');
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${LAUNCHER_ID}{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:24;min-width:52px;min-height:44px;padding:8px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.34);background:rgba(18,22,30,.72);color:#fff;font:700 13px/1.1 system-ui,sans-serif;backdrop-filter:blur(8px);touch-action:manipulation}
#${OVERLAY_ID}{position:fixed;inset:0;z-index:2400;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(0,0,0,.46)}
#${OVERLAY_ID}[hidden]{display:none}
#${OVERLAY_ID} .dt-card{width:min(520px,100%);max-height:min(720px,88vh);overflow:auto;border-radius:22px;background:#151922;color:#fff;padding:18px;box-shadow:0 20px 70px rgba(0,0,0,.45);font:500 14px/1.5 system-ui,sans-serif}
#${OVERLAY_ID} h2{margin:0 0 12px;font-size:20px}#${OVERLAY_ID} p{margin:8px 0;color:rgba(255,255,255,.78)}#${OVERLAY_ID} .dt-list{display:grid;gap:8px;margin:12px 0}#${OVERLAY_ID} label{display:flex;gap:10px;align-items:center;min-height:42px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.07)}#${OVERLAY_ID} button{min-height:44px;padding:9px 13px;border:0;border-radius:12px;font:700 14px system-ui,sans-serif;touch-action:manipulation}#${OVERLAY_ID} .dt-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}#${OVERLAY_ID} .dt-primary{background:#fff;color:#111827}#${OVERLAY_ID} .dt-secondary{background:rgba(255,255,255,.1);color:#fff}#${OVERLAY_ID} .dt-options{display:grid;gap:8px;margin-top:12px}#${OVERLAY_ID} .dt-options button{text-align:left;background:rgba(255,255,255,.09);color:#fff}
@media(prefers-reduced-motion:reduce){#${OVERLAY_ID},#${LAUNCHER_ID}{scroll-behavior:auto}}
`;
  document.head.append(style);
}

function isHomeActive(home) {
  if (!(home instanceof HTMLElement) || home.hasAttribute('hidden')) return false;
  if (home.classList.contains('active')) return true;
  const style = getComputedStyle(home);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function syncLauncher() {
  const home = document.querySelector(HOME_SELECTOR);
  const existing = document.getElementById(LAUNCHER_ID);
  if (!(home instanceof HTMLElement)) {
    existing?.remove();
    return;
  }
  if (!existing) {
    const button = document.createElement('button');
    button.id = LAUNCHER_ID;
    button.type = 'button';
    button.textContent = 'Daily';
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', () => openDailyTour());
    home.append(button);
  }
  const launcher = document.getElementById(LAUNCHER_ID);
  if (launcher instanceof HTMLElement) launcher.hidden = !isHomeActive(home);
}

function ensureOverlay() {
  if (runtime.overlay?.isConnected) return runtime.overlay;
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.hidden = true;
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = '<div class="dt-card" role="dialog" aria-modal="true" aria-label="Daily Tour"></div>';
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) closeDailyTour();
  });
  document.body.append(overlay);
  runtime.overlay = overlay;
  return overlay;
}

function cardNode() {
  return ensureOverlay().querySelector('.dt-card');
}

function button(label, className, onClick) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.className = className;
  node.addEventListener('click', onClick);
  return node;
}

function renderSetup(card) {
  const available = deriveDailyTourAvailability(runtime.registry, homeRouteIds()).filter((entry) => entry.supported);
  const regular = available.filter((entry) => !entry.finale);
  const battle = available.find((entry) => entry.id === 'battle' && entry.finale);
  card.innerHTML = '<h2>Daily Tour</h2><p>遊びたいものだけ選択。スキップしても負債にはなりません。</p>';
  const list = document.createElement('div');
  list.className = 'dt-list';
  for (const entry of regular) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'daily-stop';
    input.value = entry.id;
    const text = document.createElement('span');
    text.textContent = entry.id === 'brain_training' ? 'Brain Training' : entry.id;
    label.append(input, text);
    list.append(label);
  }
  if (battle) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'daily-battle';
    input.value = 'battle';
    const text = document.createElement('span');
    text.textContent = 'Battle（最後に任意）';
    label.append(input, text);
    list.append(label);
  }
  card.append(list);
  const status = document.createElement('p');
  status.dataset.dailyStatus = 'selection';
  card.append(status);
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  actions.append(button('スタート', 'dt-primary', () => {
    const selectedIds = [...card.querySelectorAll('input[name="daily-stop"]:checked')].map((node) => node.value);
    const includeBattle = Boolean(card.querySelector('input[name="daily-battle"]:checked'));
    const plan = createDailyTourPlanFromSelection({
      dayKey: currentDayKey(),
      registry: runtime.registry,
      routeIds: homeRouteIds(),
      selectedIds,
      includeBattle,
    });
    if (!plan) {
      status.textContent = '1つ以上選んでください。';
      return;
    }
    runtime.plan = plan;
    runtime.brainSession = null;
    runtime.externalPendingId = null;
    render();
  }));
  actions.append(button('閉じる', 'dt-secondary', closeDailyTour));
  card.append(actions);
}

function finishBrainIfSettled() {
  const summary = summarizeBrainTrainingSession(runtime.brainSession);
  if (summary.pending > 0) return false;
  runtime.plan = advanceDailyTour(runtime.plan, {
    type: summary.meaningfulParticipation ? 'complete_stop' : 'skip_stop',
    stopId: 'brain_training',
  });
  runtime.brainSession = null;
  return true;
}

function renderBrain(card) {
  if (!runtime.brainSession) {
    runtime.brainSession = createBrainTrainingSession({
      sessionKey: `daily_brain_${currentDayKey()}`,
      exercises: getBrainTrainingExerciseBank(),
    });
  }
  if (finishBrainIfSettled()) {
    render();
    return;
  }
  const item = getNextBrainTrainingItem(runtime.brainSession);
  const summary = summarizeBrainTrainingSession(runtime.brainSession);
  card.innerHTML = `<h2>Brain Training</h2><p>${summary.attempted + summary.skipped + 1} / ${summary.itemCount}</p><p></p>`;
  card.lastElementChild.textContent = item.prompt;
  const options = document.createElement('div');
  options.className = 'dt-options';
  for (const option of item.options) {
    options.append(button(option.label, '', () => {
      runtime.brainSession = answerBrainTrainingItem(runtime.brainSession, getBrainTrainingExerciseBank(), {
        itemId: item.exerciseId,
        optionId: option.id,
      });
      render();
    }));
  }
  card.append(options);
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  actions.append(button('この問題をスキップ', 'dt-secondary', () => {
    runtime.brainSession = skipBrainTrainingItem(runtime.brainSession, { itemId: item.exerciseId });
    render();
  }));
  actions.append(button('閉じる', 'dt-secondary', closeDailyTour));
  card.append(actions);
}

function launchExternalStop(stopId) {
  const home = document.querySelector(HOME_SELECTOR);
  const target = home?.querySelector(`${ROUTE_SELECTOR}[data-home-target="${CSS.escape(stopId)}"]`);
  if (!(target instanceof HTMLElement)) {
    runtime.lastError = `ROUTE_UNAVAILABLE:${stopId}`;
    render();
    return;
  }
  runtime.externalPendingId = stopId;
  runtime.plan = advanceDailyTour(runtime.plan, { type: 'interrupt' });
  closeDailyTour();
  target.click();
}

function settleExternal(type) {
  const stopId = runtime.externalPendingId;
  if (!stopId) return;
  runtime.plan = advanceDailyTour(runtime.plan, { type: 'resume' });
  runtime.plan = advanceDailyTour(runtime.plan, { type, stopId });
  runtime.externalPendingId = null;
  render();
}

function renderInterrupted(card) {
  card.innerHTML = `<h2>Daily Tour</h2><p>${runtime.externalPendingId || '外部モード'} から戻りました。</p><p>Tour側では外部モードの完了を推測しません。</p>`;
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  actions.append(button('完了として続ける', 'dt-primary', () => settleExternal('complete_stop')));
  actions.append(button('スキップして続ける', 'dt-secondary', () => settleExternal('skip_stop')));
  actions.append(button('閉じる', 'dt-secondary', closeDailyTour));
  card.append(actions);
}

function renderBattle(card) {
  card.innerHTML = '<h2>Battle</h2><p>Battleは任意の最後の1件です。Tourから対戦種別や報酬値は決めません。</p>';
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  const home = document.querySelector(HOME_SELECTOR);
  const exact = home?.querySelector(`${ROUTE_SELECTOR}[data-home-target="battle"]`);
  if (exact instanceof HTMLElement) {
    actions.append(button('Battleへ移動', 'dt-primary', () => {
      runtime.externalPendingId = 'battle';
      runtime.plan = advanceDailyTour(runtime.plan, { type: 'interrupt' });
      closeDailyTour();
      exact.click();
    }));
  }
  actions.append(button('完了として続ける', 'dt-secondary', () => {
    runtime.plan = advanceDailyTour(runtime.plan, { type: 'complete_battle' });
    render();
  }));
  actions.append(button('今回はスキップ', 'dt-secondary', () => {
    runtime.plan = advanceDailyTour(runtime.plan, { type: 'skip_battle' });
    render();
  }));
  card.append(actions);
}

function renderSummary(card) {
  const summary = summarizeDailyTour(runtime.plan);
  card.innerHTML = `<h2>Daily Tour</h2><p>完了 ${summary.completedStopCount} / スキップ ${summary.skippedStopCount}</p><p>スキップ負債: なし</p>`;
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  actions.append(button('もう一度選ぶ', 'dt-primary', () => {
    runtime.plan = null;
    runtime.brainSession = null;
    runtime.externalPendingId = null;
    render();
  }));
  actions.append(button('閉じる', 'dt-secondary', closeDailyTour));
  card.append(actions);
}

function render() {
  const card = cardNode();
  if (!(card instanceof HTMLElement)) return;
  if (!runtime.plan) {
    renderSetup(card);
    return;
  }
  if (runtime.plan.interrupted) {
    if (runtime.externalPendingId === 'battle') {
      runtime.plan = advanceDailyTour(runtime.plan, { type: 'resume' });
      runtime.externalPendingId = null;
      renderBattle(card);
      return;
    }
    renderInterrupted(card);
    return;
  }
  const next = getNextDailyTourStop(runtime.plan);
  if (!next) {
    renderSummary(card);
    return;
  }
  if (next.type === 'battle_finale') {
    renderBattle(card);
    return;
  }
  if (next.id === 'brain_training') {
    renderBrain(card);
    return;
  }
  card.innerHTML = `<h2>Daily Tour</h2><p>次: ${next.id}</p>`;
  const actions = document.createElement('div');
  actions.className = 'dt-actions';
  actions.append(button('移動', 'dt-primary', () => launchExternalStop(next.id)));
  actions.append(button('スキップ', 'dt-secondary', () => {
    runtime.plan = advanceDailyTour(runtime.plan, { type: 'skip_stop', stopId: next.id });
    render();
  }));
  actions.append(button('閉じる', 'dt-secondary', closeDailyTour));
  card.append(actions);
}

export async function openDailyTour() {
  const overlay = ensureOverlay();
  overlay.hidden = false;
  try {
    await loadRegistry();
    render();
  } catch {
    const card = cardNode();
    if (card) card.innerHTML = '<h2>Daily Tour</h2><p>現在のモード一覧を読み込めませんでした。</p>';
  }
  return snapshot();
}

export function closeDailyTour() {
  if (runtime.overlay) runtime.overlay.hidden = true;
  return snapshot();
}

export function mountDailyTourRuntime() {
  if (runtime.mounted) return snapshot();
  ensureStyle();
  ensureOverlay();
  syncLauncher();
  runtime.observer = new MutationObserver(() => syncLauncher());
  runtime.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'data-home-target'] });
  runtime.mounted = true;
  return snapshot();
}

export function snapshot() {
  return Object.freeze({
    mounted: runtime.mounted,
    registryStatus: runtime.registryStatus,
    plan: runtime.plan,
    summary: runtime.plan ? summarizeDailyTour(runtime.plan) : null,
    brainSummary: runtime.brainSession ? summarizeBrainTrainingSession(runtime.brainSession) : null,
    externalPendingId: runtime.externalPendingId,
    open: Boolean(runtime.overlay && !runtime.overlay.hidden),
    lastError: runtime.lastError,
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  globalThis[GLOBAL_KEY] = Object.freeze({ open: openDailyTour, close: closeDailyTour, snapshot });
  const mount = () => mountDailyTourRuntime();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
