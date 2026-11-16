// season-s1-config.mjs -- S1-02
// Single data table for the annual calendar and Season 1 (Jan-Mar).
// All numbers are the plan's provisional baseline values; change them here
// only. Season names, release timing, pass price, Pack 1 theme and the vote
// feature itself stay decision-waiting -- this file holds provisional values
// so the code can run, it does not decide them.
// Plan: GAMEROAD-シーズンとイベント-年間予定と第1シーズン実装計画-20261108.md

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export const FESTIVAL_DEPARTMENT_POINTS = freeze({
  yobiTokens: 7,
  votes: 8,
  openBattles: 12,
  soloBattles: 12,
  specialBattles: 18,
  total: 57,
});

export const FESTIVAL_TITLE_STEPS = freeze([
  { id: 'participant', label: '参加者', shellsWin: 12, shellsLose: 10 },
  { id: 'supporter', label: '応援者', shellsWin: 15, shellsLose: 13 },
  { id: 'guardian', label: '守り手', shellsWin: 18, shellsLose: 16 },
  { id: 'champion', label: '勝者', shellsWin: 21, shellsLose: 19 },
  { id: 'eternal', label: 'えいえんの〇〇', shellsWin: 24, shellsLose: 21 },
]);

// Catalog: 1 level = 100 points, 100 levels. Milestones carry the fixed
// rewards; every other level rotates manny / pack material / growth material.
export const CATALOG_MILESTONES = freeze({
  1: { free: { kind: 'manny', amount: 100 }, pass: { kind: 'sleeve', id: 's1-season-sleeve' } },
  5: { free: { kind: 'pack-ticket', amount: 1 }, pass: { kind: 'manny', amount: 300 } },
  10: { free: { kind: 'icon', id: 's1-stone-tablet-icon' }, pass: { kind: 'icon-frame', id: 's1-gold-frame' } },
  20: { free: { kind: 'pack-ticket', amount: 2 }, pass: { kind: 'partner-costume', id: 's1-partner-top' } },
  30: { free: { kind: 'sleeve', id: 's1-spring-sleeve' }, pass: { kind: 'manny', amount: 500 } },
  40: { free: { kind: 'pack-ticket', amount: 2 }, pass: { kind: 'title', id: 'season-traveller' } },
  50: { free: { kind: 'card-look', id: 's1-stone-card-look' }, pass: { kind: 'partner-lines', id: 's1-partner-lines' } },
  60: { free: { kind: 'pack-ticket', amount: 3 }, pass: { kind: 'manny', amount: 800 } },
  70: { free: { kind: 'icon-frame', id: 's1-season-frame' }, pass: { kind: 'partner-costume', id: 's1-partner-bottom' } },
  80: { free: { kind: 'pack-ticket', amount: 3 }, pass: { kind: 'battle-start-look', id: 's1-light-start' } },
  90: { free: { kind: 'sleeve', id: 's1-glowing-sleeve' }, pass: { kind: 'manny', amount: 1000 } },
  100: { free: { kind: 'title', id: 'stone-guardian' }, pass: { kind: 'sleeve', id: 's1-special-sleeve' } },
});

export const CATALOG_ROTATION = freeze([
  { kind: 'manny', amount: 50 },
  { kind: 'pack-material', amount: 1 },
  { kind: 'growth-material', amount: 1 },
  { kind: 'manny', amount: 100 },
]);

export const CATALOG_POINT_SOURCES = freeze({
  battle: 10,
  mission: 15,
  dailyAllDoneBonus: 20,
  pointsPerLevel: 100,
  maxLevel: 100,
  graceDays: 7,
  // Leftover points convert at 100 points = 10 manny after the grace period.
  leftoverPointsPerManny: 10,
});

