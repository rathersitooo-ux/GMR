// BATTLE START の題とムービー（案A）の決めを、画面に出す前の純粋な核。
// 決めの材料「BATTLE-START-題とムービー-決めの材料.md」の推奨（2026-11-08、
// ライカが案A「BATTLE START」の題を採用）通り。画面・保存・通信には触らない。
// 題→入りの順番と長さは、すでにある計画の部品
// （battle-conveyor-presentation-core.mjs の planBattleStartHandoff /
// createBattleStartLiveHandoff）にまかせ、この核では作り直さない。
//
// 正直な境界：対戦開始の時点では、手番の順番（処理順）はまだ決まっていない。
// 順番は計画を出したあとにロードカードで決まるもの。
// 対戦開始の真ん中は「誰が戦うか」だけ（2026-11-09 02:55 JST、ライカの決め）。
// 題＋4人の顔・名前・パートナーだけで、グー・チョキ・パーの割り当て（数字・
// カード）は出さない。その割り当てはバトルフェーズ側（計画を出した後の公開の
// 画面）へ移す。順番をでっち上げないこと。
import {
  auditBattleStartHandoff,
  auditBattleStartLiveHandoff,
  createBattleStartLiveHandoff,
  planBattleStartHandoff,
  reduceBattleStartLiveHandoff,
} from './battle-conveyor-presentation-core.mjs';

export const BATTLE_START_PRESENTATION_SCHEMA = 'gameroad.battle-start-presentation.v1';
export const BATTLE_START_FLAGS_SCHEMA = 'gameroad.battle-start-flags.v1';
export const BATTLE_START_FLAGS_KEY = 'gameroad.battle-start-flags.v1';
export const BATTLE_START_TITLE_MS = 600;
export const BATTLE_START_ENTRY_MS = 800;
export const BATTLE_START_TITLE_ONLY_MS = 600;
export const BATTLE_START_ENTRY_SCAFFOLD_MS = 90;
export const BATTLE_START_TOTAL_LIMIT_MS = 2000;

export const BATTLE_START_MOVIE_SETTINGS = Object.freeze({
  ALWAYS: 'always',
  FIRST_ONLY: 'first_only',
  NEVER: 'never',
});

export const BATTLE_START_MOVIE_SETTING_LABELS = Object.freeze({
  always: '毎回見る',
  first_only: '初回だけ',
  never: '見ない',
});

export const BATTLE_START_JANKEN_HAND_LABELS = Object.freeze({
  ROCK: 'グー',
  SCISSORS: 'チョキ',
  PAPER: 'パー',
});

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeBattleStartMovieSetting(value) {
  if (value === 'always' || value === 'first_only' || value === 'never') return value;
  return 'first_only';
}

export function nextBattleStartMovieSetting(value) {
  const order = ['always', 'first_only', 'never'];
  const index = order.indexOf(normalizeBattleStartMovieSetting(value));
  return order[(index + 1) % order.length];
}

/**
 * 対戦開始の見せ方を決める。決めの材料の推奨通り。
 * - 「見ない」（パージ）は、動きを減らす設定とは別に、ムービーを出さない。題は止め絵で出す（なんもなしにはしない）。
 * - 前に読み込めなかったときは、次は題だけ出す。
 * - 動きを減らす設定・低性能のときは、題だけ文字で出す（動かさない）。
 * - 「初回だけ」で、すでに見た／飛ばしたときは、題だけ出す。
 * - それ以外は、短い動きの絵のムービーを出す（題0.6秒＋入り0.8秒＝1.4秒）。
 */
export function decideBattleStartPresentation({
  setting,
  flags,
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  const movieSetting = normalizeBattleStartMovieSetting(setting);
  const seen = flags?.seen === true;
  const skipped = flags?.skipped === true;
  const notWatched = flags?.notWatched === true;
  if (movieSetting === 'never') {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'SETTING_NEVER_PURGED' });
  }
  if (notWatched) {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'PREVIOUS_NOT_WATCHED' });
  }
  if (reducedMotion === true) {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'REDUCED_MOTION' });
  }
  if (lowPerf === true) {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'LOW_PERF' });
  }
  if (movieSetting === 'first_only' && seen) {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'ALREADY_SEEN_TITLE_ONLY' });
  }
  if (movieSetting === 'first_only' && skipped) {
    return freeze({ mode: 'title_only', titleDurationMs: BATTLE_START_TITLE_ONLY_MS, entryDurationMs: BATTLE_START_ENTRY_SCAFFOLD_MS, totalMs: BATTLE_START_TITLE_ONLY_MS, reason: 'ALREADY_SHOWN_TITLE_ONLY' });
  }
  return freeze({
    mode: 'movie',
    titleDurationMs: BATTLE_START_TITLE_MS,
    entryDurationMs: BATTLE_START_ENTRY_MS,
    totalMs: BATTLE_START_TITLE_MS + BATTLE_START_ENTRY_MS,
    reason: movieSetting === 'always' ? 'SETTING_ALWAYS' : 'FIRST_VIEW',
  });
}

