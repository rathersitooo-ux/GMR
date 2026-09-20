import {
  RANK_MATCH_ENTRY_SCHEMA,
  RANK_MATCH_WAITING_TEXTURE,
  createRankMatchEntryState,
  projectRankMatchWaitingLayout,
  resolveRankMatchEntryAction,
} from './rank-match-entry-core.mjs';

const GLOBAL_KEY = 'GAMEROAD_RANK_MATCH_ENTRY_RUNTIME';
const STYLE_ID = 'gameroad-rank-match-entry-style-v1';
const HOME_SELECTOR = 'section[data-screen="home"]';
const SETUP_SELECTOR = 'section[data-screen="setup"]';
const WAITING_VIEW_ID = 'rankMatchWaitingView';
const TEXT_SELECTORS = Object.freeze([
  '.codexRankLabel',
  '.codexBattleCrest strong',
]);
const ASSET_URL = new URL(RANK_MATCH_WAITING_TEXTURE.path, import.meta.url).href;

const runtime = {
  mounted: false,
  document: null,
  global: null,
  observer: null,
  refreshQueued: false,
  setup: null,
  waitingView: null,
  mode: 'rotation',
  searchState: 'ready',
  lastRemovedHomeNodes: 0,
  lastError: null,
};

function isElement(node) {
  return Boolean(node && node.nodeType === 1);
}

function getDocument(source) {
  return source?.document || source || null;
}

function getWindow(documentSource, globalSource) {
  return documentSource?.defaultView || globalSource || globalThis;
}

