// BATTLE START の題とムービー（案A）の画面への取り付け。
// 決めの材料「BATTLE-START-題とムービー-決めの材料.md」の推奨（2026-11-08、
// ライカが案A「BATTLE START」の題を採用）通り。
// すでにある部品をつなぐだけ：題→入りの計画と生の受け渡しは
// battle-conveyor-presentation-core.mjs、飛ばしは
// battle-cinematic-skip-runtime-control.mjs、決め・模型・旗は
// battle-start-presentation-core.mjs。対戦の状態・所有権・勝敗は変えない。
// 対戦開始の流れ（startMatch）は変えない。対戦画面の上に重ねるだけの画面で、
// 戦闘のときの BATTLE PHASE の全画面と同じ形。
// ムービーに正式な絵や音は使わない。絵は DOM と CSS の動きだけ。初回の
// 読み込みに重い物は入れない。4人の顔の正式な絵は写しにないため、名前の
// 最初の1文字を丸に入れる（人物の絵がないときの従来の落ち着いた形）。
// 音は、呼び出し側が playSfx を渡したときだけ、表示が立った直後に1回鳴らす
// （候補音の接続口。正式な対戦開始の音はまだない。音が失敗しても表示と
// 対戦は止めない）。
import {
  BATTLE_START_PRESENTATION_CORE,
  advanceBattleStartLiveState,
  buildBattleStartOpeningPlayers,
  buildBattleStartPlan,
  createBattleStartFlagsStore,
  createBattleStartLiveState,
  decideBattleStartPresentation,
} from './battle-start-presentation-core.mjs';
import { mountBattleCinematicSkipRuntime } from './battle-cinematic-skip-runtime-control.mjs';
import {
  BATTLE_START_UNSEEN_REASONS,
  decideBattleStartAfterUnseen,
  recordBattleStartUnseen,
} from './battle-start-unseen-flag-core.mjs';

export const BATTLE_START_PRESENTATION_RUNTIME_SCHEMA = 'gameroad.battle-start-presentation-runtime.v1';

const ORDER_NOTE = BATTLE_START_PRESENTATION_CORE.orderNote;

