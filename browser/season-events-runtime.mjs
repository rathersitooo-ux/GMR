// season-events-runtime.mjs -- 残りの3つをつなぐ取り付け
// (1) 1週間のお題（イベントB）の進みと受け取り → ゲームの任務画面の
//     #missionGrid へ、週のお題のカードを足す（中の5つのお題は触らない）。
// (2) 1人用ドロップ（イベントA）の点つけ → 対戦の結果が出たら、1〜10日で
//     CPUに勝ったときだけ数える（1日3勝まで大きく、それ以降は小さく）。
// (3) お祭りの本祭の対戦の数え方 → 本祭の期間の対戦を、部門ごとに数える。
//     前半は「人との対戦（ランク・友だちの部屋）」と「CPUとの対戦」で分け、
//     後半は特別な対戦として数える。投票していない月の対戦は、陣営が
//     分からないため数えない。相手の陣営は端末では分からないため、
//     同じ陣営どうしの対戦の除外はサーバー側の照らし合わせに任せる
//     （記録には sameTeamUnknown: true を残す）。
// (4) 投票でもらえる見た目の受け取り → 投票したら見た目を受け取り箱へ
//     入れ、カタログの窓の「受け取り箱」から受け取れる。
//
// 見る場所（決め）：対戦の結果・画面の切り替わり・ボタンの押し方を「見る」
// だけで、ゲームの流れは変えない。お題の進みは次の合図で数える：
// 対戦3回・1勝は結果画面、パートナーを選ぶは人物一覧の押し方、
// 対戦記録を見るは記録画面、デッキ画面を開くはデッキ画面、
// パートナーと話すはパートナーの助言のボタン、お祭りに投票するは投票。
// マニーの受け取り先：写しにはマニーの財布（残高の置き場所）がないため、
// お題のマニーは台帳（mannyLedger）に残し、財布ができたらそこへ渡す。
// カタログの点はその場で入る。

import { getFestivalPhaseForDate, getSeasonForDate } from './season-calendar-core.mjs';
import { addCatalogPoints, createCatalogState } from './season-catalog-core.mjs';
import { claimFromBox, dayNumber, grantToClaimBox, listClaimable } from './season-claim-box-core.mjs';
import {
  advanceFestivalTitle,
  computeDepartmentPoints,
  festivalShells,
  festivalTitleLabel,
  festivalWinner,
  recordFestivalBattle,
} from './season-festival-core.mjs';
import {
  WEEKLY_MISSION_IDS,
  claimWeeklyAllDoneBonus,
  completeWeeklyMission,
  recordDropBattle,
} from './season-monthly-event-core.mjs';
import { buildSeasonResultKey, cleanSeasonState, ensureCurrentSeasonMonth } from './season-store.mjs';

export const SEASON_MISSIONS_GRID_ID = 'missionGrid';
export const SEASON_CLAIM_BOX_SECTION_ID = 'seasonClaimBoxSection';
export const SEASON_WEEKLY_CARD_CLASS = 'seasonWeeklyMissionCard';