function isActiveScreen(screen) {
  if (!isElement(screen)) return false;
  if (screen.classList?.contains('active')) return true;
  if (screen.hasAttribute?.('hidden')) return false;
  const view = screen.ownerDocument?.defaultView;
  if (typeof view?.getComputedStyle !== 'function') return false;
  const style = view.getComputedStyle(screen);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function styleLines() {
  return [
    '.setupBox>.rankMatchChoice{grid-column:1/-1;display:grid;gap:6px;margin-top:2px;padding:10px;border:1px solid rgba(255,226,137,.24);border-radius:6px;background:linear-gradient(110deg,rgba(38,39,17,.72),rgba(12,31,24,.56));box-shadow:0 10px 22px rgba(0,0,0,.16)}',
    '.rankMatchChoice>.k{color:#e8c86d;font-size:9px;letter-spacing:.18em;font-weight:900}',
    '.rankMatchEntryButton{display:flex;align-items:center;gap:10px;min-height:52px;width:100%;padding:8px 11px;border:1px solid rgba(255,226,137,.52);border-radius:5px;background:linear-gradient(100deg,rgba(48,100,93,.94),rgba(24,65,57,.9));color:#fff4ce;cursor:pointer;text-align:left;box-shadow:0 8px 18px rgba(0,0,0,.19)}',
    '.rankMatchEntryButton:hover,.rankMatchEntryButton:focus-visible{border-color:#fff0a3;background:linear-gradient(100deg,rgba(66,133,122,.98),rgba(29,83,71,.96));outline:2px solid rgba(255,230,128,.62);outline-offset:3px}',
    '.rankMatchEntryIcon{display:grid;place-items:center;flex:none;width:30px;height:30px;border:1px solid currentColor;border-radius:50%;font-size:18px}',
    '.rankMatchEntryButton strong,.rankMatchEntryButton small{display:block}.rankMatchEntryButton strong{font-size:14px;letter-spacing:.05em}.rankMatchEntryButton small{margin-top:2px;color:#cfe8df;font-size:9px}.rankMatchEntryArrow{margin-left:auto;font-size:20px}',
    '#rankMatchWaitingView{position:fixed;inset:0;z-index:2147482900;overflow:hidden;color:#fff6d4;background-color:#13190f;background-image:linear-gradient(90deg,rgba(8,18,10,.08),rgba(8,18,10,.08)),url("' + ASSET_URL + '");background-position:center;background-repeat:no-repeat;background-size:100% 100%;font-family:inherit;isolation:isolate}',
    '#rankMatchWaitingView[hidden]{display:none!important}',
    '#rankMatchWaitingView:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,12,7,.04),rgba(5,12,7,.14) 64%,rgba(5,12,7,.34));pointer-events:none}',
    '#rankMatchWaitingView button{font:inherit;color:inherit}',
    '#rankMatchWaitingView .rmw-topbar{position:absolute;left:8.1%;top:3.1%;z-index:2}',
    '#rankMatchWaitingView .rmw-back{min-width:170px;min-height:38px;padding:7px 16px;border:1px solid rgba(255,244,192,.38);border-radius:6px;background:rgba(19,28,17,.42);box-shadow:0 7px 18px rgba(0,0,0,.18);font-size:clamp(12px,1.2vw,19px);font-weight:900;letter-spacing:.08em;text-align:left;cursor:pointer;backdrop-filter:blur(3px)}',
    '#rankMatchWaitingView .rmw-back:hover,#rankMatchWaitingView .rmw-back:focus-visible{border-color:#fff0a8;background:rgba(55,54,24,.58);outline:2px solid rgba(255,239,152,.76);outline-offset:3px}',
    '#rankMatchWaitingView .rmw-rail{position:absolute;left:12.2%;top:12.3%;z-index:2;width:11.1%;height:52.2%;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,226,137,.25);box-shadow:0 18px 32px rgba(9,20,8,.24)}',
    '#rankMatchWaitingView .rmw-tab{position:relative;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px 5px;border:0;border-bottom:1px solid rgba(255,226,137,.19);background:rgba(41,35,13,.43);color:rgba(255,242,190,.73);font-size:clamp(10px,1.15vw,18px);font-weight:900;cursor:pointer;text-shadow:0 2px 5px rgba(0,0,0,.42)}',
    '#rankMatchWaitingView .rmw-tab:last-child{border-bottom:0}',
    '#rankMatchWaitingView .rmw-tab:disabled{cursor:default;opacity:.62}',
    '#rankMatchWaitingView .rmw-tab.is-active{background:linear-gradient(180deg,rgba(162,109,8,.58),rgba(87,56,5,.32));color:#fff3bb;box-shadow:inset 4px 0 #ffe37b,0 0 22px rgba(241,188,39,.14)}',
    '#rankMatchWaitingView .rmw-tab.is-active:after{content:"";position:absolute;right:-7px;top:calc(50% - 8px);width:14px;height:14px;transform:rotate(45deg);background:#f5db77}',
    '#rankMatchWaitingView .rmw-tab-mark{display:grid;place-items:center;width:clamp(25px,2.6vw,45px);height:clamp(25px,2.6vw,45px);border:1px solid currentColor;border-radius:50%;font-size:clamp(13px,1.55vw,25px);line-height:1}',
    '#rankMatchWaitingView .rmw-center{position:absolute;left:25.2%;top:15.3%;z-index:2;width:35.2%;height:38.8%;display:flex;flex-direction:column;align-items:flex-start;text-shadow:0 3px 7px rgba(0,0,0,.52)}',
    '#rankMatchWaitingView .rmw-eyebrow{margin:0 0 4px;color:#e9c85e;font-size:clamp(9px,1vw,15px);font-weight:900;letter-spacing:.18em}',
    '#rankMatchWaitingView .rmw-title{margin:0;color:#fff6c8;font-size:clamp(23px,3.1vw,54px);font-weight:950;letter-spacing:.04em;line-height:1.05}',
    '#rankMatchWaitingView .rmw-description{margin:12px 0 0;color:#fff7dd;font-size:clamp(11px,1.25vw,20px);font-weight:800;line-height:1.45}',
    '#rankMatchWaitingView .rmw-rule-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto;width:100%}',
    '#rankMatchWaitingView .rmw-rule{min-width:clamp(122px,13vw,210px);min-height:38px;padding:7px 13px;border:1px solid rgba(255,230,143,.43);border-radius:5px;background:rgba(35,33,15,.48);color:#ffeeb0;font-size:clamp(10px,1vw,16px);font-weight:900;text-align:left;cursor:pointer}',
    '#rankMatchWaitingView .rmw-rule.is-selected{background:linear-gradient(90deg,rgba(37,92,138,.95),rgba(28,70,104,.68));border-color:#9dd9ff;box-shadow:0 0 0 1px rgba(157,217,255,.22) inset}',
    '#rankMatchWaitingView .rmw-rank{position:absolute;left:60.3%;top:17.2%;z-index:2;width:20.5%;height:30.3%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-shadow:0 3px 7px rgba(0,0,0,.6)}',
    '#rankMatchWaitingView .rmw-emblem{display:grid;place-items:center;width:clamp(74px,8vw,134px);aspect-ratio:1;border:2px solid rgba(255,223,116,.64);border-radius:50%;background:radial-gradient(circle,rgba(201,45,43,.84) 0 18%,rgba(240,190,69,.72) 19% 25%,rgba(24,75,92,.7) 26% 52%,rgba(255,234,132,.35) 53% 56%,rgba(18,31,19,.12) 57%);box-shadow:0 0 0 7px rgba(255,216,97,.14),0 15px 35px rgba(0,0,0,.28);color:#fff6c5;font-size:clamp(14px,1.8vw,30px);font-weight:950;letter-spacing:.05em}',
    '#rankMatchWaitingView .rmw-rank-name{margin:9px 0 0;color:#fff3d2;font-family:Georgia,serif;font-size:clamp(18px,2.3vw,37px);font-weight:900;white-space:nowrap}',
    '#rankMatchWaitingView .rmw-rank-meta{display:flex;gap:24px;margin-top:4px;color:#ffefc6;font-size:clamp(10px,1.05vw,17px);font-weight:900}',
    '#rankMatchWaitingView .rmw-status{position:absolute;left:32.6%;top:70.3%;z-index:2;width:35.4%;min-height:44px;display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 16px;border:1px solid rgba(255,231,148,.34);border-radius:7px;background:rgba(22,31,16,.48);box-shadow:0 11px 24px rgba(0,0,0,.2);color:#fff2c8;font-size:clamp(11px,1.25vw,20px);font-weight:900;letter-spacing:.05em;text-align:center;backdrop-filter:blur(3px)}',
    '#rankMatchWaitingView .rmw-status-dot{width:12px;height:12px;border-radius:50%;background:#70dbff;box-shadow:0 0 0 4px rgba(112,219,255,.17),0 0 16px #70dbff}',
    '#rankMatchWaitingView[data-search-state="searching"] .rmw-status-dot{animation:rmwPulse 1.15s ease-in-out infinite}',
    '#rankMatchWaitingView .rmw-action{position:absolute;left:76.4%;top:42.1%;z-index:3;width:10.6%;aspect-ratio:1;border:0;border-radius:50%;background:radial-gradient(circle,rgba(35,191,255,.34),rgba(0,95,206,.1) 61%,transparent 63%);color:#dff8ff;font-size:clamp(12px,1.25vw,21px);font-weight:950;line-height:1.2;text-shadow:0 2px 8px rgba(0,0,0,.62);cursor:pointer;filter:drop-shadow(0 9px 16px rgba(0,44,95,.35))}',
    '#rankMatchWaitingView .rmw-action:hover,#rankMatchWaitingView .rmw-action:focus-visible{outline:3px solid rgba(171,239,255,.92);outline-offset:5px;background:radial-gradient(circle,rgba(71,212,255,.58),rgba(0,95,206,.22) 61%,transparent 63%)}',
    '#rankMatchWaitingView .rmw-action:disabled{cursor:wait;opacity:.82}',
    '#rankMatchWaitingView .rmw-cancel{position:absolute;right:7.8%;bottom:7.2%;z-index:3;min-width:100px;min-height:34px;padding:6px 13px;border:1px solid rgba(255,233,154,.3);border-radius:5px;background:rgba(18,30,17,.52);color:#fff0bd;font-size:clamp(10px,1vw,16px);font-weight:900;cursor:pointer}',
    '#rankMatchWaitingView .rmw-cancel:hover,#rankMatchWaitingView .rmw-cancel:focus-visible{border-color:#fff0a8;outline:2px solid rgba(255,239,152,.62);outline-offset:3px}',
    '@keyframes rmwPulse{0%,100%{transform:scale(.82);opacity:.55}50%{transform:scale(1.12);opacity:1}}',
    '@media(max-width:900px){#rankMatchWaitingView .rmw-title{font-size:clamp(20px,3.4vw,42px)}#rankMatchWaitingView .rmw-description{margin-top:6px}#rankMatchWaitingView .rmw-rule-list{gap:4px}#rankMatchWaitingView .rmw-rule{min-width:0;flex:1;padding:5px 7px;font-size:clamp(8px,1.1vw,13px)}#rankMatchWaitingView .rmw-rank-meta{gap:9px}}',
    '@media(max-width:540px){#rankMatchWaitingView .rmw-topbar{left:4%;top:2%}#rankMatchWaitingView .rmw-back{min-width:120px;min-height:31px;padding:5px 9px;font-size:10px}#rankMatchWaitingView .rmw-rail{left:4%;top:15%;width:18%;height:47%}#rankMatchWaitingView .rmw-tab{gap:3px;font-size:8px}#rankMatchWaitingView .rmw-center{left:25%;top:16%;width:38%;height:37%}#rankMatchWaitingView .rmw-title{font-size:clamp(18px,5.4vw,29px)}#rankMatchWaitingView .rmw-description{font-size:8px}#rankMatchWaitingView .rmw-rank{left:63%;top:19%;width:31%;height:27%}#rankMatchWaitingView .rmw-rank-name{font-size:14px}#rankMatchWaitingView .rmw-status{left:23%;top:67%;width:55%;font-size:9px;min-height:34px;padding:5px}#rankMatchWaitingView .rmw-action{left:74%;top:42%;width:18%;font-size:10px}#rankMatchWaitingView .rmw-cancel{right:4%;bottom:3%;min-width:70px;font-size:9px}}',
    '@media(prefers-reduced-motion:reduce){#rankMatchWaitingView[data-search-state="searching"] .rmw-status-dot{animation:none}}',
  ];
}

function ensureStyle(documentSource) {
  if (!documentSource?.head || documentSource.getElementById?.(STYLE_ID)) return;
  const style = documentSource.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styleLines().join('\n');
  documentSource.head.append(style);
}

export function removeHomeRankText(home) {
  if (!isElement(home) || typeof home.querySelectorAll !== 'function') return 0;
  const nodes = new Set();
  for (const selector of TEXT_SELECTORS) {
    for (const node of home.querySelectorAll(selector)) nodes.add(node);
  }
  let removed = 0;
  for (const node of nodes) {
    if (!isElement(node)) continue;
    node.remove();
    removed += 1;
  }
  return removed;
}

function createRankChoice(documentSource) {
  const group = documentSource.createElement('div');
  group.className = 'rankMatchChoice';
  group.dataset.rankMatchChoice = 'true';
  group.innerHTML = [
    '<div class="k">MATCH TYPE</div>',
    '<button type="button" class="btn rankMatchEntryButton" data-rank-match-entry="true" aria-label="ランクマッチを選ぶ">',
    '<span class="rankMatchEntryIcon" aria-hidden="true">♜</span>',
    '<span><strong>ランクマッチ</strong><small>ランクをかけて戦う</small></span>',
    '<span class="rankMatchEntryArrow" aria-hidden="true">→</span>',
    '</button>',
  ].join('');
  return group;
}

function ensureRankChoice(setup, onOpen) {
  if (!isElement(setup)) return null;
  const box = setup.querySelector?.('.setupBox');
  if (!isElement(box)) return null;
  let group = box.querySelector('[data-rank-match-choice="true"]');
  if (!isElement(group)) {
    group = createRankChoice(setup.ownerDocument);
    group.dataset.rankMatchChoice = 'true';
    const anchor = box.querySelector('#friendRoomEntry') || box.querySelector('#startMatch');
    if (isElement(anchor)) anchor.before(group);
    else box.append(group);
  }
  const button = group.querySelector('[data-rank-match-entry="true"]');
  if (isElement(button) && button.dataset.rankMatchEntryBound !== 'true') {
    button.dataset.rankMatchEntryBound = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      onOpen(setup);
    });
  }
  return button;
}