function safeLocalStorage() {
  try {
    const storage = globalThis.localStorage;
    if (storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function') return storage;
  } catch { /* 端末の保存が使えないときは旗だけ端末の中に残す */ }
  return null;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function isElement(value) {
  return !!value && typeof value.appendChild === 'function' && typeof value.setAttribute === 'function';
}

export function createBattleStartPresentationMount({
  getMatch,
  getHost,
  getSettings,
  describeCard,
  flagsStore = null,
  timers = null,
  skipRuntimeFactory = mountBattleCinematicSkipRuntime,
  playSfx = null,
} = {}) {
  if (typeof getMatch !== 'function') throw new TypeError('BATTLE_START_GET_MATCH_REQUIRED');
  if (typeof getHost !== 'function') throw new TypeError('BATTLE_START_GET_HOST_REQUIRED');
  if (typeof getSettings !== 'function') throw new TypeError('BATTLE_START_GET_SETTINGS_REQUIRED');
  // describeCard は取り付けの決まりとして残す。対戦開始の真ん中ではもう使わない
  // （グー・チョキ・パーの割り当ての表示は、バトルフェーズ側の公開の画面が担う）。
  if (typeof describeCard !== 'function') throw new TypeError('BATTLE_START_DESCRIBE_CARD_REQUIRED');
  if (typeof skipRuntimeFactory !== 'function') throw new TypeError('BATTLE_START_SKIP_RUNTIME_FACTORY_REQUIRED');
  if (playSfx !== null && typeof playSfx !== 'function') throw new TypeError('BATTLE_START_PLAY_SFX_MUST_BE_FUNCTION_OR_NULL');

  const setTimeoutFn = timers?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimeoutFn = timers?.clearTimeout ?? ((id) => globalThis.clearTimeout(id));
  const store = flagsStore ?? createBattleStartFlagsStore({ storage: safeLocalStorage() });

  let active = null;
  let lastResult = null;

  function clearTimers(entry) {
    for (const id of entry.timerIds) {
      try { clearTimeoutFn(id); } catch { /* 止められなくても次へ進む */ }
    }
    entry.timerIds = [];
  }

  function removeOverlay(entry) {
    try {
      entry.skipRuntime?.detach?.();
    } catch { /* 飛ばしの取り外しに失敗しても画面は消す */ }
    try {
      entry.overlay?.removeEventListener?.('click', entry.onOverlayClick);
    } catch { /* なし */ }
    try {
      if (entry.overlay?.parentNode?.removeChild) entry.overlay.parentNode.removeChild(entry.overlay);
    } catch { /* なし */ }
  }

  function dismiss(entry, outcome) {
    if (!active || active !== entry) return lastResult;
    clearTimers(entry);
    try {
      if (entry.live && !['HANDOFF', 'FALLBACK_REQUIRED', 'CANCELLED'].includes(entry.live.phase)) {
        const advanced = advanceBattleStartLiveState(entry.live, { type: 'CANCEL', generationId: entry.generationId });
        entry.live = advanced.live;
      }
    } catch { /* 生の受け渡しの取り消しに失敗しても画面は消す */ }
    removeOverlay(entry);
    if (outcome === 'completed' && entry.decision.mode === 'movie') {
      try { store.markSeen(); } catch { /* 旗が残らなくても対戦は進む */ }
    }
    if (outcome === 'skipped') {
      try { store.markSkipped(); } catch { /* 旗が残らなくても対戦は進む */ }
    }
    if (entry.decision.reason === 'PREVIOUS_NOT_WATCHED') {
      try { store.clearNotWatched(); } catch { /* 旗が残らなくても対戦は進む */ }
    }
    if (entry.clearUnseenAfter === true || entry.decision.reason === 'PREVIOUS_UNSEEN') {
      try { if (typeof store.clearUnseen === 'function') store.clearUnseen(); } catch { /* 旗が残らなくても対戦は進む */ }
    }
    active = null;
    lastResult = freeze({
      ok: true,
      mode: entry.decision.mode,
      reason: entry.decision.reason,
      outcome,
      generationId: entry.generationId,
      totalMs: entry.decision.totalMs,
    });
    return lastResult;
  }

  function buildOverlay(document, decision, opening) {
    const section = document.createElement('section');
    section.className = 'battleStartSurface';
    section.setAttribute('data-mode', decision.mode);
    section.setAttribute('data-phase', 'TITLE');
    section.setAttribute('aria-label', '対戦開始');
    section.setAttribute('aria-live', 'polite');

    const backdrop = document.createElement('div');
    backdrop.className = 'battleStartBackdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    const spread = document.createElement('i');
    spread.className = 'battleStartSpread';
    spread.setAttribute('aria-hidden', 'true');
    backdrop.appendChild(spread);
    section.appendChild(backdrop);

    const title = document.createElement('h1');
    title.className = 'battleStartTitle';
    title.textContent = 'BATTLE START';
    section.appendChild(title);

    if (decision.mode === 'movie' && opening?.hasData) {
      const janken = document.createElement('div');
      janken.className = 'battleStartJanken';
      janken.setAttribute('data-role', 'janken');
      // 夜の闘技場の残りの演出（33番）：じゃんけんの枠の青い炎。炎の色は夜の
      // 闘技場の濃い青紫に合わせ、P2の青とは別の色に見せる（battle-start-movie.css）。
      // 動きを減らす設定ではムービー自体が題だけになるため、ここでは炎は常に動かす。
      janken.setAttribute('data-effect', 'janken-blue-flame');
      for (const player of opening.players) {
        const card = document.createElement('div');
        card.className = 'battleStartPlayer';
        card.setAttribute('data-player', player.playerId);
        const avatar = document.createElement('span');
        avatar.className = 'battleStartAvatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = player.name.slice(0, 1);
        card.appendChild(avatar);
        const name = document.createElement('span');
        name.className = 'battleStartName';
        name.textContent = player.name;
        card.appendChild(name);
        const seat = document.createElement('span');
        seat.className = 'battleStartSeat';
        seat.textContent = player.team ? `${player.seat}・${player.team}組` : player.seat;
        card.appendChild(seat);
        janken.appendChild(card);
      }
      section.appendChild(janken);
      const note = document.createElement('p');
      note.className = 'battleStartOrderNote';
      note.textContent = ORDER_NOTE;
      section.appendChild(note);
    }
    return section;
  }

  // 「見られなかった」を旗として残す。理由が3つのうちの1つでなければ残さない
  // （35番の核 recordBattleStartUnseen の決まり）。旗が残らなくても対戦は進む。
  function markUnseenFlag(reason) {
    try {
      if (typeof store.markUnseen !== 'function') return;
      const next = recordBattleStartUnseen(store.read(), reason);
      if (next.unseen) store.markUnseen(next.unseen);
    } catch { /* 旗が残らなくても対戦は進む */ }
  }

  function present() {
    if (active) return freeze({ ok: false, reason: 'ALREADY_PRESENTING' });
    let match;
    try {
      match = getMatch();
    } catch {
      return freeze({ ok: false, reason: 'MATCH_READ_FAILED' });
    }
    if (!match || !Array.isArray(match.players) || match.players.length < 2) {
      return freeze({ ok: false, reason: 'NO_MATCH' });
    }
    if (match.round !== 1) return freeze({ ok: false, reason: 'NOT_FIRST_ROUND' });

    let settings = {};
    try {
      settings = getSettings() || {};
    } catch {
      settings = {};
    }
    const flags = store.read();
    // 「見られなかった」旗があるときは、次は「題だけ」（600ms）。既存の決め
    // decideBattleStartPresentation より先に入れる（35番の核の決まり通り）。
    // 「見ない」（パージ）でも題は出るため、見た目は同じ題だけになる。
    const unseenDecision = decideBattleStartAfterUnseen(flags);
    let clearUnseenAfter = false;
    let decision;
    if (unseenDecision.presentation === 'title-only') {
      clearUnseenAfter = unseenDecision.clearUnseenAfter === true;
      decision = freeze({ mode: 'title_only', titleDurationMs: 600, entryDurationMs: 90, totalMs: 600, reason: 'PREVIOUS_UNSEEN' });
    } else {
      decision = decideBattleStartPresentation({
        setting: settings.movie,
        flags,
        reducedMotion: settings.reducedMotion === true,
        lowPerf: settings.lowPerf === true,
      });
    }
    if (decision.mode === 'none') {
      lastResult = freeze({ ok: true, mode: 'none', reason: decision.reason, outcome: 'not_shown', generationId: null, totalMs: 0 });
      return lastResult;
    }

    let opening = null;
    if (decision.mode === 'movie') {
      // 真ん中は題＋4人の顔・名前・パートナーだけ（2026-11-09 02:55 JST、ライカの決め）。
      // グー・チョキ・パーの割り当てはここでは要らないため、4人の模型だけ作る。
      try {
        opening = buildBattleStartOpeningPlayers({ players: match.players });
      } catch {
        opening = null;
      }
      if (!opening?.hasData) {
        // 4人の顔・名前がそろわないときは、題だけ出す。
        decision = freeze({ mode: 'title_only', titleDurationMs: 600, entryDurationMs: 90, totalMs: 600, reason: 'OPENING_PLAYERS_UNAVAILABLE' });
        opening = null;
      }
    }

    let plan;
    let planAudit;
    try {
      const built = buildBattleStartPlan(decision);
      plan = built.plan;
      planAudit = built.audit;
    } catch {
      plan = null;
      planAudit = { ok: false };
    }
    if (!planAudit?.ok && decision.mode === 'movie') {
      decision = freeze({ mode: 'title_only', titleDurationMs: 600, entryDurationMs: 90, totalMs: 600, reason: 'PLAN_AUDIT_FAILED' });
      try {
        const built = buildBattleStartPlan(decision);
        plan = built.plan;
        planAudit = built.audit;
      } catch {
        plan = null;
        planAudit = { ok: false };
      }
    }
    if (!planAudit?.ok) {
      // 計画が作れず、題すら出せなかった。次は題だけ出す（35番の核）。
      markUnseenFlag('no-screen');
      return freeze({ ok: false, reason: 'PLAN_AUDIT_FAILED' });
    }

    const generationId = `battle-start:${match.id}`;
    let liveState;
    try {
      const created = createBattleStartLiveState({ decision, generationId });
      if (!created.audit.ok) {
        markUnseenFlag('no-screen');
        return freeze({ ok: false, reason: 'LIVE_STATE_AUDIT_FAILED' });
      }
      liveState = created.live;
    } catch {
      markUnseenFlag('no-screen');
      return freeze({ ok: false, reason: 'LIVE_STATE_FAILED' });
    }

    let host;
    try {
      host = getHost();
    } catch {
      // 対戦画面がない。次は題だけ出す（35番の核）。
      markUnseenFlag('no-battle-screen');
      return freeze({ ok: false, reason: 'HOST_READ_FAILED' });
    }
    if (!isElement(host)) {
      markUnseenFlag('no-battle-screen');
      return freeze({ ok: false, reason: 'HOST_UNAVAILABLE' });
    }
    const document = host.ownerDocument ?? globalThis.document;
    if (!document || typeof document.createElement !== 'function') {
      markUnseenFlag('no-battle-screen');
      return freeze({ ok: false, reason: 'HOST_UNAVAILABLE' });
    }

    const entry = {
      generationId,
      decision,
      clearUnseenAfter,
      plan,
      live: liveState,
      timerIds: [],
      overlay: null,
      skipRuntime: null,
      onOverlayClick: null,
    };

    let overlay;
    try {
      overlay = buildOverlay(document, decision, opening);
    } catch {
      markUnseenFlag('no-screen');
      return freeze({ ok: false, reason: 'OVERLAY_BUILD_FAILED' });
    }
    entry.overlay = overlay;

    try {
      host.appendChild(overlay);
    } catch {
      markUnseenFlag('no-screen');
      return freeze({ ok: false, reason: 'OVERLAY_MOUNT_FAILED' });
    }

    // 飛ばしは、すでにある戦闘演出の飛ばしの取り付けにまかせる。
    try {
      entry.skipRuntime = skipRuntimeFactory({
        phaseSurface: overlay,
        pointerTarget: overlay,
        document,
        getContext: () => ({ allowedInputs: ['skip'], eventId: generationId, phase: entry.live?.phase ?? null }),
        getAuthoritativeState: () => match,
        onPresentationCommand: () => { dismiss(entry, 'skipped'); },
      });
    } catch {
      entry.skipRuntime = null;
    }

    entry.onOverlayClick = (event) => {
      if (entry.skipRuntime && event?.target === entry.skipRuntime.button) return;
      if (entry.skipRuntime) {
        try { entry.skipRuntime.skipByButton(); } catch { dismiss(entry, 'skipped'); }
      } else {
        dismiss(entry, 'skipped');
      }
    };
    try {
      overlay.addEventListener('click', entry.onOverlayClick);
    } catch { /* 押して飛ばせなくても2秒で消える */ }

    // 動きの絵は DOM と CSS だけのため、読み込みを待たずに用意できたことにする。
    try {
      const advanced = advanceBattleStartLiveState(entry.live, { type: 'MOVIE_READY', generationId });
      entry.live = advanced.live;
    } catch { /* 生の受け渡しが進まなくてもタイマーで消える */ }

    active = entry;
    // 対戦開始の音（候補）は表示が立った直後に1回だけ。題だけの表示でも鳴らす
    // （ムービーのパージは絵の話で、音は効果音の設定が別に担う）。
    // 失敗しても表示と対戦は止めない。
    if (playSfx) {
      try {
        playSfx('battleStart', freeze({
          mode: decision.mode,
          reason: decision.reason,
          generationId,
          presentationOnly: true,
          gameStateWrite: false,
        }));
      } catch { /* 音が出なくても対戦は進む */ }
    }
    if (decision.mode === 'movie') {
      entry.timerIds.push(setTimeoutFn(() => {
        if (active !== entry) return;
        try {
          const advanced = advanceBattleStartLiveState(entry.live, { type: 'ADVANCE', generationId, nowMs: decision.titleDurationMs });
          entry.live = advanced.live;
          overlay.setAttribute('data-phase', entry.live.phase);
        } catch { /* 段が進まなくても消えるタイマーは動く */ }
      }, decision.titleDurationMs));
      entry.timerIds.push(setTimeoutFn(() => {
        if (active !== entry) return;
        try {
          const advanced = advanceBattleStartLiveState(entry.live, { type: 'ADVANCE', generationId, nowMs: decision.totalMs });
          entry.live = advanced.live;
          overlay.setAttribute('data-phase', entry.live.phase);
        } catch { /* なし */ }
        dismiss(entry, 'completed');
      }, decision.totalMs));
    } else {
      entry.timerIds.push(setTimeoutFn(() => {
        if (active !== entry) return;
        dismiss(entry, 'completed');
      }, decision.totalMs));
    }

    lastResult = freeze({
      ok: true,
      mode: decision.mode,
      reason: decision.reason,
      outcome: 'presenting',
      generationId,
      totalMs: decision.totalMs,
      handoffAt: plan.handoffAt,
    });
    return lastResult;
  }

  function snapshot() {
    return freeze({
      schema: BATTLE_START_PRESENTATION_RUNTIME_SCHEMA,
      presenting: active !== null,
      mode: active?.decision.mode ?? null,
      phase: active?.live.phase ?? null,
      generationId: active?.generationId ?? null,
      lastResult,
    });
  }

  return freeze({
    schema: BATTLE_START_PRESENTATION_RUNTIME_SCHEMA,
    present,
    snapshot,
    dismissActive: () => (active ? dismiss(active, 'skipped') : lastResult),
    // 本物の流れの外で「見られなかった」を残すときの入口。友だちの部屋の
    // 参加者側が遅れて入ったときなどに、GAMEROAD.html から呼ぶ。理由が3つの
    // うちの1つでなければ残さない（35番の核の決まり）。
    recordUnseen(reason) {
      if (!BATTLE_START_UNSEEN_REASONS.includes(reason)) return snapshot().lastResult;
      markUnseenFlag(reason);
      return snapshot().lastResult;
    },
  });
}

export const BATTLE_START_PRESENTATION_RUNTIME = freeze({
  schema: BATTLE_START_PRESENTATION_RUNTIME_SCHEMA,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  orderAuthority: 'NONE_AT_BATTLE_START',
  sfxHook: 'OPTIONAL_INJECTED_PLAY_SFX',
  formalSfxOwned: false,
});
