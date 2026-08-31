import {
  DAILY_TOUR_MODES,
  advanceDailyTour,
  createDailyTourPlan,
  getNextDailyTourStop,
  summarizeDailyTour,
} from './daily-tour-core.mjs';

const STYLE_ID = 'gameroad-daily-tour-home-style';
const HOST_ATTR = 'data-daily-tour-home';
const REGISTRY_URL = '/data/daily-tour-mode-registry.v1.json';
const ROUTE_ALIASES = Object.freeze({
  partner_tea: Object.freeze(['characters', 'partner']),
  battle: Object.freeze(['setup']),
});

const state = {
  host: null,
  open: false,
  registry: null,
  registryPromise: null,
  available: [],
  selectedIds: [],
  routeByMode: new Map(),
  plan: null,
  message: '',
  signature: '',
};

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${HOST_ATTR}="1"]{
  position:fixed;
  right:max(12px,env(safe-area-inset-right));
  bottom:max(12px,env(safe-area-inset-bottom));
  z-index:72;
  width:min(320px,calc(100vw - 24px));
  pointer-events:none;
  font:inherit;
}
[${HOST_ATTR}="1"][hidden]{display:none!important}
[${HOST_ATTR}="1"] button{font:inherit;touch-action:manipulation}
.grDailyTourLauncher{
  pointer-events:auto;
  float:right;
  min-width:48px;
  min-height:48px;
  border:1px solid rgba(255,255,255,.3);
  border-radius:999px;
  padding:0 16px;
  background:rgba(18,20,28,.9);
  color:#fff;
  box-shadow:0 8px 22px rgba(0,0,0,.24);
}
.grDailyTourPanel{
  pointer-events:auto;
  clear:both;
  margin-bottom:8px;
  border:1px solid rgba(255,255,255,.22);
  border-radius:16px;
  padding:12px;
  background:rgba(18,20,28,.94);
  color:#fff;
  box-shadow:0 12px 30px rgba(0,0,0,.3);
}
.grDailyTourPanel[hidden]{display:none!important}
.grDailyTourTitle{font-weight:800;margin:0 0 4px}
.grDailyTourHint,.grDailyTourStatus{font-size:.82em;line-height:1.35;opacity:.82;margin:0 0 9px}
.grDailyTourChoices{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 10px}
.grDailyTourChoice,.grDailyTourAction{
  min-height:44px;
  border:1px solid rgba(255,255,255,.24);
  border-radius:12px;
  padding:7px 10px;
  background:rgba(255,255,255,.08);
  color:inherit;
}
.grDailyTourChoice[aria-pressed="true"]{background:rgba(255,255,255,.2);font-weight:800}
.grDailyTourActions{display:flex;flex-wrap:wrap;gap:7px}
.grDailyTourAction[data-primary="1"]{font-weight:800;background:rgba(255,255,255,.18)}
.grDailyTourAction:disabled{opacity:.45}
@media (max-width:520px){
  [${HOST_ATTR}="1"]{width:min(292px,calc(100vw - 20px));right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom))}
  .grDailyTourPanel{padding:10px}
}
`;
  document.head.append(style);
}

function isVisibleControl(node) {
  if (!(node instanceof HTMLElement) || node.matches(':disabled,[aria-disabled="true"]')) return false;
  const style = getComputedStyle(node);
  const rect = node.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0
    && rect.width > 0
    && rect.height > 0;
}

function routeCandidates(modeId) {
  return ROUTE_ALIASES[modeId] || [modeId];
}

function routeTarget(button) {
  return String(button?.dataset?.homeTarget || '').trim();
}

function routeLabel(button, modeId) {
  const aria = String(button?.getAttribute?.('aria-label') || '').trim();
  const text = String(button?.textContent || '').replace(/\s+/g, ' ').trim();
  if (aria) return aria.replace(/へ$/, '');
  if (text) return text.replace(/へ$/, '');
  if (modeId === 'partner_tea') return 'パートナー';
  if (modeId === 'battle') return 'バトル';
  return modeId;
}

function resolveAvailable(routeButtons) {
  const buttons = [...routeButtons].filter(isVisibleControl);
  const entries = Array.isArray(state.registry?.entries) ? state.registry.entries : [];
  const available = [];
  const routeByMode = new Map();
  for (const entry of entries) {
    if (entry?.class !== 'TOUR_ELIGIBLE' || entry?.tourPolicy?.canAppearInPlan !== true) continue;
    const button = routeCandidates(entry.modeId)
      .map((target) => buttons.find((candidate) => routeTarget(candidate) === target))
      .find(Boolean);
    if (!button) continue;
    routeByMode.set(entry.modeId, button);
    available.push({ id: entry.modeId, label: routeLabel(button, entry.modeId) });
  }
  state.routeByMode = routeByMode;
  state.available = available;
  const valid = new Set(available.map((entry) => entry.id));
  state.selectedIds = state.selectedIds.filter((id) => valid.has(id));
}

async function loadRegistry() {
  if (state.registry) return state.registry;
  if (!state.registryPromise) {
    state.registryPromise = fetch(REGISTRY_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`registry ${response.status}`);
        return response.json();
      })
      .then((registry) => {
        if (registry?.schemaVersion !== 'gameroad-daily-tour-mode-registry-v1') {
          throw new Error('registry schema mismatch');
        }
        state.registry = registry;
        state.message = '';
        return registry;
      })
      .catch((error) => {
        state.message = '今日のルートを読み込めませんでした。';
        state.registryPromise = null;
        throw error;
      });
  }
  return state.registryPromise;
}

function ensureHost(home) {
  if (state.host?.isConnected) return state.host;
  ensureStyle();
  const host = document.createElement('div');
  host.setAttribute(HOST_ATTR, '1');
  host.dataset.layoutMode = 'fixed';
  host.innerHTML = `
    <div class="grDailyTourPanel" data-daily-tour-panel hidden>
      <p class="grDailyTourTitle">今日まわる</p>
      <p class="grDailyTourHint">行く順に選ぶ。途中でやめてもペナルティなし。</p>
      <div class="grDailyTourChoices" data-daily-tour-choices></div>
      <p class="grDailyTourStatus" data-daily-tour-status></p>
      <div class="grDailyTourActions" data-daily-tour-actions></div>
    </div>
    <button type="button" class="grDailyTourLauncher" data-daily-tour-launcher aria-expanded="false">今日</button>
  `;
  host.querySelector('[data-daily-tour-launcher]')?.addEventListener('click', () => {
    state.open = !state.open;
    render();
  });
  document.body.append(host);
  state.host = host;
  return host;
}

function currentStop() {
  return state.plan ? getNextDailyTourStop(state.plan) : null;
}

function dayKey() {
  return `visible-session-${Date.now()}`;
}

function makePlan() {
  const chosen = [...state.selectedIds];
  if (!chosen.length) return null;
  const routeIds = chosen.filter((id) => id !== 'battle');
  const includeBattle = chosen.includes('battle');
  const stops = routeIds.map((id) => ({ id, kind: 'interactive', registered: true, eligible: true }));
  return createDailyTourPlan({
    dayKey: dayKey(),
    mode: DAILY_TOUR_MODES.CUSTOM,
    stops,
    registeredStopIds: routeIds,
    customOrder: routeIds,
    includeBattleFinale: includeBattle,
    battleStopId: 'battle',
  });
}

function routeCurrent() {
  const next = currentStop();
  if (!next) {
    state.message = '今日まわる分はここまで。';
    render();
    return false;
  }
  const control = state.routeByMode.get(next.id);
  if (!isVisibleControl(control)) {
    state.message = 'この行き先は今は開けません。';
    render();
    return false;
  }
  state.open = false;
  state.message = '';
  render();
  control.click();
  return true;
}

function settleCurrent(type) {
  const next = currentStop();
  if (!state.plan || !next) return;
  if (next.type === 'battle_finale') {
    state.plan = advanceDailyTour(state.plan, { type: type === 'skip' ? 'skip_battle' : 'complete_battle' });
  } else {
    state.plan = advanceDailyTour(state.plan, {
      type: type === 'skip' ? 'skip_stop' : 'complete_stop',
      stopId: next.id,
    });
  }
  if (currentStop()) routeCurrent();
  else {
    state.message = '今日まわる分はここまで。';
    render();
  }
}

function endTour() {
  state.plan = null;
  state.selectedIds = [];
  state.message = '今回はここで終了。';
  render();
}

function renderChoices(root) {
  root.replaceChildren();
  if (!state.registry) {
    const span = document.createElement('span');
    span.textContent = state.message || '読み込み中…';
    root.append(span);
    return;
  }
  if (!state.available.length) {
    const span = document.createElement('span');
    span.textContent = '今ここから行ける候補はありません。';
    root.append(span);
    return;
  }
  for (const entry of state.available) {
    const button = document.createElement('button');
    const order = state.selectedIds.indexOf(entry.id);
    button.type = 'button';
    button.className = 'grDailyTourChoice';
    button.dataset.dailyTourMode = entry.id;
    button.setAttribute('aria-pressed', order >= 0 ? 'true' : 'false');
    button.textContent = order >= 0 ? `${order + 1}. ${entry.label}` : entry.label;
    button.addEventListener('click', () => {
      const index = state.selectedIds.indexOf(entry.id);
      if (index >= 0) state.selectedIds.splice(index, 1);
      else state.selectedIds.push(entry.id);
      state.message = '';
      render();
    });
    root.append(button);
  }
}

function renderActions(root) {
  root.replaceChildren();
  const next = currentStop();
  if (state.plan && next) {
    const complete = document.createElement('button');
    complete.type = 'button';
    complete.className = 'grDailyTourAction';
    complete.dataset.dailyTourComplete = '1';
    complete.dataset.primary = '1';
    complete.textContent = '完了して次へ';
    complete.addEventListener('click', () => settleCurrent('complete'));

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'grDailyTourAction';
    skip.dataset.dailyTourSkip = '1';
    skip.textContent = '飛ばす';
    skip.addEventListener('click', () => settleCurrent('skip'));

    const stop = document.createElement('button');
    stop.type = 'button';
    stop.className = 'grDailyTourAction';
    stop.dataset.dailyTourStop = '1';
    stop.textContent = '今回は終了';
    stop.addEventListener('click', endTour);
    root.append(complete, skip, stop);
    return;
  }

  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'grDailyTourAction';
  start.dataset.dailyTourStart = '1';
  start.dataset.primary = '1';
  start.textContent = 'この順で始める';
  start.disabled = state.selectedIds.length === 0;
  start.addEventListener('click', () => {
    state.plan = makePlan();
    if (state.plan) routeCurrent();
  });
  root.append(start);
}

function statusText() {
  const next = currentStop();
  if (state.plan && next) {
    const summary = summarizeDailyTour(state.plan);
    const item = state.available.find((entry) => entry.id === next.id);
    const label = item?.label || next.id;
    const done = summary.completedStopCount + summary.skippedStopCount + (summary.battleCompleted ? 1 : 0);
    return `次: ${label} / 済み ${done}`;
  }
  if (state.message) return state.message;
  if (state.selectedIds.length) return `選択: ${state.selectedIds.length}件`;
  return '好きな分だけ選べます。';
}

function render() {
  const host = state.host;
  if (!host?.isConnected) return;
  const panel = host.querySelector('[data-daily-tour-panel]');
  const launcher = host.querySelector('[data-daily-tour-launcher]');
  const choices = host.querySelector('[data-daily-tour-choices]');
  const status = host.querySelector('[data-daily-tour-status]');
  const actions = host.querySelector('[data-daily-tour-actions]');
  panel.hidden = !state.open;
  launcher.setAttribute('aria-expanded', state.open ? 'true' : 'false');
  launcher.textContent = state.plan ? '今日・続き' : '今日';
  renderChoices(choices);
  status.textContent = statusText();
  renderActions(actions);
}

function signatureFor(active, routeButtons) {
  const targets = [...routeButtons]
    .filter(isVisibleControl)
    .map(routeTarget)
    .filter(Boolean)
    .sort();
  return `${active ? 1 : 0}|${targets.join(',')}|${state.registry ? 1 : 0}`;
}

export function refreshDailyTourHomeLauncher(home, { active = true, routeButtons = [] } = {}) {
  if (!(home instanceof HTMLElement)) return snapshot();
  const host = ensureHost(home);
  if (host.hidden === active) host.hidden = !active;
  if (!active) return snapshot();

  const signature = signatureFor(active, routeButtons);
  if (signature !== state.signature) {
    state.signature = signature;
    if (state.registry) {
      resolveAvailable(routeButtons);
      render();
    }
  }

  if (!state.registry && !state.registryPromise) {
    loadRegistry()
      .then(() => {
        resolveAvailable(routeButtons);
        state.signature = signatureFor(true, routeButtons);
        render();
      })
      .catch(() => render());
  }
  return snapshot();
}

export function snapshot() {
  const summary = state.plan ? summarizeDailyTour(state.plan) : null;
  return Object.freeze({
    mounted: Boolean(state.host?.isConnected),
    open: state.open,
    availableIds: Object.freeze(state.available.map((entry) => entry.id)),
    selectedIds: Object.freeze([...state.selectedIds]),
    currentStop: currentStop(),
    planSummary: summary,
    registryLoaded: Boolean(state.registry),
    layoutMode: 'fixed-no-flow',
    message: state.message,
  });
}