function ensureWaitingView(setup, onClose, onSearch, onMode) {
  const documentSource = setup.ownerDocument;
  let view = setup.querySelector('#' + WAITING_VIEW_ID);
  if (!isElement(view)) {
    view = documentSource.createElement('div');
    view.id = WAITING_VIEW_ID;
    view.hidden = true;
    view.setAttribute('role', 'dialog');
    view.setAttribute('aria-modal', 'true');
    view.setAttribute('aria-labelledby', 'rankMatchWaitingTitle');
    view.innerHTML = [
      '<div class="rmw-topbar"><button type="button" class="rmw-back" data-rank-wait-back="true">← ランダムマッチ</button></div>',
      '<div class="rmw-rail" role="tablist" aria-label="対戦モード">',
      '<button type="button" class="rmw-tab is-active" role="tab" aria-selected="true" data-rank-wait-tab="rank"><span class="rmw-tab-mark" aria-hidden="true">♜</span><strong>ランクマッチ</strong></button>',
      '<button type="button" class="rmw-tab" role="tab" aria-selected="false" data-rank-wait-tab="free" disabled><span class="rmw-tab-mark" aria-hidden="true">∞</span><strong>フリーマッチ</strong></button>',
      '</div>',
      '<section class="rmw-center" aria-label="ランクマッチ条件">',
      '<p class="rmw-eyebrow">RANK MATCH</p>',
      '<h1 id="rankMatchWaitingTitle" class="rmw-title">ランクマッチ</h1>',
      '<p class="rmw-description">ランクをかけて戦う<br>ランダムマッチング</p>',
      '<div class="rmw-rule-list" role="group" aria-label="ルール選択">',
      '<button type="button" class="rmw-rule is-selected" data-rank-mode="rotation">◇ ローテーション</button>',
      '<button type="button" class="rmw-rule" data-rank-mode="unlimited">∞ アンリミテッド</button>',
      '</div>',
      '</section>',
      '<section class="rmw-rank" aria-label="現在のランク">',
      '<div class="rmw-emblem" aria-hidden="true">GM</div>',
      '<p class="rmw-rank-name">Grand Master 2</p>',
      '<div class="rmw-rank-meta"><span>MP <b>33685</b></span><span>CR <b>1495</b></span></div>',
      '</section>',
      '<div class="rmw-status" role="status" aria-live="polite"><span class="rmw-status-dot" aria-hidden="true"></span><span data-rank-status>対戦相手を検索する準備ができました</span></div>',
      '<button type="button" class="rmw-action" data-rank-search="true">マッチング開始</button>',
      '<button type="button" class="rmw-cancel" data-rank-wait-cancel="true">戻る</button>',
    ].join('');
    setup.append(view);
  }
  if (view.dataset.rankWaitingBound !== 'true') {
    view.dataset.rankWaitingBound = 'true';
    view.querySelector('[data-rank-wait-back="true"]')?.addEventListener('click', () => onClose(setup));
    view.querySelector('[data-rank-wait-cancel="true"]')?.addEventListener('click', () => onClose(setup));
    view.querySelector('[data-rank-search="true"]')?.addEventListener('click', () => onSearch(setup));
    for (const button of view.querySelectorAll('[data-rank-mode]')) {
      button.addEventListener('click', () => onMode(setup, button.dataset.rankMode));
    }
  }
  return view;
}