// NOTE (3a 2026-11-16): PASS design (public 57bc3fa) and CATALOG design (main) both
// live in this branch. Neither table is dropped here: PASS consumers
// (shop-charge-runtime, season-pass-core) need the PASS names, CATALOG
// consumers (season-home-runtime, season-catalog-core, season-closing-core)
// need the CATALOG names. Which design the season uses is still open
// (season lane / ライカ decides); this merge only makes both importable.
// Pass: 1 level = 1000 points, 50 levels. Battle results grant points by
// outcome (win 250 / lose 100). There is no point multiplier anywhere: the
// old 1.5x/2x boost weeks were removed with the pass rebuild. Milestones
// carry the fixed rewards; every other level rotates manny / pack material /
// growth material.
// Battle pass price is 500 yen (ライカの仕様）; the flagship reward is the
// partner skin at level 40.
export const BATTLE_PASS_PRICE_YEN = 500;
export const BATTLE_PASS_FLAGSHIP_LEVEL = 40;
export const PASS_MILESTONES = freeze({
  1: { free: { kind: 'manny', amount: 100 }, pass: { kind: 'sleeve', id: 's1-season-sleeve' } },
  5: { free: { kind: 'pack-ticket', amount: 1 }, pass: { kind: 'manny', amount: 300 } },
  10: { free: { kind: 'icon', id: 's1-stone-tablet-icon' }, pass: { kind: 'icon-frame', id: 's1-gold-frame' } },
  15: { free: { kind: 'pack-ticket', amount: 2 }, pass: { kind: 'partner-costume', id: 's1-partner-top' } },
  20: { free: { kind: 'sleeve', id: 's1-spring-sleeve' }, pass: { kind: 'manny', amount: 500 } },
  25: { free: { kind: 'pack-ticket', amount: 2 }, pass: { kind: 'title', id: 'season-traveller' } },
  30: { free: { kind: 'card-look', id: 's1-stone-card-look' }, pass: { kind: 'partner-lines', id: 's1-partner-lines' } },
  35: { free: { kind: 'pack-ticket', amount: 3 }, pass: { kind: 'manny', amount: 800 } },
  40: { free: { kind: 'icon-frame', id: 's1-season-frame' }, pass: { kind: 'partner-skin', id: 's1-flagship-partner-skin' } },
  45: { free: { kind: 'pack-ticket', amount: 3 }, pass: { kind: 'battle-start-look', id: 's1-light-start' } },
  50: { free: { kind: 'title', id: 'stone-guardian' }, pass: { kind: 'sleeve', id: 's1-special-sleeve' } },
});

// Display names for fixed rewards (ids in the milestone table above).
export const BATTLE_PASS_REWARD_NAMES = freeze({
  's1-season-sleeve': 'はじまりのスリーブ',
  's1-stone-tablet-icon': '石板のアイコン',
  's1-gold-frame': '金の枠',
  's1-partner-top': 'パートナーの衣装（上）',
  's1-spring-sleeve': '春のスリーブ',
  'season-traveller': '旅人の称号',
  's1-stone-card-look': '石板のカード見た目',
  's1-partner-lines': 'パートナーの台詞セット',
  's1-season-frame': 'シーズンの枠',
  's1-flagship-partner-skin': 'パートナースキン（目玉）',
  's1-light-start': '光の開幕演出',
  'stone-guardian': '石の守り手の称号',
  's1-special-sleeve': '特別なスリーブ',
});

// One-line Japanese label for a reward, for the pass screen.
export function battlePassRewardLabel(reward) {
  if (!reward || typeof reward !== 'object') throw new TypeError('REWARD_REQUIRED');
  switch (reward.kind) {
    case 'manny': return `ルピ${reward.amount}`;
    case 'pack-ticket': return `パックチケット${reward.amount}枚`;
    case 'pack-material': return `パックの材料${reward.amount}個`;
    case 'growth-material': return `育成の材料${reward.amount}個`;
    default: return BATTLE_PASS_REWARD_NAMES[reward.id] ?? String(reward.id ?? reward.kind);
  }
}

export const PASS_ROTATION = freeze([
  { kind: 'manny', amount: 50 },
  { kind: 'pack-material', amount: 1 },
  { kind: 'growth-material', amount: 1 },
  { kind: 'manny', amount: 100 },
]);

export const PASS_POINT_SOURCES = freeze({
  battleWin: 250,
  battleLose: 100,
  // 任務・ドロップの点は新しい段（1レベル1000点）に合わせた10倍。
  // 旧い比率はそのまま：任務150点はレベルの15%（旧15点／100点と同じ）。
  mission: 150,
  dailyAllDoneBonus: 200,
  pointsPerLevel: 1000,
  maxLevel: 50,
  graceDays: 7,
  // 週上限（シャドバWBの実数）：1週間にバトルパスへ入る点は10000点まで。
  // 週はシーズン開始日からの7日ごとの区切り（getSeasonWeekForDate）。
  weeklyCap: 10000,
  // Leftover points convert at 100 points = 10 manny after the grace period.
  leftoverPointsPerManny: 10,
});

export const RANK_TIERS = freeze([
  { id: 'bronze', label: 'ブロンズ', reward: { emblem: 'bronze-emblem', packTickets: 1, manny: 100 } },
  { id: 'silver', label: 'シルバー', reward: { emblem: 'silver-emblem', packTickets: 1, manny: 200 } },
  { id: 'gold', label: 'ゴールド', reward: { emblem: 'gold-emblem', packTickets: 2, manny: 300 } },
  { id: 'platinum', label: 'プラチナ', reward: { emblem: 'platinum-emblem', packTickets: 2, manny: 500 } },
  { id: 'master', label: 'マスター', reward: { emblem: 'master-emblem', packTickets: 3, manny: 800 } },
]);