/**
 * 決めを、すでにある題→入りの計画の部品にのせる。監査が通らなければ
 * 呼び出し側は題だけの静かな形へ落とすこと。
 */
export function buildBattleStartPlan(decision) {
  if (!decision || decision.mode === 'none') throw new TypeError('BATTLE_START_PLAN_DECISION_REQUIRED');
  const titleDurationMs = decision.titleDurationMs;
  const entryDurationMs = decision.entryDurationMs;
  const plan = planBattleStartHandoff({
    prewarmStartMs: 0,
    readyBarrierMs: 0,
    titleDurationMs,
    entryDurationMs,
    movieReadyAtMs: titleDurationMs + entryDurationMs,
    reducedMotion: false,
    lowPerf: false,
  });
  const audit = auditBattleStartHandoff(plan);
  return freeze({ plan, audit });
}

export function createBattleStartLiveState({ decision, generationId } = {}) {
  if (!decision || decision.mode === 'none') throw new TypeError('BATTLE_START_LIVE_DECISION_REQUIRED');
  if (typeof generationId !== 'string' || !generationId) throw new TypeError('BATTLE_START_GENERATION_ID_REQUIRED');
  const live = createBattleStartLiveHandoff({
    generationId,
    prewarmStartMs: 0,
    readyBarrierMs: 0,
    titleDurationMs: decision.titleDurationMs,
    entryDurationMs: decision.entryDurationMs,
    maxBridgeMs: 0,
    reducedMotion: false,
    lowPerf: false,
  });
  return freeze({ live, audit: auditBattleStartLiveHandoff(live) });
}

export function advanceBattleStartLiveState(live, event) {
  const next = reduceBattleStartLiveHandoff(live, event);
  return freeze({ live: next, audit: auditBattleStartLiveHandoff(next) });
}

/**
 * 対戦開始の真ん中に出す4人の模型を作る（2026-11-09 02:55 JST、ライカの決め）。
 * 題＋4人の顔・名前・パートナーだけ。グー・チョキ・パーの割り当ては要らない
 * （割り当てはバトルフェーズ側の公開の画面が出す）。正式な顔の絵は写しにない
 * ため、ここでは名前だけを扱い、丸の1文字は画面側が名前から作る。
 */
export function buildBattleStartOpeningPlayers({ players } = {}) {
  if (!Array.isArray(players)) throw new TypeError('BATTLE_START_PLAYERS_REQUIRED');
  const normalized = players.map((player, index) => {
    const playerId = typeof player?.id === 'string' && player.id ? player.id : `P${index + 1}`;
    const name = typeof player?.name === 'string' && player.name ? player.name : playerId;
    const team = typeof player?.team === 'string' && player.team ? player.team : null;
    return freeze({ playerId, name, seat: playerId, team });
  });
  const hasData = normalized.length >= 2;
  return freeze({ players: normalized, playerCount: normalized.length, hasData });
}

/**
 * バトルフェーズ側（計画を出した後の公開の画面）のための、グー・チョキ・パー
 * の3枠の割り当ての模型。対戦開始の真ん中ではもう出さない（2026-11-09 02:55 JST、
 * ライカの決め）。公開の画面はこの模型の形で各人の割り当てを出す。
 * （グー・チョキ・パーの3枠に割り当てた実物のカード）だけを使う。処理順は
 * ここでは作らない（対戦開始の時点ではまだ決まっていないため）。
 * カードの見た目（名前・数字・マーク）は describeCard が渡す。正式な顔の絵は
 * 写しにないため、ここでは扱わない。
 */