function eventCtor(globalSource, documentSource) {
  return globalSource?.CustomEvent || documentSource?.defaultView?.CustomEvent || globalThis.CustomEvent;
}

function emit(documentSource, globalSource, name, detail) {
  const EventCtor = eventCtor(globalSource, documentSource);
  if (typeof EventCtor !== 'function' || typeof documentSource?.dispatchEvent !== 'function') return false;
  documentSource.dispatchEvent(new EventCtor(name, { bubbles: true, detail }));
  return true;
}

function renderWaitingState(view, searchState) {
  if (!isElement(view)) return;
  const status = view.querySelector('[data-rank-status]');
  const action = view.querySelector('[data-rank-search="true"]');
  view.dataset.searchState = searchState;
  view.setAttribute('aria-busy', searchState === 'searching' ? 'true' : 'false');
  if (status) {
    status.textContent = searchState === 'searching'
      ? '対戦相手を検索中'
      : searchState === 'cancelled'
        ? '検索を中止しました'
        : '対戦相手を検索する準備ができました';
  }
  if (action) {
    action.disabled = false;
    action.textContent = searchState === 'searching' ? '検索を中止' : 'マッチング開始';
    action.setAttribute('aria-label', action.textContent);
  }
}

function setSearchState(setup, next, globalSource) {
  const view = setup?.querySelector?.('#' + WAITING_VIEW_ID);
  if (!isElement(view)) return;
  runtime.searchState = next;
  renderWaitingState(view, next);
  emit(setup.ownerDocument, globalSource, 'gameroad:rank-match-search-state', {
    schema: RANK_MATCH_ENTRY_SCHEMA,
    searchState: next,
    mode: runtime.mode,
  });
}