// Annual festival questions (12 months, 3 choices each). Provisional wording.
export const ANNUAL_FESTIVAL_QUESTIONS = freeze([
  { month: 1, question: '初夢なら？', choices: ['一富士', '二鷹', '三茄子'] },
  { month: 2, question: '寒い日に温まるなら？', choices: ['こたつ', '鍋', '温泉'] },
  { month: 3, question: '春のお出かけは？', choices: ['花見', 'ピクニック', 'お昼寝'] },
  { month: 4, question: '新生活で大事なのは？', choices: ['時間', 'お金', '仲間'] },
  { month: 5, question: '連休の過ごし方は？', choices: ['旅', '家でのんびり', '遊びまくる'] },
  { month: 6, question: '雨の日の楽しみは？', choices: ['読書', 'ムービー', 'お菓子作り'] },
  { month: 7, question: '夏といえば？', choices: ['海', '山', 'お祭り'] },
  { month: 8, question: 'かき氷なら？', choices: ['いちご', 'メロン', '青いハワイ'] },
  { month: 9, question: '秋の夜は？', choices: ['月見', '読書', '星見'] },
  { month: 10, question: 'ハロウィンでなるなら？', choices: ['魔法使い', 'おばけ', '黒猫'] },
  { month: 11, question: '秋の味覚なら？', choices: ['栗', 'さつまいも', 'きのこ'] },
  { month: 12, question: '来年はどうしたい？', choices: ['新しい挑戦', '今を楽しむ', '大事な人と過ごす'], grand: true },
]);

export const SEASON_1_MONTHS = freeze([
  {
    month: 1, theme: '石板目覚め', dropEvent: '石板目覚め', dropReward: '開幕スリーブ',
    exchangeHighlight: '記念アイコン「初日の出の石板」', shopNote: 'シーズン開幕。カタログ開始。おためし週間（1〜7日）',
  },
  {
    month: 2, theme: '温もりの洞くつ', dropEvent: '温もりの洞くつ', dropReward: '温かい衣装の欠片',
    exchangeHighlight: 'パートナーの冬の台詞セット', shopNote: '15〜21日：中間の追い上げ週間（カタログ1.5倍）',
  },
  {
    month: 3, theme: '芽吹きの庭', dropEvent: '芽吹きの庭', dropReward: '春のスリーブ',
    exchangeHighlight: 'シーズン記念の枠', shopNote: '22〜31日：最後の追い込み（カタログ2倍）。26日：次のシーズン予告',
  },
]);

export const SEASON_1_CONFIG = freeze({
  seasonId: 'S1',
  nameProvisional: 'はじまりの石板',
  startMonth: 1,
  endMonth: 3,
  days: 90,
  months: SEASON_1_MONTHS,
  festivalMonths: [1, 2, 3],
  rankCycles: ['R-01-first', 'R-01-second', 'R-02-first', 'R-02-second', 'R-03-first', 'R-03-second'],
});

// Notice text templates (S1-18). {month}, {question}, {choice} are filled in
// by season-notice-templates in the closing core; templates stay text-only.
export const NOTICE_TEMPLATES = freeze({
  monthStart: '{month}月のはじまりだよ。今月のお祭りのお題は「{question}」。投票は11日からだよ。',
  festivalAnnounce: 'お祭りのお知らせだよ。「{question}」の3つから選んでね。本祭は19日9時から48時間だよ。',
  yobiStart: '前夜祭がはじまったよ。投票すると限定の見た目がもらえるよ。ふだんの遊びで祭りの品もたまるよ。',
  midway: '中間発表だよ。今の1位は「{leader}」。ここから後半だけの特別な対戦が開くよ。',
  results: 'お祭りの結果だよ。勝ったのは「{winner}」。ごほうびは月末までに受け取ってね。',
  seasonEnd: 'シーズンの締めだよ。受け取っていないごほうびは7日間だけ受け取れるよ。次のシーズンは{nextMonth}月1日9時からだよ。',
});

export function festivalQuestionForMonth(month) {
  const found = ANNUAL_FESTIVAL_QUESTIONS.find((entry) => entry.month === month);
  if (!found) throw new TypeError('FESTIVAL_QUESTION_MISSING');
  return found;
}

export function catalogRewardForLevel(level, column = 'free') {
  if (!Number.isInteger(level) || level < 1 || level > CATALOG_POINT_SOURCES.maxLevel) {
    throw new TypeError('CATALOG_LEVEL_INVALID');
  }
  const milestone = CATALOG_MILESTONES[level];
  if (milestone) return milestone[column];
  return CATALOG_ROTATION[(level - 1) % CATALOG_ROTATION.length];
}

export function passRewardForLevel(level, column = 'free') {
  if (!Number.isInteger(level) || level < 1 || level > PASS_POINT_SOURCES.maxLevel) {
    throw new TypeError('PASS_LEVEL_INVALID');
  }
  const milestone = PASS_MILESTONES[level];
  if (milestone) return milestone[column];
  return PASS_ROTATION[(level - 1) % PASS_ROTATION.length];
}