export function buildBattleStartOpeningJanken({ players, describeCard } = {}) {
  if (!Array.isArray(players)) throw new TypeError('BATTLE_START_PLAYERS_REQUIRED');
  if (typeof describeCard !== 'function') throw new TypeError('BATTLE_START_DESCRIBE_CARD_REQUIRED');
  const normalized = players.map((player, index) => {
    const playerId = typeof player?.id === 'string' && player.id ? player.id : `P${index + 1}`;
    const name = typeof player?.name === 'string' && player.name ? player.name : playerId;
    const team = typeof player?.team === 'string' && player.team ? player.team : null;
    const slots = Array.isArray(player?.openingJankenAssignment?.slots)
      ? player.openingJankenAssignment.slots
        .filter((slot) => slot && slot.cardId && slot.status !== 'EMPTY_DISABLED')
        .map((slot) => {
          const handLabel = BATTLE_START_JANKEN_HAND_LABELS[slot.jankenHand];
          if (!handLabel) return null;
          const card = describeCard(slot.cardId) || {};
          return freeze({
            hand: slot.jankenHand,
            handLabel,
            cardId: slot.cardId,
            label: typeof card.label === 'string' && card.label ? card.label : slot.cardId,
            rank: card.rank ?? '?',
            suitGlyph: typeof card.suitGlyph === 'string' && card.suitGlyph ? card.suitGlyph : '◆',
          });
        })
        .filter(Boolean)
      : [];
    return freeze({ playerId, name, seat: playerId, team, slots, hasSlots: slots.length > 0 });
  });
  const hasData = normalized.length >= 2 && normalized.every((player) => player.hasSlots);
  return freeze({ players: normalized, playerCount: normalized.length, hasData });
}

/**
 * 見た・飛ばした・見られなかった、の4つの旗を端末の保存に残す。サーバー側の
 * 保存はまだないため、端末の保存（localStorage）だけを使う。保存が使え
 * ないときは端末の中だけ（メモリ）に残す。見られなかった旗は、題だけ出した
 * 次の回で消す（「次回はムービーを出さない」が1回だけの扱いになる）。
 * 「見られなかった」の理由（no-screen / no-battle-screen / participant-entry）は
 * battle-start-unseen-flag-core.mjs が決める。ここは理由の文字をそのまま残すだけ。
 */
export function createBattleStartFlagsStore({ storage = null, now = () => Date.now() } = {}) {
  const key = BATTLE_START_FLAGS_KEY;
  let memoryRaw = null;
  const blank = () => freeze({ schema: BATTLE_START_FLAGS_SCHEMA, seen: false, skipped: false, notWatched: false, unseen: null, updatedAt: null });

  function readRaw() {
    try {
      const raw = storage?.getItem?.(key);
      if (typeof raw === 'string') return raw;
    } catch { /* 端末の保存が読めないときはメモリへ落ちる */ }
    return memoryRaw;
  }
  function writeRaw(raw) {
    memoryRaw = raw;
    try {
      storage?.setItem?.(key, raw);
    } catch { /* 端末の保存が書けないときはメモリだけに残す */ }
  }
  function read() {
    const raw = readRaw();
    if (!raw) return blank();
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== BATTLE_START_FLAGS_SCHEMA) return blank();
      return freeze({
        schema: BATTLE_START_FLAGS_SCHEMA,
        seen: parsed.seen === true,
        skipped: parsed.skipped === true,
        notWatched: parsed.notWatched === true,
        unseen: typeof parsed.unseen === 'string' && parsed.unseen ? parsed.unseen : null,
        updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : null,
      });
    } catch {
      return blank();
    }
  }
  function write(flags) {
    const next = freeze({
      schema: BATTLE_START_FLAGS_SCHEMA,
      seen: flags.seen === true,
      skipped: flags.skipped === true,
      notWatched: flags.notWatched === true,
      unseen: typeof flags.unseen === 'string' && flags.unseen ? flags.unseen : null,
      updatedAt: now(),
    });
    writeRaw(JSON.stringify(next));
    return clone(next);
  }
  return freeze({
    schema: BATTLE_START_FLAGS_SCHEMA,
    key,
    read,
    markSeen() { const current = read(); return write({ ...current, seen: true }); },
    markSkipped() { const current = read(); return write({ ...current, skipped: true }); },
    markNotWatched() { const current = read(); return write({ ...current, notWatched: true }); },
    clearNotWatched() { const current = read(); return write({ ...current, notWatched: false }); },
    markUnseen(reason) { const current = read(); return write({ ...current, unseen: typeof reason === 'string' && reason ? reason : null }); },
    clearUnseen() { const current = read(); return write({ ...current, unseen: null }); },
  });
}

export const BATTLE_START_PRESENTATION_CORE = freeze({
  schema: BATTLE_START_PRESENTATION_SCHEMA,
  flagsSchema: BATTLE_START_FLAGS_SCHEMA,
  flagsKey: BATTLE_START_FLAGS_KEY,
  titleMs: BATTLE_START_TITLE_MS,
  entryMs: BATTLE_START_ENTRY_MS,
  titleOnlyMs: BATTLE_START_TITLE_ONLY_MS,
  totalLimitMs: BATTLE_START_TOTAL_LIMIT_MS,
  movieSettings: { ...BATTLE_START_MOVIE_SETTINGS },
  orderAuthority: 'NONE_AT_BATTLE_START',
  orderNote: '手番の順番は、計画を出したあとに決まる',
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
});