function openWaiting(setup, globalSource) {
  const opening = resolveRankMatchEntryAction({ screen: 'setup', action: 'open-waiting' });
  if (!opening.ok) return null;
  const view = ensureWaitingView(
    setup,
    currentSetup => closeWaiting(currentSetup),
    currentSetup => {
      if (runtime.searchState === 'searching') {
        setSearchState(currentSetup, 'cancelled', globalSource);
        emit(currentSetup.ownerDocument, globalSource, 'gameroad:rank-match-search-cancel', {
          schema: RANK_MATCH_ENTRY_SCHEMA,
          mode: runtime.mode,
        });
        return;
      }
      setSearchState(currentSetup, 'searching', globalSource);
      emit(currentSetup.ownerDocument, globalSource, 'gameroad:rank-match-search-start', {
        schema: RANK_MATCH_ENTRY_SCHEMA,
        mode: runtime.mode,
        layout: projectRankMatchWaitingLayout({
          viewportWidth: currentSetup.ownerDocument.documentElement?.clientWidth,
          viewportHeight: currentSetup.ownerDocument.documentElement?.clientHeight,
        }),
      });
      const adapter = globalSource?.GAMEROAD_RANK_MATCH_SEARCH;
      if (typeof adapter?.start !== 'function') return;
      Promise.resolve(adapter.start({ schema: RANK_MATCH_ENTRY_SCHEMA, mode: runtime.mode }))
        .catch(error => {
          runtime.lastError = String(error?.message || error || 'RANK_MATCH_SEARCH_FAILED');
          setSearchState(currentSetup, 'ready', globalSource);
        });
    },
    (currentSetup, mode) => {
      runtime.mode = mode === 'unlimited' ? 'unlimited' : 'rotation';
      const currentView = currentSetup.querySelector('#' + WAITING_VIEW_ID);
      for (const button of currentView?.querySelectorAll?.('[data-rank-mode]') || []) {
        button.classList.toggle('is-selected', button.dataset.rankMode === runtime.mode);
        button.setAttribute('aria-pressed', button.dataset.rankMode === runtime.mode ? 'true' : 'false');
      }
    },
  );
  if (!isElement(view)) return null;
  runtime.setup = setup;
  runtime.waitingView = view;
  runtime.searchState = 'ready';
  setup.dataset.rankMatchWaiting = 'true';
  view.hidden = false;
  renderWaitingState(view, runtime.searchState);
  const state = createRankMatchEntryState({
    screen: 'setup',
    searchState: runtime.searchState,
    rankChoiceVisible: true,
    waitingVisible: true,
  });
  emit(setup.ownerDocument, globalSource, 'gameroad:rank-match-waiting-open', state);
  return view;
}

