// season-store.mjs -- 第1シーズンの端末の記録（1つだけの置き場所）
// season-home-runtime と season-events-runtime の両方がこの記録を読む・書く。
// 記録の形は version 1 のまま広げる：古い記録（カタログ・投票だけのもの）も
// 読めて、ない所は決まった初期値で埋まる。
//
// 数える置き場所（決め）：第1シーズンのブラウザ版では、この端末の記録
// (localStorage `gameroad.season.s1.v1`) が数える場所。サーバーへは
// 書き込まない。理由：写しではランクの相手探しの登録がまだなく
// （「接続先は未登録」）、お祭りの数を数える受け口もなく、写しには
// マニーの財布（残高の置き場所）もないため。数えるものはすべて番号つきで
// 二重に数えない。サーバー側の記録ができたら、サーバーがこの番号で
// 照らし合わせて1つにまとめる。マニーは台帳（mannyLedger）に残し、
// 財布ができたらそこへ渡す。

import { createClaimBox } from './season-claim-box-core.mjs';
import { WEEKLY_MISSION_IDS, createDropState } from './season-monthly-event-core.mjs';
import { createFestivalState } from './season-festival-core.mjs';
import { createWeeklyMissions } from './season-monthly-event-core.mjs';

export const SEASON_STORE_KEY = 'gameroad.season.s1.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry) => typeof entry === 'string' && entry !== ''))];
}

function cleanFestivalVotes(input) {
  const votes = {};
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input)) {
      if (/^(1?[0-9])$/.test(key) && Number.isInteger(value) && value >= 0 && value <= 2) votes[key] = value;
    }
  }
  return votes;
}

function cleanMissions(input) {
  const base = createWeeklyMissions({ seasonId: 'S1', month: 1 });
  const weekKey = typeof input?.weekKey === 'string' && /^\d{2}$/.test(input.weekKey) ? input.weekKey : '01';
  const counts = {};
  for (const key of ['battles', 'wins', 'grow', 'watch', 'deck', 'partner']) {
    const value = input?.counts?.[key];
    counts[key] = Number.isInteger(value) && value >= 0 ? value : 0;
  }
  const claimed = Array.isArray(input?.done)
    ? [...new Set(input.done.filter((id) => WEEKLY_MISSION_IDS.includes(id)))]
    : [];
  return {
    weekKey,
    counts: Object.freeze(counts),
    done: Object.freeze(claimed),
    allDoneBonusClaimed: input?.allDoneBonusClaimed === true,
    // weekly-missions 核の形に合わせる（done = 受け取ったお題）。
    schema: base.schema,
    seasonId: 'S1',
    month: Number.parseInt(weekKey, 10),
  };
}

function cleanContribution(input, base) {
  const out = {};
  for (const dept of Object.keys(base.contribution)) {
    const values = input?.[dept];
    out[dept] = Array.isArray(values) && values.length === 3
      && values.every((n) => Number.isInteger(n) && n >= 0)
      ? [...values] : [...base.contribution[dept]];
  }
  return Object.freeze(out);
}

function cleanFestival(input, month) {
  // 月が違うときも、ある記録は残す（月の切り替えは ensureCurrentSeasonMonth の役目）。
  const storedMonth = Number.isInteger(input?.month) && input.month >= 1 && input.month <= 12 ? input.month : month;
  const base = createFestivalState({ month: storedMonth });
  if (!input || input.schema !== base.schema) {
    return { ...base, vote: null };
  }
  return {
    ...base,
    vote: Number.isInteger(input.vote) && input.vote >= 0 && input.vote <= 2 ? input.vote : null,
    yobiTokens: Number.isInteger(input.yobiTokens) && input.yobiTokens >= 0 ? input.yobiTokens : 0,
    contribution: cleanContribution(input.contribution, base),
    titleStep: Number.isInteger(input.titleStep) && input.titleStep >= 0 ? Math.min(input.titleStep, 4) : 0,
    festivalPoints: Number.isInteger(input.festivalPoints) && input.festivalPoints >= 0 ? input.festivalPoints : 0,
  };
}

