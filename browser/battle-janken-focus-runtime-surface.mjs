import {
  BATTLE_JANKEN_FOCUS_SURFACE,
  beginBattleJankenCommitPresentation,
  createBattleJankenFocusPresentation,
  enterBattleJankenBoardPeek,
  enterBattleLoadFocus,
  focusBattleJankenPackage,
  returnBattleJankenFocus,
} from './battle-janken-focus-presentation-core.mjs';

export const BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_SCHEMA =
  'gameroad.battle-janken-focus-runtime-surface.v1';

const HAND_LABEL = Object.freeze({
  ROCK: 'グー',
  SCISSORS: 'チョキ',
  PAPER: 'パー',
});

function requiredMethod(owner, name, ownerName) {
  if (typeof owner?.[name] !== 'function') {
    throw new TypeError(`${ownerName}.${name} must be a function`);
  }
  return owner[name].bind(owner);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatPathToken(value) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatRoute(route) {
  if (!route || typeof route !== 'object') return '—';
  const named = route.roadId ?? route.battleId ?? route.direction;
  const path = Array.isArray(route.path)
    ? route.path.map(formatPathToken).join(' → ')
    : '';
  if (named && path) return `${named} / ${path}`;
  return named || path || '—';
}

function lockRows(preview) {
  if (!preview) return '';
  return `
    <div class="grJankenFocusLockRow"><span>カード</span><strong>${escapeHtml(preview.cardId)}</strong></div>
    <div class="grJankenFocusLockRow"><span>相手</span><strong>${escapeHtml(preview.opponentId)}</strong></div>
    <div class="grJankenFocusLockRow"><span>シールド</span><strong>${escapeHtml(preview.shieldLane)}${preview.shieldRef ? ` / ${escapeHtml(preview.shieldRef)}` : ''}</strong></div>
    <div class="grJankenFocusLockRow"><span>経路</span><strong>${escapeHtml(formatRoute(preview.route))}</strong></div>`;
}

function targetRailMarkup(state, busy) {
  return `
    <div class="grJankenTargetRail" role="group" aria-label="ロックオン対象切替">
      ${state.choices.map((choice) => {
        const focused = state.focusedHand === choice.jankenHand;
        const preview = choice.preview;
        const hand = HAND_LABEL[choice.jankenHand] ?? choice.jankenHand;
        return `
          <button type="button"
            class="grJankenTargetChip${focused ? ' is-focused' : ''}"
            data-gr-janken-focus-action="focus"
            data-janken-hand="${choice.jankenHand}"
            data-opponent-id="${escapeHtml(preview?.opponentId ?? '')}"
            data-shield-lane="${escapeHtml(preview?.shieldLane ?? '')}"
            aria-pressed="${focused ? 'true' : 'false'}"
            aria-label="${escapeHtml(`${preview?.opponentId ?? '相手'} ${preview?.shieldLane ?? ''} ${hand}`)}"
            ${busy ? 'disabled' : ''}>
            <span class="grJankenTargetReticle" aria-hidden="true">◎</span>
            <span class="grJankenTargetIdentity"><strong>${escapeHtml(preview?.opponentId ?? '—')}</strong><small>${escapeHtml(preview?.shieldLane ?? '—')} シールド</small></span>
            <span class="grJankenTargetHand">${escapeHtml(hand)}</span>
          </button>`;
      }).join('')}
    </div>`;
}

function choiceMarkup(choice, state, busy) {
  const focused = state.focusedHand === choice.jankenHand;
  return `
    <button type="button"
      class="grJankenFocusChoice${focused ? ' is-focused' : ''}"
      data-gr-janken-focus-action="focus"
      data-janken-hand="${choice.jankenHand}"
      aria-pressed="${focused ? 'true' : 'false'}"
      ${busy ? 'disabled' : ''}>
      <span class="grJankenFocusHand">${HAND_LABEL[choice.jankenHand]}</span>
      ${lockRows(choice.preview)}
    </button>`;
}

function installStyle(documentRef) {
  if (!documentRef?.head?.appendChild || !documentRef?.createElement) return null;
  const existing = documentRef.querySelector?.('[data-gr-janken-focus-surface-style]');
  if (existing) return existing;
  const style = documentRef.createElement('style');
  style.setAttribute?.('data-gr-janken-focus-surface-style', '');
  style.textContent = `
.grJankenFocusSurface{position:absolute;inset:0;z-index:46;pointer-events:none;font-family:inherit;color:#101319}
.grJankenFocusSurface[hidden]{display:none!important}
.grJankenFocusPanel{position:absolute;left:50%;bottom:max(12px,env(safe-area-inset-bottom));width:min(760px,calc(100% - 24px));transform:translateX(-50%);pointer-events:auto;box-sizing:border-box;border:2px solid rgba(16,19,25,.9);border-radius:24px;background:rgba(252,252,250,.97);box-shadow:0 14px 40px rgba(0,0,0,.22);padding:14px}
.grJankenFocusHeader{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.grJankenFocusTitle{font-size:clamp(16px,2.4vw,24px);font-weight:900;line-height:1.1}
.grJankenFocusSub{font-size:12px;font-weight:700;opacity:.68}
.grJankenTargetRail{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 10px;padding:7px;border:1px solid rgba(16,19,25,.18);border-radius:18px;background:rgba(16,19,25,.045)}
.grJankenTargetChip{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:7px;align-items:center;min-width:0;min-height:50px;border:2px solid transparent;border-radius:14px;background:rgba(255,255,255,.9);padding:6px 8px;text-align:left;font:inherit;color:inherit;cursor:pointer}
.grJankenTargetChip.is-focused{border-color:#101319;background:#fff;box-shadow:0 0 0 2px rgba(16,19,25,.11)}
.grJankenTargetChip:disabled{cursor:default;opacity:.58}
.grJankenTargetReticle{display:grid;place-items:center;width:26px;height:26px;border:2px solid currentColor;border-radius:50%;font-size:14px;font-weight:900;line-height:1}
.grJankenTargetChip.is-focused .grJankenTargetReticle{outline:3px double rgba(16,19,25,.5);outline-offset:2px}
.grJankenTargetIdentity{min-width:0;display:flex;flex-direction:column;line-height:1.08}
.grJankenTargetIdentity strong{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grJankenTargetIdentity small{font-size:10px;font-weight:800;opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grJankenTargetHand{font-size:12px;font-weight:900;white-space:nowrap}
.grJankenFocusChoices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.grJankenFocusChoice{min-width:0;min-height:116px;border:2px solid rgba(16,19,25,.3);border-radius:18px;background:#fff;padding:10px;text-align:left;font:inherit;color:inherit;cursor:pointer}
.grJankenFocusChoice.is-focused{border-color:#101319;box-shadow:0 0 0 2px rgba(16,19,25,.12)}
.grJankenFocusChoice:disabled{cursor:default;opacity:.62}
.grJankenFocusHand{display:block;font-size:18px;font-weight:900;margin-bottom:6px}
.grJankenFocusLockRow{display:grid;grid-template-columns:52px minmax(0,1fr);gap:6px;align-items:start;font-size:11px;line-height:1.25;margin-top:3px}
.grJankenFocusLockRow span{opacity:.58;font-weight:800}
.grJankenFocusLockRow strong{font-weight:800;overflow-wrap:anywhere}
.grJankenFocusActions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap}
.grJankenFocusAction{min-height:44px;min-width:88px;border:2px solid #101319;border-radius:999px;background:#fff;padding:8px 16px;font:inherit;font-weight:900;color:inherit;cursor:pointer}
.grJankenFocusAction.is-primary{background:#101319;color:#fff}
.grJankenFocusAction:disabled{opacity:.5;cursor:default}
.grJankenLoadPanel{width:min(590px,calc(100% - 24px));padding:18px}
.grJankenLoadHero{display:grid;grid-template-columns:minmax(84px,130px) minmax(0,1fr);gap:16px;align-items:stretch}
.grJankenLoadCard{display:flex;align-items:center;justify-content:center;min-height:150px;border:3px solid #101319;border-radius:18px;background:#fff;font-size:18px;font-weight:900;text-align:center;padding:10px;overflow-wrap:anywhere}
.grJankenLoadInfo{border:2px solid rgba(16,19,25,.18);border-radius:18px;background:#fff;padding:12px}
.grJankenBoardPeekReturn{position:absolute;right:max(12px,env(safe-area-inset-right));bottom:max(12px,env(safe-area-inset-bottom));pointer-events:auto;min-height:48px;border:2px solid #101319;border-radius:999px;background:rgba(252,252,250,.96);padding:8px 16px;font:inherit;font-weight:900;color:inherit;box-shadow:0 8px 24px rgba(0,0,0,.18);cursor:pointer}
.grJankenFocusError{margin-top:8px;border-radius:12px;background:rgba(16,19,25,.08);padding:8px 10px;font-size:12px;font-weight:800}
@media (max-width:700px){.grJankenFocusPanel{padding:10px;border-radius:18px}.grJankenTargetRail{gap:5px;padding:5px}.grJankenTargetChip{grid-template-columns:24px minmax(0,1fr);min-height:46px;padding:5px}.grJankenTargetReticle{width:22px;height:22px}.grJankenTargetHand{grid-column:2;font-size:10px}.grJankenFocusChoices{gap:6px}.grJankenFocusChoice{min-height:96px;padding:7px;border-radius:14px}.grJankenFocusLockRow{grid-template-columns:42px minmax(0,1fr);font-size:10px}.grJankenFocusHand{font-size:16px}.grJankenLoadHero{grid-template-columns:96px minmax(0,1fr);gap:10px}.grJankenLoadCard{min-height:118px;font-size:15px}.grJankenFocusActions{margin-top:7px}}
@media (max-width:460px){.grJankenFocusPanel{width:calc(100% - 16px);bottom:8px}.grJankenTargetRail{grid-template-columns:1fr 1fr 1fr}.grJankenTargetChip{display:flex;justify-content:center;min-height:48px}.grJankenTargetIdentity{display:none}.grJankenTargetHand{font-size:11px}.grJankenFocusChoices{grid-template-columns:1fr}.grJankenFocusChoice{min-height:74px}.grJankenFocusChoice .grJankenFocusLockRow{display:none}.grJankenLoadPanel{width:calc(100% - 16px)}.grJankenLoadHero{grid-template-columns:82px minmax(0,1fr)}.grJankenLoadCard{min-height:106px}}
@media (prefers-reduced-motion:reduce){.grJankenFocusSurface *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
`;
  documentRef.head.appendChild(style);
  return style;
}

function renderUnavailable(state, errorText = null) {
  return `
    <section class="grJankenFocusPanel" aria-label="じゃんけん攻撃選択">
      <div class="grJankenFocusHeader"><div><div class="grJankenFocusTitle">じゃんけん攻撃</div><div class="grJankenFocusSub">現在の候補を確認しています</div></div></div>
      <div class="grJankenFocusError">${escapeHtml(errorText ?? state?.reason ?? '利用できません')}</div>
    </section>`;
}

function renderJanken(state, { busy, errorText }) {
  return `
    <section class="grJankenFocusPanel" aria-label="じゃんけん攻撃選択">
      <div class="grJankenFocusHeader">
        <div><div class="grJankenFocusTitle">じゃんけん攻撃</div><div class="grJankenFocusSub">ロックオン対象と3つの攻撃を見比べて選択</div></div>
        <button type="button" class="grJankenFocusAction" data-gr-janken-focus-action="peek" ${busy ? 'disabled' : ''}>盤面を見る</button>
      </div>
      ${targetRailMarkup(state, busy)}
      <div class="grJankenFocusChoices">${state.choices.map((choice) => choiceMarkup(choice, state, busy)).join('')}</div>
      ${busy ? '<div class="grJankenFocusError">攻撃先を確認中…</div>' : errorText ? `<div class="grJankenFocusError">${escapeHtml(errorText)}</div>` : ''}
    </section>`;
}

function renderLoad(state, { busy, errorText }) {
  const preview = state.focusedPreview;
  return `
    <section class="grJankenFocusPanel grJankenLoadPanel" role="dialog" aria-modal="false" aria-label="ロード確認">
      <div class="grJankenFocusHeader">
        <div><div class="grJankenFocusTitle">ロード確認</div><div class="grJankenFocusSub">${escapeHtml(HAND_LABEL[state.focusedHand] ?? state.focusedHand)}・ロックオン固定</div></div>
        <button type="button" class="grJankenFocusAction" data-gr-janken-focus-action="peek" ${busy ? 'disabled' : ''}>盤面を見る</button>
      </div>
      <div class="grJankenLoadHero">
        <div class="grJankenLoadCard">${escapeHtml(preview?.cardId ?? '—')}</div>
        <div class="grJankenLoadInfo">${lockRows(preview)}</div>
      </div>
      ${errorText ? `<div class="grJankenFocusError">${escapeHtml(errorText)}</div>` : ''}
      <div class="grJankenFocusActions">
        <button type="button" class="grJankenFocusAction" data-gr-janken-focus-action="cancel" ${busy ? 'disabled' : ''}>戻す</button>
        <button type="button" class="grJankenFocusAction is-primary" data-gr-janken-focus-action="commit" ${busy ? 'disabled' : ''}>このロードで決定</button>
      </div>
    </section>`;
}

function renderCommitting(state) {
  return `
    <section class="grJankenFocusPanel grJankenLoadPanel" role="status" aria-label="ロード決定中">
      <div class="grJankenFocusHeader"><div><div class="grJankenFocusTitle">ロード決定中</div><div class="grJankenFocusSub">${escapeHtml(HAND_LABEL[state.focusedHand] ?? state.focusedHand)}</div></div></div>
      <div class="grJankenLoadHero"><div class="grJankenLoadCard">${escapeHtml(state.focusedPreview?.cardId ?? '—')}</div><div class="grJankenLoadInfo">${lockRows(state.focusedPreview)}</div></div>
    </section>`;
}

function renderBoardPeek() {
  return '<button type="button" class="grJankenBoardPeekReturn" data-gr-janken-focus-action="return">じゃんけんに戻る</button>';
}

function requiredMountRoot(documentRef, mountRoot) {
  const root = mountRoot ?? documentRef?.querySelector?.('#battleScreen') ?? documentRef?.body;
  if (!root?.appendChild) throw new TypeError('mountRoot with appendChild is required');
  return root;
}

export function mountBattleJankenFocusRuntimeSurface({
  documentRef = globalThis?.document,
  mountRoot = null,
  liveInputStack,
  packages,
  generationId = null,
  reducedMotion = false,
  lowPerf = false,
  onAccepted = null,
} = {}) {
  if (!documentRef?.createElement) throw new TypeError('documentRef.createElement is required');
  const root = requiredMountRoot(documentRef, mountRoot);
  const focusLive = requiredMethod(liveInputStack, 'focus', 'liveInputStack');
  const cancelLive = requiredMethod(liveInputStack, 'cancel', 'liveInputStack');
  const commitLive = requiredMethod(liveInputStack, 'commit', 'liveInputStack');
  const liveStatus = requiredMethod(liveInputStack, 'status', 'liveInputStack');

  installStyle(documentRef);
  const host = documentRef.createElement('div');
  host.className = 'grJankenFocusSurface';
  host.setAttribute?.('data-gr-janken-focus-runtime', '');
  host.setAttribute?.('aria-live', 'polite');
  root.appendChild(host);

  let sourcePackages = packages;
  let sourceGenerationId = generationId;
  let presentation = createBattleJankenFocusPresentation({
    packages: sourcePackages,
    generationId: sourceGenerationId,
    reducedMotion,
    lowPerf,
  });
  let busy = false;
  let accepted = false;
  let destroyed = false;
  let errorText = null;
  let interactionVersion = 0;

  function snapshot() {
    return Object.freeze({
      schema: BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_SCHEMA,
      presentation,
      busy,
      accepted,
      destroyed,
      error: errorText,
      live: (() => {
        try { return liveStatus(); } catch { return null; }
      })(),
      presentationOnly: true,
      gameplayAuthority: false,
      targetInference: false,
      legalTargetRecompute: false,
      routeRecompute: false,
      shieldMappingAuthority: false,
      handAssignmentAuthority: false,
      commitTransport: false,
      gameStateWrite: false,
    });
  }

  function render() {
    if (destroyed) return;
    host.dataset.surface = presentation?.surface ?? BATTLE_JANKEN_FOCUS_SURFACE.UNAVAILABLE;
    host.dataset.busy = busy ? 'true' : 'false';
    host.hidden = accepted;
    if (accepted) {
      host.innerHTML = '';
      return;
    }
    switch (presentation?.surface) {
      case BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS:
        host.innerHTML = renderJanken(presentation, { busy, errorText });
        break;
      case BATTLE_JANKEN_FOCUS_SURFACE.BOARD_PEEK:
        host.innerHTML = renderBoardPeek();
        break;
      case BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS:
        host.innerHTML = renderLoad(presentation, { busy, errorText });
        break;
      case BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING:
        host.innerHTML = renderCommitting(presentation);
        break;
      default:
        host.innerHTML = renderUnavailable(presentation, errorText);
        break;
    }
  }

  async function focus(jankenHand) {
    if (destroyed || accepted || busy || presentation?.surface !== BATTLE_JANKEN_FOCUS_SURFACE.JANKEN_FOCUS) {
      return Object.freeze({ ok: false, reason: 'FOCUS_SURFACE_NOT_READY' });
    }
    const version = ++interactionVersion;
    errorText = null;
    presentation = focusBattleJankenPackage(presentation, jankenHand, { previewReady: false });
    if (!presentation?.available) {
      render();
      return Object.freeze({ ok: false, reason: presentation?.reason ?? 'FOCUS_UNAVAILABLE' });
    }
    busy = true;
    render();
    let result;
    try {
      result = await focusLive(jankenHand);
    } catch {
      result = { ok: false, staged: false, reason: 'FOCUS_STAGE_FAILED' };
    }
    if (destroyed || accepted || version !== interactionVersion) {
      return Object.freeze({ ok: false, stale: true, reason: 'LOCAL_FOCUS_SUPERSEDED' });
    }
    busy = false;
    const status = (() => { try { return liveStatus(); } catch { return null; } })();
    const exactPreviewReady = result?.ok === true
      && result?.staged === true
      && status?.readyHand === jankenHand
      && status?.previewReady === true;
    presentation = focusBattleJankenPackage(presentation, jankenHand, {
      previewReady: exactPreviewReady,
    });
    if (exactPreviewReady) {
      presentation = enterBattleLoadFocus(presentation);
      errorText = null;
      render();
      return Object.freeze({ ok: true, ready: true, reason: 'LOAD_FOCUS_READY', jankenHand });
    }
    errorText = result?.reason ?? '攻撃先の表示を確認できませんでした';
    render();
    return Object.freeze({ ok: false, ready: false, reason: result?.reason ?? 'VISIBLE_PREVIEW_REQUIRED' });
  }

  function boardPeek() {
    if (destroyed || accepted || busy) return false;
    const next = enterBattleJankenBoardPeek(presentation);
    if (next === presentation) return false;
    presentation = next;
    errorText = null;
    render();
    return true;
  }

  function returnFromBoardPeek() {
    if (destroyed || accepted || busy) return false;
    const next = returnBattleJankenFocus(presentation);
    if (next === presentation) return false;
    presentation = next;
    errorText = null;
    render();
    return true;
  }

  async function cancel() {
    if (destroyed || accepted || busy || presentation?.surface !== BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS) {
      return Object.freeze({ ok: false, cleared: false, reason: 'LOAD_FOCUS_REQUIRED' });
    }
    const version = ++interactionVersion;
    const previous = presentation;
    busy = true;
    errorText = null;
    render();
    let result;
    try {
      result = await cancelLive();
    } catch {
      result = { ok: false, cleared: false, reason: 'PRECOMMIT_CLEAR_FAILED' };
    }
    if (destroyed || accepted || version !== interactionVersion) {
      return Object.freeze({ ok: false, cleared: false, stale: true, reason: 'LOCAL_CANCEL_SUPERSEDED' });
    }
    busy = false;
    if (result?.ok === true && result?.cleared === true) {
      presentation = createBattleJankenFocusPresentation({
        packages: sourcePackages,
        generationId: sourceGenerationId,
        reducedMotion,
        lowPerf,
      });
      errorText = null;
    } else {
      presentation = previous;
      errorText = result?.reason ?? '選択を戻せませんでした';
    }
    render();
    return result;
  }

  async function commit() {
    if (destroyed || accepted || busy
      || presentation?.surface !== BATTLE_JANKEN_FOCUS_SURFACE.LOAD_FOCUS
      || presentation?.previewReady !== true) {
      return Object.freeze({ ok: false, committed: false, reason: 'READY_LOAD_FOCUS_REQUIRED' });
    }
    const version = ++interactionVersion;
    const readyPresentation = presentation;
    presentation = beginBattleJankenCommitPresentation(presentation);
    if (presentation?.surface !== BATTLE_JANKEN_FOCUS_SURFACE.COMMITTING) {
      return Object.freeze({ ok: false, committed: false, reason: 'COMMIT_PRESENTATION_NOT_READY' });
    }
    busy = true;
    errorText = null;
    render();
    let result;
    try {
      result = await commitLive();
    } catch {
      result = { ok: false, committed: false, reason: 'COMMIT_FAILED' };
    }
    if (destroyed || accepted || version !== interactionVersion) {
      return Object.freeze({ ok: false, committed: false, stale: true, reason: 'LOCAL_COMMIT_SUPERSEDED' });
    }
    busy = false;
    if (result?.ok === true && result?.committed === true) {
      accepted = true;
      errorText = null;
      render();
      if (typeof onAccepted === 'function') {
        try { onAccepted(result, readyPresentation.focusedPackage); } catch {}
      }
      return result;
    }
    presentation = readyPresentation;
    errorText = result?.reason ?? '決定できませんでした。もう一度確認できます';
    render();
    return result;
  }

  function sync({
    packages: nextPackages = sourcePackages,
    generationId: nextGenerationId = sourceGenerationId,
  } = {}) {
    if (destroyed) return snapshot();
    ++interactionVersion;
    sourcePackages = nextPackages;
    sourceGenerationId = nextGenerationId;
    busy = false;
    accepted = false;
    errorText = null;
    presentation = createBattleJankenFocusPresentation({
      packages: sourcePackages,
      generationId: sourceGenerationId,
      reducedMotion,
      lowPerf,
    });
    render();
    return snapshot();
  }

  function handleClick(event) {
    const actionNode = event?.target?.closest?.('[data-gr-janken-focus-action]');
    const action = actionNode?.dataset?.grJankenFocusAction;
    if (!action) return;
    if (action === 'focus') void focus(actionNode.dataset.jankenHand);
    else if (action === 'peek') boardPeek();
    else if (action === 'return') returnFromBoardPeek();
    else if (action === 'cancel') void cancel();
    else if (action === 'commit') void commit();
  }

  host.addEventListener?.('click', handleClick);
  render();

  return Object.freeze({
    schema: BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_SCHEMA,
    host,
    render,
    focus,
    boardPeek,
    returnFromBoardPeek,
    cancel,
    commit,
    sync,
    snapshot,
    destroy() {
      if (destroyed) return false;
      ++interactionVersion;
      destroyed = true;
      busy = false;
      host.removeEventListener?.('click', handleClick);
      host.remove?.();
      return true;
    },
  });
}

export const BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_CONTRACT = Object.freeze({
  schema: BATTLE_JANKEN_FOCUS_RUNTIME_SURFACE_SCHEMA,
  authority: 'NONE',
  source: 'EXISTING_FOCUS_PRESENTATION_PLUS_CALLER_SUPPLIED_EXISTING_LIVE_INPUT_STACK',
  exactThreeChoices: true,
  authoritativeTargetRail: true,
  targetRailSource: 'EXISTING_THREE_COMPOUND_PACKAGES_ONLY',
  targetRailMayCreateTarget: false,
  visibleLockFields: Object.freeze(['cardId', 'opponentId', 'shieldLane', 'shieldRef', 'route']),
  boardPeekPreservesExistingPresentationFocus: true,
  loadFocusRequiresExistingVisiblePreview: true,
  selectionCommitsImmediately: false,
  commitTransportDelegatedToExistingLiveStack: true,
  cancelDelegatedToExistingLiveStack: true,
  acceptedCommitClosesSurface: true,
  rejectedCommitKeepsLoadFocus: true,
  computesTarget: false,
  computesLegality: false,
  computesRoute: false,
  computesShieldMapping: false,
  computesHandAssignment: false,
  gameStateWrite: false,
  mutatesProductionHtml: false,
  mutatesJankenRuntime: false,
  mutatesPublicPackage: false,
});