function closeWaiting(setup) {
  const view = setup?.querySelector?.('#' + WAITING_VIEW_ID);
  if (isElement(view)) view.hidden = true;
  setup?.removeAttribute?.('data-rank-match-waiting');
  runtime.setup = null;
  runtime.waitingView = null;
  runtime.searchState = 'ready';
}

function sync(globalSource, documentSource) {
  const home = documentSource.querySelector?.(HOME_SELECTOR);
  runtime.lastRemovedHomeNodes = removeHomeRankText(home);
  const setup = documentSource.querySelector?.(SETUP_SELECTOR);
  if (!isElement(setup)) {
    runtime.setup = null;
    runtime.waitingView = null;
    return;
  }
  ensureRankChoice(setup, currentSetup => openWaiting(currentSetup, globalSource));
  runtime.setup = setup;
  const view = setup.querySelector?.('#' + WAITING_VIEW_ID);
  if (!isActiveScreen(setup) && isElement(view)) closeWaiting(setup);
}

function scheduleSync(globalSource, documentSource) {
  if (runtime.refreshQueued) return;
  runtime.refreshQueued = true;
  const run = () => {
    runtime.refreshQueued = false;
    sync(globalSource, documentSource);
  };
  if (typeof globalSource?.queueMicrotask === 'function') globalSource.queueMicrotask(run);
  else Promise.resolve().then(run);
}

