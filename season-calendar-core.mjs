// season-calendar-core.mjs -- S1-01
// Pure date -> state core for GAMEROAD Season 1 and the annual calendar.
// Plan: GAMEROAD-シーズンとイベント-年間予定と第1シーズン実装計画-20261108.md
// Rules implemented here (all dates are JST, year-agnostic, no leap year):
// - Season: 3 months, starts Jan / Apr / Jul / Oct. S1 = Jan 1 - Mar 31 (90 days).
// - Rank cycle: 1st-14th (first half) and 15th-end of month (second half), 24/year.
// - Monthly events: A drop 1-10, B weekly missions 4-10, festival announce 1-10,
//   festival yobi (vote) 11th 09:00 - 19th 09:00, festival main 19th 09:00 -
//   21st 09:00 (Dec grand festival: 19th 09:00 - 22nd 09:00), results +2h after
//   main ends, D exchange 22nd - end of month.
// - Catalog boost: season month 2, days 15-21 = x1.5; season month 3,
//   days 22-end = x2. Season opening week (season month 1, days 1-7) = trial.
// This module takes explicit {month, day, hour} inputs and never reads the
// clock, so every boundary is testable. No purchase, no server, no publish.

export const SEASON_START_MONTHS = Object.freeze([1, 4, 7, 10]);
export const DAYS_IN_MONTH_NON_LEAP = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
export const CATALOG_LEVELS = 100;
export const CATALOG_POINTS_PER_LEVEL = 100;
export const FESTIVAL_MAIN_START_DAY = 19;
export const FESTIVAL_MAIN_START_HOUR = 9;
export const FESTIVAL_MAIN_END_DAY = 21;
export const FESTIVAL_GRAND_END_DAY = 22;

const SEASON_NAMES_PROVISIONAL = Object.freeze([
  'はじまりの石板',
  '化石発掘と恐竜',
  '夏の海とお祭り',
  '実りと年末の大祭り',
]);

function assertDate(month, day, hour) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  const maxDay = DAYS_IN_MONTH_NON_LEAP[month - 1];
  if (!Number.isInteger(day) || day < 1 || day > maxDay) throw new TypeError('DAY_INVALID');
  if (hour !== undefined && (!Number.isInteger(hour) || hour < 0 || hour > 23)) throw new TypeError('HOUR_INVALID');
  return { month, day, hour: hour === undefined ? 9 : hour };
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

// Which of the four seasons a month belongs to (0-3), and its month inside it (1-3).
export function getSeasonForMonth(month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  const seasonIndex = SEASON_START_MONTHS.findIndex((start, i) => {
    const next = SEASON_START_MONTHS[(i + 1) % SEASON_START_MONTHS.length];
    return i < 3 ? month >= start && month < next : month >= start;
  });
  const startMonth = SEASON_START_MONTHS[seasonIndex];
  const monthInSeason = month - startMonth + 1;
  const daysInSeason = [0, 1, 2].reduce(
    (sum, offset) => sum + DAYS_IN_MONTH_NON_LEAP[(startMonth - 1 + offset) % 12], 0,
  );
  const dayInSeason = [0, 1, 2].slice(0, monthInSeason - 1).reduce(
    (sum, offset) => sum + DAYS_IN_MONTH_NON_LEAP[(startMonth - 1 + offset) % 12], 0,
  );
  return freeze({
    seasonIndex,
    seasonId: `S${seasonIndex + 1}`,
    nameProvisional: SEASON_NAMES_PROVISIONAL[seasonIndex],
    startMonth,
    endMonth: ((startMonth + 1) % 12) + 1,
    monthInSeason,
    daysInSeason,
    dayOffsetInSeason: dayInSeason,
  });
}

export function getSeasonForDate(input) {
  const { month, day, hour } = assertDate(input?.month, input?.day, input?.hour);
  const season = getSeasonForMonth(month);
  const dayInSeason = season.dayOffsetInSeason + day;
  const isOpeningWeek = season.monthInSeason === 1 && day <= 7;
  const isMidBoost = season.monthInSeason === 2 && day >= 15 && day <= 21;
  const isFinalRush = season.monthInSeason === 3 && day >= 22;
  const isSeasonEndDay = season.monthInSeason === 3 && day === DAYS_IN_MONTH_NON_LEAP[month - 1];
  const nextSeasonPreview = season.monthInSeason === 3 && day >= 26;
  return freeze({
    ...season,
    month,
    day,
    hour,
    dayInSeason,
    daysLeftInSeason: season.daysInSeason - dayInSeason,
    isOpeningWeek,
    isMidBoost,
    isFinalRush,
    isSeasonEndDay,
    nextSeasonPreview,
    catalogMultiplier: isFinalRush ? 2 : isMidBoost ? 1.5 : 1,
  });
}

// Rank cycle: first half 1-14, second half 15-end. Phase mirrors the existing
// auto-rank registration core: REGISTRATION (day before start), OPENING
// (first 3 days), REGULAR (middle), FINAL (last 3 days), CLOSED (after end,
// until the next cycle starts -- only observable at month boundaries here).
export function getRankCycleForDate(input) {
  const { month, day, hour } = assertDate(input?.month, input?.day, input?.hour);
  const lastDay = DAYS_IN_MONTH_NON_LEAP[month - 1];
  const half = day <= 14 ? 'first' : 'second';
  const startDay = half === 'first' ? 1 : 15;
  const endDay = half === 'first' ? 14 : lastDay;
  const dayInCycle = day - startDay + 1;
  const daysInCycle = endDay - startDay + 1;
  const daysLeft = endDay - day;
  let phase = 'REGULAR';
  if (dayInCycle <= 3) phase = 'OPENING';
  else if (daysLeft <= 2) phase = 'FINAL';
  return freeze({
    cycleId: `R-${String(month).padStart(2, '0')}-${half}`,
    month,
    half,
    startDay,
    endDay,
    dayInCycle,
    daysInCycle,
    daysLeft,
    phase,
    hour,
    // Festival main (19th 09:00 - 21st 09:00, Dec to 22nd 09:00) pauses rank.
    pausedForFestival: isFestivalMainTime({ month, day, hour }),
  });
}