export const WEEKLY_MISSION_DEFS = Object.freeze([
  Object.freeze({ id: 'battle-3', label: '対戦を3回遊ぶ', target: 3, countKey: 'battles' }),
  Object.freeze({ id: 'win-1', label: '対戦で1回勝つ', target: 1, countKey: 'wins' }),
  Object.freeze({ id: 'grow-1', label: 'パートナーを選ぶ', target: 1, countKey: 'grow' }),
  Object.freeze({ id: 'watch-1', label: '対戦記録を見る', target: 1, countKey: 'watch' }),
  Object.freeze({ id: 'deck-1', label: 'デッキ画面を開く', target: 1, countKey: 'deck' }),
  Object.freeze({ id: 'partner-1', label: 'パートナーと話す', target: 1, countKey: 'partner' }),
  Object.freeze({ id: 'festival-1', label: 'お祭りに投票する', target: 1, countKey: null }),
]);

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function dayKeyOf({ month, day }) {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function inMissionWeek(day) {
  return day >= 4 && day <= 10;
}

function addPoints(state, rawPoints, multiplier) {
  const next = addCatalogPoints(
    createCatalogState({ seasonId: 'S1', points: state.catalogPoints, claimedFree: state.claimedFree }),
    rawPoints,
    multiplier,
  );
  return next.points;
}

// --- お題の進み ---

export function missionProgressFor(state, { month, day } = {}) {
  const cleaned = cleanSeasonState(state, { month });
  const weekKey = String(month).padStart(2, '0');
  const counts = cleaned.missions.weekKey === weekKey ? cleaned.missions.counts : { battles: 0, wins: 0, grow: 0, watch: 0, deck: 0, partner: 0 };
  const voted = cleaned.festivalVotes[String(month)] !== undefined;
  const items = WEEKLY_MISSION_DEFS.map((def) => {
    const now = def.countKey === null ? (voted ? 1 : 0) : Math.min(counts[def.countKey] ?? 0, def.target);
    const done = now >= def.target;
    const claimed = cleaned.missions.done.includes(def.id);
    return freeze({
      ...def,
      now,
      done,
      claimed,
      claimable: done && !claimed,
    });
  });
  const allDone = items.every((item) => item.done);
  return freeze({
    weekKey,
    inWeek: inMissionWeek(day),
    items,
    doneCount: items.filter((item) => item.done).length,
    claimedCount: items.filter((item) => item.claimed).length,
    allDone,
    bonusClaimable: allDone && !cleaned.missions.allDoneBonusClaimed,
    bonusClaimed: cleaned.missions.allDoneBonusClaimed,
  });
}

// 画面の切り替わり・ボタンの押し方からのお題の進み。kind は grow / watch /
// deck / partner のどれか。お題の週（4〜10日）以外は数えない。
export function recordSeasonScreenEvent(state, { kind, month, day } = {}) {
  const cleaned = ensureCurrentSeasonMonth(cleanSeasonState(state, { month }), month);
  if (!['grow', 'watch', 'deck', 'partner'].includes(kind)) throw new TypeError('SCREEN_EVENT_INVALID');
  if (!inMissionWeek(day)) return freeze({ state: cleaned, counted: false, reason: 'NOT_IN_WEEK' });
  const counts = cleaned.missions.counts;
  if ((counts[kind] ?? 0) >= 1) return freeze({ state: cleaned, counted: false, reason: 'ALREADY_COUNTED' });
  const next = freeze({
    ...cleaned,
    missions: freeze({
      ...cleaned.missions,
      counts: freeze({ ...counts, [kind]: (counts[kind] ?? 0) + 1 }),
    }),
  });
  return freeze({ state: next, counted: true, reason: 'OK' });
}

// --- 対戦の結果からの3つの数え方 ---
// match: { mode, friendRoom, rankMode }（__GAMEROAD_TEST__.state.match と
// 準備画面の data-rank-match-mode から読む。取れないときは空でもよい）。
export function recordSeasonResultEvents(state, { resultKey, month, day, hour, won, match = {} } = {}) {
  let cleaned = ensureCurrentSeasonMonth(cleanSeasonState(state, { month }), month);
  if (typeof resultKey !== 'string' || resultKey === '') throw new TypeError('RESULT_KEY_REQUIRED');
  if (cleaned.countedResultKeys.includes(resultKey)) {
    return freeze({ state: cleaned, counted: false, reason: 'ALREADY_COUNTED', events: Object.freeze([]) });
  }
  const season = getSeasonForDate({ month, day, hour });
  const events = [];
  const isRank = match.rankMode === 'rank';
  const isFriendRoom = match.friendRoom === true;

  // (a) ドロップ：1〜10日で、CPUに勝ったときだけ。
  if (day >= 1 && day <= 10 && won === true && !isFriendRoom && !isRank) {
    const drop = recordDropBattle(cleaned.drop, { dayKey: dayKeyOf({ month, day }), won: true });
    if (drop.reward) {
      cleaned = freeze({
        ...cleaned,
        drop: drop.state,
        exchangeTokens: cleaned.exchangeTokens + drop.reward.tokens,
        catalogPoints: addPoints(cleaned, drop.reward.catalogPoints, season.catalogMultiplier),
      });
      events.push(freeze({ kind: 'drop', reward: drop.reward, reason: drop.reason }));
    }
  }

  // (b) お題の対戦・勝利の進み：4〜10日だけ。
  if (inMissionWeek(day)) {
    const counts = { ...cleaned.missions.counts };
    counts.battles = Math.min((counts.battles ?? 0) + 1, 3);
    if (won === true) counts.wins = Math.min((counts.wins ?? 0) + 1, 1);
    cleaned = freeze({ ...cleaned, missions: freeze({ ...cleaned.missions, counts: freeze(counts) }) });
    events.push(freeze({ kind: 'mission-progress', battles: counts.battles, wins: counts.wins }));
  }

  // (c) お祭りの本祭の対戦の数え方：本祭の期間だけ。投票していない月は数えない。
  const festival = getFestivalPhaseForDate({ month, day, hour });
  if (festival.phase === 'main-first' || festival.phase === 'main-second') {
    const teamIndex = cleaned.festivalVotes[String(month)];
    if (teamIndex === undefined) {
      events.push(freeze({ kind: 'festival-skipped', reason: 'NO_TEAM' }));
    } else {
      const department = festival.phase === 'main-second'
        ? 'specialBattles'
        : (isRank || isFriendRoom ? 'openBattles' : 'soloBattles');
      const recorded = recordFestivalBattle(cleaned.festival, {
        department,
        teamIndex,
        amount: 1,
        isSameTeam: false,
      });
      let nextFestival = recorded.state;
      if (won === true) nextFestival = advanceFestivalTitle(nextFestival, 1);
      cleaned = freeze({ ...cleaned, festival: nextFestival });
      events.push(freeze({
        kind: 'festival-battle',
        department,
        teamIndex,
        sameTeamUnknown: true,
        titleStep: nextFestival.titleStep,
      }));
    }
  }

  cleaned = freeze({
    ...cleaned,
    countedResultKeys: freeze([...cleaned.countedResultKeys, resultKey]),
  });
  return freeze({ state: cleaned, counted: true, reason: 'OK', events: freeze(events) });
}

// --- お題の受け取り ---
// 受け取るとカタログの点（15点）とマニー（50）が入る。マニーは台帳に残す
// （写しに財布がないため）。全部終えたら、追加のごほうび（20点・マニー100）も入る。
export function claimSeasonMission(state, missionId, { month, day, hour } = {}) {
  const cleaned = ensureCurrentSeasonMonth(cleanSeasonState(state, { month }), month);
  if (!WEEKLY_MISSION_IDS.includes(missionId)) throw new TypeError('MISSION_INVALID');
  const progress = missionProgressFor(cleaned, { month, day });
  const item = progress.items.find((entry) => entry.id === missionId);
  if (!item.done) return freeze({ state: cleaned, claimed: false, reason: 'NOT_DONE', reward: null, bonusClaimed: false });
  if (item.claimed) return freeze({ state: cleaned, claimed: false, reason: 'ALREADY_CLAIMED', reward: null, bonusClaimed: false });
  const season = getSeasonForDate({ month, day, hour });
  const result = completeWeeklyMission(cleaned.missions, missionId);
  if (!result.completed) return freeze({ state: cleaned, claimed: false, reason: result.reason, reward: null, bonusClaimed: false });
  let next = freeze({
    ...cleaned,
    missions: result.state,
    catalogPoints: addPoints(cleaned, result.reward.catalogPoints, season.catalogMultiplier),
    mannyEarned: cleaned.mannyEarned + result.reward.manny,
    mannyLedger: freeze([...cleaned.mannyLedger, freeze({ id: `mission-${missionId}-${progress.weekKey}`, amount: result.reward.manny, source: 'weekly-mission' })]),
  });
  let bonusClaimed = false;
  if (next.missions.done.length === WEEKLY_MISSION_IDS.length && !next.missions.allDoneBonusClaimed) {
    const bonus = claimWeeklyAllDoneBonus(next.missions);
    if (bonus.claimed) {
      next = freeze({
        ...next,
        missions: bonus.state,
        catalogPoints: addPoints(next, bonus.reward.catalogPoints, season.catalogMultiplier),
        mannyEarned: next.mannyEarned + bonus.reward.manny,
        mannyLedger: freeze([...next.mannyLedger, freeze({ id: `weekly-bonus-${progress.weekKey}`, amount: bonus.reward.manny, source: 'weekly-bonus' })]),
      });
      bonusClaimed = true;
    }
  }
  return freeze({ state: next, claimed: true, reason: 'OK', reward: result.reward, bonusClaimed });
}

// --- 投票の見た目を受け取り箱へ ---
export function grantFestivalLook(state, month) {
  const cleaned = cleanSeasonState(state, { month });
  if (cleaned.festivalVotes[String(month)] === undefined) {
    return freeze({ state: cleaned, granted: false, reason: 'NOT_VOTED' });
  }
  const endDay = month === 12 ? 22 : 21;
  const result = grantToClaimBox(cleaned.claimBox, {
    id: `festival-look-S1-${month}`,
    reward: Object.freeze({
      kind: 'festival-look',
      id: 'festival-team-look',
      label: `お祭りの見た目（${month}月）`,
      note: '本祭の終わりで返却。集めた育成の品は残る。',
    }),
    expiresDay: dayNumber({ month, day: endDay }),
  });
  if (!result.granted) return freeze({ state: cleaned, granted: false, reason: result.reason });
  return freeze({ state: freeze({ ...cleaned, claimBox: result.box }), granted: true, reason: 'OK' });
}

// --- 受け取り箱の受け取り ---
export function claimSeasonBoxItem(state, grantId, { month, day } = {}) {
  const cleaned = cleanSeasonState(state, { month });
  const result = claimFromBox(cleaned.claimBox, grantId, { month, day });
  if (!result.claimed) return freeze({ state: cleaned, claimed: false, reason: result.reason, reward: null });
  return freeze({ state: freeze({ ...cleaned, claimBox: result.box }), claimed: true, reason: 'OK', reward: result.reward });
}

// --- お祭りの今の様子（予定の窓用） ---
export function festivalStatusFor(state, { month, day, hour } = {}) {
  const cleaned = cleanSeasonState(state, { month });
  const festival = cleaned.festival;
  const computed = computeDepartmentPoints(festival);
  const winner = festivalWinner(festival);
  return freeze({
    phase: getFestivalPhaseForDate({ month, day, hour }).phase,
    voted: cleaned.festivalVotes[String(month)] !== undefined,
    teamIndex: cleaned.festivalVotes[String(month)] ?? null,
    contribution: festival.contribution,
    points: computed.points,
    totalPoints: computed.total,
    winners: winner.winners,
    isTie: winner.isTie,
    titleStep: festival.titleStep,
    titleLabel: festivalTitleLabel(festival),
    shellsWin: festivalShells(festival, true),
    shellsLose: festivalShells(festival, false),
    festivalPoints: festival.festivalPoints,
  });
}

// --- 画面づくり（任務画面・カタログの窓用） ---

function makeElement(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function renderWeeklyMissionCards(doc, state, { month, day } = {}, onClaim) {
  const progress = missionProgressFor(state, { month, day });
  const cards = [];
  for (const item of progress.items) {
    const card = makeElement(doc, 'article', `${SEASON_WEEKLY_CARD_CLASS} missionCard${item.done ? ' done' : ''}`);
    const head = makeElement(doc, 'div');
    head.append(makeElement(doc, 'div', 'k', 'SEASON'));
    head.append(makeElement(doc, 'h3', null, item.label));
    card.append(head);
    const bar = makeElement(doc, 'div', 'progressLine');
    const fill = makeElement(doc, 'i');
    fill.style = fill.style || {};
    fill.style.width = `${Math.round((item.now / item.target) * 100)}%`;
    bar.append(fill);
    card.append(bar);
    const meta = makeElement(doc, 'div', 'missionMeta');
    meta.append(makeElement(doc, 'span', null, `${item.now} / ${item.target}`));
    meta.append(makeElement(doc, 'b', null, item.claimed ? '受け取ったよ' : item.done ? '達成' : '進行中'));
    card.append(meta);
    if (item.claimable) {
      const button = makeElement(doc, 'button', 'btn primary', '受け取る：カタログ15点・マニー50');
      button.type = 'button';
      button.addEventListener('click', () => onClaim?.(item.id));
      card.append(button);
    }
    cards.push(card);
  }
  if (progress.bonusClaimable) {
    // 追加のごほうびは、7つ目を受け取るときに一緒に入る（別のボタンはない）。
    const bonus = makeElement(doc, 'article', `${SEASON_WEEKLY_CARD_CLASS} missionCard done`);
    bonus.append(makeElement(doc, 'h3', null, '全部終えたごほうび'));
    bonus.append(makeElement(doc, 'p', null, 'あと1つ受け取ると、追加でカタログ20点・マニー100が入るよ。'));
    cards.push(bonus);
  }
  return Object.freeze({ progress, cards: Object.freeze(cards) });
}

export function renderClaimBoxSection(doc, state, { month, day } = {}, onClaim) {
  const cleaned = cleanSeasonState(state, { month });
  const claimable = listClaimable(cleaned.claimBox, { month, day });
  const section = makeElement(doc, 'div');
  section.id = SEASON_CLAIM_BOX_SECTION_ID;
  section.append(makeElement(doc, 'h3', null, '受け取り箱'));
  if (claimable.length === 0) {
    section.append(makeElement(doc, 'p', null, cleaned.claimBox.grants.length === 0
      ? '受け取り箱は今は空だよ。お祭りに投票すると、見た目がここに入るよ。'
      : '受け取れるものは今はないよ。'));
  }
  for (const grant of claimable) {
    const row = makeElement(doc, 'div', 'seasonClaimList');
    const button = makeElement(doc, 'button', null, `${grant.reward.label ?? grant.reward.kind}を受け取る${grant.reward.note ? `（${grant.reward.note}）` : ''}`);
    button.type = 'button';
    button.addEventListener('click', () => onClaim?.(grant.id));
    row.append(button);
    section.append(row);
  }
  const summary = makeElement(doc, 'p', null, `ためたマニー：${cleaned.mannyEarned}（財布ができたら渡す分。台帳に残してあるよ）`);
  section.append(summary);
  return section;
}

// --- 取り付け ---

function readResultTexts(doc) {
  return {
    grade: doc.getElementById?.('resultGrade')?.textContent ?? '',
    headline: doc.getElementById?.('resultHeadline')?.textContent ?? '',
    rounds: doc.getElementById?.('resultRounds')?.textContent ?? '',
    points: doc.getElementById?.('resultPointsEarned')?.textContent ?? '',
    leadText: doc.getElementById?.('resultLeadText')?.textContent ?? '',
  };
}

function readMatchInfo(doc) {
  const match = globalThis.__GAMEROAD_TEST__?.state?.match ?? {};
  const setup = doc.querySelector?.('section[data-screen="setup"]');
  const rankMode = setup?.getAttribute?.('data-rank-match-mode') ?? 'normal';
  return {
    mode: typeof match.mode === 'string' ? match.mode : '',
    friendRoom: match.friendRoom === true,
    contentId: typeof match.contentId === 'string' ? match.contentId : '',
    rankMode: rankMode === 'rank' ? 'rank' : 'normal',
  };
}

function todayParts() {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours() };
}

// season-home-runtime の取り付けから呼ぶ。store は season-store のもの、
// onChange は「記録が変わったよ」の合図（帯の表示を直すために使う）。
export function mountSeasonEvents({ document: doc, store, onChange } = {}) {
  if (!doc || typeof doc.querySelector !== 'function' || typeof doc.createElement !== 'function' || !store) return null;
  const save = (state, when) => store.save(state, when.month);
  const load = (when) => ensureCurrentSeasonMonth(store.load(when.month), when.month);

  // (1) 結果画面：ドロップ・お題の対戦・本祭の数え方
  const resultSection = doc.querySelector('section[data-screen="result"]');
  const onResultShown = () => {
    const when = todayParts();
    const texts = readResultTexts(doc);
    const resultKey = buildSeasonResultKey({ ...texts, ...when });
    const won = texts.leadText === '一位で決着';
    const result = recordSeasonResultEvents(load(when), {
      resultKey,
      ...when,
      won,
      match: readMatchInfo(doc),
    });
    if (result.counted) { save(result.state, when); onChange?.(); }
  };
  let resultObserver = null;
  if (resultSection && typeof MutationObserver !== 'undefined') {
    let wasActive = resultSection.classList?.contains?.('active') === true;
    resultObserver = new MutationObserver(() => {
      const active = resultSection.classList?.contains?.('active') === true;
      if (active && !wasActive) onResultShown();
      wasActive = active;
    });
    resultObserver.observe(resultSection, { attributes: true, attributeFilter: ['class'] });
  }

  // (2) 画面の切り替わり：記録・デッキ画面を開いたとき
  const screenTargets = { records: 'watch', cards: 'deck' };
  const screenStates = new Map();
  const screenObserver = typeof MutationObserver !== 'undefined' ? new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const section = mutation.target;
      const key = section?.dataset?.screen;
      const kind = screenTargets[key];
      if (!kind) continue;
      const active = section.classList?.contains?.('active') === true;
      if (active && !screenStates.get(key)) {
        const when = todayParts();
        const result = recordSeasonScreenEvent(load(when), { kind, ...when });
        if (result.counted) { save(result.state, when); onChange?.(); }
      }
      screenStates.set(key, active);
    }
  }) : null;
  if (screenObserver) {
    for (const [screen] of Object.entries(screenTargets)) {
      const section = doc.querySelector(`section[data-screen="${screen}"]`);
      if (section) {
        screenStates.set(screen, section.classList?.contains?.('active') === true);
        screenObserver.observe(section, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }

  // (3) ボタンの押し方：人物一覧でパートナーを選ぶ／パートナーと話す
  const onClick = (event) => {
    const target = event?.target;
    if (!target?.closest) return;
    const when = todayParts();
    if (target.closest('#charRoster')) {
      const result = recordSeasonScreenEvent(load(when), { kind: 'grow', ...when });
      if (result.counted) { save(result.state, when); onChange?.(); }
      return;
    }
    if (target.closest('#partnerAdviceBtn')) {
      const result = recordSeasonScreenEvent(load(when), { kind: 'partner', ...when });
      if (result.counted) { save(result.state, when); onChange?.(); }
    }
  };
  doc.addEventListener?.('click', onClick);

  // (4) 任務画面：週のお題のカードを #missionGrid へ足す
  const renderMissionsIntoGrid = () => {
    const grid = doc.getElementById?.(SEASON_MISSIONS_GRID_ID);
    if (!grid || typeof grid.append !== 'function') return false;
    if (grid.querySelector?.(`.${SEASON_WEEKLY_CARD_CLASS}`)) return true;
    const when = todayParts();
    const state = load(when);
    const { cards } = renderWeeklyMissionCards(doc, state, when, (missionId) => {
      const now = todayParts();
      if (missionId === '__bonus__') return;
      const result = claimSeasonMission(load(now), missionId, now);
      if (result.claimed) { save(result.state, now); onChange?.(); renderMissionsIntoGrid(); }
    });
    for (const card of cards) grid.append(card);
    return true;
  };
  let gridObserver = null;
  const grid = doc.getElementById?.(SEASON_MISSIONS_GRID_ID);
  if (grid && typeof MutationObserver !== 'undefined') {
    gridObserver = new MutationObserver(() => { renderMissionsIntoGrid(); });
    gridObserver.observe(grid, { childList: true });
  }

  // (5) カタログの窓：受け取り箱の段を足す
  const renderClaimBoxIntoDialog = () => {
    const dialog = doc.getElementById?.('seasonCatalogDialog');
    const body = dialog?.querySelector?.('.seasonDialogBody');
    if (!body || typeof body.append !== 'function') return false;
    if (body.querySelector?.(`#${SEASON_CLAIM_BOX_SECTION_ID}`)) return true;
    const when = todayParts();
    const section = renderClaimBoxSection(doc, load(when), when, (grantId) => {
      const now = todayParts();
      const result = claimSeasonBoxItem(load(now), grantId, now);
      if (result.claimed) { save(result.state, now); onChange?.(); renderClaimBoxIntoDialog(); }
    });
    body.append(section);
    return true;
  };
  let dialogObserver = null;
  const catalogDialog = doc.getElementById?.('seasonCatalogDialog');
  const dialogBody = catalogDialog?.querySelector?.('.seasonDialogBody');
  if (dialogBody && typeof MutationObserver !== 'undefined') {
    dialogObserver = new MutationObserver(() => { renderClaimBoxIntoDialog(); });
    dialogObserver.observe(dialogBody, { childList: true });
  }

  return Object.freeze({
    onResultShown,
    renderMissionsIntoGrid,
    renderClaimBoxIntoDialog,
    unmount: () => {
      resultObserver?.disconnect?.();
      screenObserver?.disconnect?.();
      gridObserver?.disconnect?.();
      dialogObserver?.disconnect?.();
      doc.removeEventListener?.('click', onClick);
    },
  });
}