function cleanDrop(input, month) {
  const storedMonth = Number.isInteger(input?.month) && input.month >= 1 && input.month <= 12 ? input.month : month;
  const base = createDropState({ seasonId: 'S1', month: storedMonth });
  if (!input || input.schema !== base.schema) return base;
  const winsByDay = {};
  if (input.winsByDay && typeof input.winsByDay === 'object') {
    for (const [key, value] of Object.entries(input.winsByDay)) {
      if (/^\d{2}-\d{2}$/.test(key) && Number.isInteger(value) && value >= 0) winsByDay[key] = value;
    }
  }
  return { ...base, winsByDay: Object.freeze(winsByDay) };
}

export function cleanSeasonState(input, { month = 1 } = {}) {
  const points = Number.isInteger(input?.catalogPoints) && input.catalogPoints >= 0 ? input.catalogPoints : 0;
  const claimedFree = Array.isArray(input?.claimedFree)
    ? [...new Set(input.claimedFree.filter((n) => Number.isInteger(n) && n >= 1 && n <= 100))].sort((a, b) => a - b)
    : [];
  const festivalVotes = cleanFestivalVotes(input?.festivalVotes);
  const grantedResultKeys = cleanStringList(input?.grantedResultKeys);
  const countedResultKeys = cleanStringList(input?.countedResultKeys);
  const exchangeTokens = Number.isInteger(input?.exchangeTokens) && input.exchangeTokens >= 0 ? input.exchangeTokens : 0;
  const mannyEarned = Number.isInteger(input?.mannyEarned) && input.mannyEarned >= 0 ? input.mannyEarned : 0;
  const mannyLedger = Array.isArray(input?.mannyLedger)
    ? input.mannyLedger.filter((entry) => entry && typeof entry.id === 'string' && Number.isInteger(entry.amount))
    : [];
  const claimBox = createClaimBox({ grants: Array.isArray(input?.claimBox?.grants) ? input.claimBox.grants : [] });
  return freeze({
    version: 1,
    seasonId: 'S1',
    catalogPoints: points,
    claimedFree: Object.freeze(claimedFree),
    festivalVotes: Object.freeze(festivalVotes),
    grantedResultKeys: Object.freeze(grantedResultKeys),
    countedResultKeys: Object.freeze(countedResultKeys),
    exchangeTokens,
    mannyEarned,
    mannyLedger: Object.freeze(mannyLedger),
    missions: freeze(cleanMissions(input?.missions)),
    festival: freeze(cleanFestival(input?.festival, month)),
    drop: freeze(cleanDrop(input?.drop, month)),
    claimBox: freeze(claimBox),
  });
}

// 対戦の結果の番号。結果画面の文（段・見出し・巡・点）と日付から作る。
// 同じ対戦の結果を2回数えないための鍵。カタログの点つけと、ドロップ・
// お祭りの数え方の両方で同じ鍵を使う。
export function buildSeasonResultKey({ grade = '', headline = '', rounds = '', points = '', month, day } = {}) {
  return `${month}-${day}|${grade}|${headline}|${rounds}|${points}`;
}

export function createSeasonStore(storage) {
  const read = (month = 1) => {
    try {
      const raw = storage?.getItem?.(SEASON_STORE_KEY);
      if (!raw) return cleanSeasonState(null, { month });
      return cleanSeasonState(JSON.parse(raw), { month });
    } catch {
      return cleanSeasonState(null, { month });
    }
  };
  const write = (state, month = 1) => {
    const cleaned = cleanSeasonState(state, { month });
    try { storage?.setItem?.(SEASON_STORE_KEY, JSON.stringify(cleaned)); } catch { /* 保存できない端末では画面だけ動く */ }
    return cleaned;
  };
  return Object.freeze({ key: SEASON_STORE_KEY, load: read, save: write });
}

// 今の月のお題の週・お祭り・ドロップに合わせる。月が変わったら、その月の
// ものへ入れ替える（前の月のお題の進みは残さない。受け取ったごほうびの
// 記録（done）とマニーの台帳は残る）。月が同じなら何もしない。
export function ensureCurrentSeasonMonth(state, month) {
  const cleaned = cleanSeasonState(state, { month });
  if (cleaned.missions.weekKey === String(month).padStart(2, '0') && cleaned.festival.month === month && cleaned.drop.month === month) {
    return cleaned;
  }
  const nextMissions = cleaned.missions.weekKey === String(month).padStart(2, '0')
    ? cleaned.missions
    : cleanMissions({ weekKey: String(month).padStart(2, '0') });
  return freeze({
    ...cleaned,
    missions: freeze(nextMissions),
    festival: freeze(cleanFestival(null, month)),
    drop: freeze(cleanDrop(null, month)),
  });
}