export function isFestivalMainTime(input) {
  const { month, day, hour } = assertDate(input?.month, input?.day, input?.hour);
  const endDay = month === 12 ? FESTIVAL_GRAND_END_DAY : FESTIVAL_MAIN_END_DAY;
  const afterStart = day > FESTIVAL_MAIN_START_DAY
    || (day === FESTIVAL_MAIN_START_DAY && hour >= FESTIVAL_MAIN_START_HOUR);
  const beforeEnd = day < endDay || (day === endDay && hour < FESTIVAL_MAIN_START_HOUR);
  return afterStart && beforeEnd;
}

// Festival phase for a given moment. Announce runs days 1-10 (with the
// month start), yobi 11th 09:00 - 19th 09:00, main first half until the
// midway announcement on the 20th 09:00, main second half (special battle
// open) until main end, results from main end + 2h until month end.
export function getFestivalPhaseForDate(input) {
  const { month, day, hour } = assertDate(input?.month, input?.day, input?.hour);
  const lastDay = DAYS_IN_MONTH_NON_LEAP[month - 1];
  const endDay = month === 12 ? FESTIVAL_GRAND_END_DAY : FESTIVAL_MAIN_END_DAY;
  const resultsHour = FESTIVAL_MAIN_START_HOUR + 2; // 11:00
  const beforeYobi = day < 11 || (day === 11 && hour < FESTIVAL_MAIN_START_HOUR);
  if (beforeYobi) return freeze({ phase: 'announce', month, day, hour, endDay, resultsHour });
  const beforeMain = day < FESTIVAL_MAIN_START_DAY
    || (day === FESTIVAL_MAIN_START_DAY && hour < FESTIVAL_MAIN_START_HOUR);
  if (beforeMain) return freeze({ phase: 'yobi', month, day, hour, endDay, resultsHour });
  if (isFestivalMainTime({ month, day, hour })) {
    const midway = day > 20 || (day === 20 && hour >= FESTIVAL_MAIN_START_HOUR);
    return freeze({ phase: midway ? 'main-second' : 'main-first', month, day, hour, endDay, resultsHour });
  }
  const afterResults = day > endDay || (day === endDay && hour >= resultsHour);
  if (afterResults) return freeze({ phase: 'results', month, day, hour, endDay, resultsHour });
  return freeze({ phase: 'main-ended', month, day, hour, endDay, resultsHour });
}

// Monthly events open at a given moment (plan: monthly type table).
// A = solo drop (1-10), B = weekly missions (4-10), C = festival (phases
// above), D = exchange + emblem chase (22-end). At least one is always open.
export function getMonthlyEventsForDate(input) {
  const { month, day, hour } = assertDate(input?.month, input?.day, input?.hour);
  const festival = getFestivalPhaseForDate({ month, day, hour });
  const events = [];
  if (day >= 1 && day <= 10) events.push(freeze({ id: 'A', kind: 'drop', label: '1人用ドロップ' }));
  if (day >= 4 && day <= 10) events.push(freeze({ id: 'B', kind: 'weekly-missions', label: '1週間のお題' }));
  if (festival.phase === 'yobi') events.push(freeze({ id: 'C-yobi', kind: 'festival-yobi', label: 'お祭りの前夜祭（投票）' }));
  if (festival.phase === 'main-first' || festival.phase === 'main-second') {
    events.push(freeze({ id: 'C-main', kind: 'festival-main', label: 'お祭りの本祭', specialBattleOpen: festival.phase === 'main-second' }));
  }
  if (festival.phase === 'results' || festival.phase === 'main-ended') {
    events.push(freeze({ id: 'C-results', kind: 'festival-results', label: 'お祭りの結果' }));
  }
  if (day >= 22) events.push(freeze({ id: 'D', kind: 'exchange', label: '交換と紋章の追い上げ' }));
  return freeze({ month, day, hour, festivalPhase: festival.phase, events, rankPaused: isFestivalMainTime({ month, day, hour }) });
}

// One-line Japanese summary for the schedule ("予定") screen.
export function describeToday(input) {
  const season = getSeasonForDate(input);
  const rank = getRankCycleForDate(input);
  const monthly = getMonthlyEventsForDate(input);
  const open = monthly.events.map((event) => event.label).join('・') || 'なし';
  const boost = season.catalogMultiplier > 1 ? `（カタログの点が${season.catalogMultiplier}倍）` : '';
  return `第${season.seasonIndex + 1}シーズン「${season.nameProvisional}」${season.monthInSeason}か月目・${season.dayInSeason}日目${boost}。ランクは${rank.half === 'first' ? '前半' : '後半'}（残り${rank.daysLeft}日）。今日できること：${open}。`;
}

// Whole-year check used by S1-17: every day of the year (non-leap, 365 days)
// must have at least one open monthly event. Returns the missing days (empty = OK).
export function checkYearCoverage() {
  const missing = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= DAYS_IN_MONTH_NON_LEAP[month - 1]; day += 1) {
      const open = getMonthlyEventsForDate({ month, day, hour: 12 });
      if (open.events.length === 0) missing.push({ month, day });
    }
  }
  return freeze(missing);
}