export function mountRankMatchEntryRuntime(globalSource = globalThis, documentSource = getDocument(globalSource)) {
  if (!documentSource?.querySelector || !documentSource?.createElement) return null;
  if (runtime.mounted && runtime.document === documentSource) {
    sync(globalSource, documentSource);
    return globalSource[GLOBAL_KEY] || null;
  }
  runtime.global = globalSource;
  runtime.document = documentSource;
  ensureStyle(documentSource);
  const MutationObserverCtor = globalSource?.MutationObserver || documentSource.defaultView?.MutationObserver;
  if (typeof MutationObserverCtor === 'function' && documentSource.body) {
    runtime.observer = new MutationObserverCtor(() => scheduleSync(globalSource, documentSource));
    runtime.observer.observe(documentSource.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-selected', 'aria-pressed', 'data-home-target'],
    });
  }
  runtime.mounted = true;
  sync(globalSource, documentSource);
  const api = Object.freeze({
    schema: RANK_MATCH_ENTRY_SCHEMA,
    texture: Object.freeze({ ...RANK_MATCH_WAITING_TEXTURE, url: ASSET_URL }),
    layout: projectRankMatchWaitingLayout,
    state: () => createRankMatchEntryState({
      screen: runtime.waitingView ? 'setup' : 'home',
      searchState: runtime.searchState,
      rankChoiceVisible: Boolean(runtime.setup),
      waitingVisible: Boolean(runtime.waitingView && !runtime.waitingView.hidden),
    }),
    snapshot: () => Object.freeze({
      mounted: runtime.mounted,
      homeRankTextRemoved: runtime.lastRemovedHomeNodes >= 0,
      lastRemovedHomeNodes: runtime.lastRemovedHomeNodes,
      setupRankChoiceMounted: Boolean(runtime.setup?.querySelector?.('[data-rank-match-entry="true"]')),
      waitingVisible: Boolean(runtime.waitingView && !runtime.waitingView.hidden),
      searchState: runtime.searchState,
      mode: runtime.mode,
      lastError: runtime.lastError,
    }),
    refresh: () => sync(globalSource, documentSource),
    openWaiting: () => runtime.setup ? openWaiting(runtime.setup, globalSource) : null,
    closeWaiting: () => closeWaiting(runtime.setup),
  });
  Object.defineProperty(globalSource, GLOBAL_KEY, {
    value: api,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return api;
}

export function unmountRankMatchEntryRuntime() {
  runtime.observer?.disconnect?.();
  if (runtime.waitingView) runtime.waitingView.remove();
  runtime.mounted = false;
  runtime.document = null;
  runtime.global = null;
  runtime.observer = null;
  runtime.setup = null;
  runtime.waitingView = null;
  runtime.refreshQueued = false;
  runtime.mode = 'rotation';
  runtime.searchState = 'ready';
  return true;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const mount = () => mountRankMatchEntryRuntime(window, document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
}
