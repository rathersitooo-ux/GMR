// season-home-runtime.mjs -- 第1シーズンを本流のホームへつなぐ取り付け
// 見せ場ページ (season-s1-review.html) の内容を、ホーム画面の「予定」と
// カタログ画面として出す。GAMEROAD.html には読み込み1行と見た目だけを足し、
// 画面の中身はここで作る。
//
// 数える置き場所（決め）：第1シーズンのブラウザ版では、端末の記録
// (localStorage `gameroad.season.s1.v1`) が数える場所。数えるものは
// すべて番号つきで二重に数えない（対戦の結果は結果の文＋日付の番号、
// ランクは回ごとの番号、お祭りの投票は月、締めは実行の番号）。サーバー側の
// 記録ができたら、サーバーがこの番号で照らし合わせて1つにまとめる。
// 今はサーバーへは書き込まない。理由：写しではランクの相手探しの登録が
// まだなく（「接続先は未登録」）、お祭りの数を数える受け口もないため。
// 対戦が終わったときの点は、結果画面が出たことを見て1回だけつける
// （結果の文が同じ対戦を2回数えないよう、日付＋結果の文で番号を作る。
// 同じ日に同じ文の結果が2回出たときは、2回目はつけない。安全側の決め）。
// 1週間のお題・1人用ドロップ・本祭の対戦の数え方・投票の見た目の
// 受け取りは season-events-runtime.mjs でつないである（この取り付けから
// 呼ぶ）。記録の置き場所は season-store.mjs に1つだけある。

import {
  describeToday,
  getFestivalPhaseForDate,
  getMonthlyEventsForDate,
  getRankCycleForDate,
  getSeasonForDate,
} from './season-calendar-core.mjs';
import {
  addCatalogPoints,
  claimFreeReward,
  claimableLevels,
  createCatalogState,
  summarizeCatalog,
} from './season-catalog-core.mjs';
import { CATALOG_MILESTONES, SEASON_1_CONFIG, SEASON_1_MONTHS, catalogRewardForLevel, festivalQuestionForMonth } from './season-s1-config.mjs';
import { festivalStatusFor, grantFestivalLook, mountSeasonEvents } from './season-events-runtime.mjs';
import { createFestivalState, voteFestival } from './season-festival-core.mjs';
import {
  SEASON_STORE_KEY,
  buildSeasonResultKey,
  cleanSeasonState,
  createSeasonStore,
  ensureCurrentSeasonMonth,
} from './season-store.mjs';

// 検査用の古い名前（season-store のものと同じ）。
export { createSeasonStore as createSeasonHomeStore };
export const SEASON_HOME_STORAGE_KEY = SEASON_STORE_KEY;
export const SEASON_HOME_STYLE_ID = 'gameroad-season-home-style';
export const SEASON_HOME_STRIP_ID = 'seasonHomeStrip';
export const SEASON_CATALOG_DIALOG_ID = 'seasonCatalogDialog';
export const SEASON_SCHEDULE_DIALOG_ID = 'seasonScheduleDialog';

const BATTLE_POINTS = 10;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

export function catalogStateFor(storeState) {
  return createCatalogState({
    seasonId: 'S1',
    points: storeState.catalogPoints,
    claimedFree: storeState.claimedFree,
  });
}

// 今日の予定・ランク・お祭り・カタログを1つにまとめた見た目用のまとめ。
// 日付は {month, day, hour} で入れる（時計は読まないので検査できる）。
export function seasonHomeSnapshot(storeState, input) {
  const state = cleanSeasonState(storeState, { month: input.month });
  const season = getSeasonForDate(input);
  const rank = getRankCycleForDate(input);
  const monthly = getMonthlyEventsForDate(input);
  const festival = getFestivalPhaseForDate(input);
  const question = festivalQuestionForMonth(input.month);
  const catalog = summarizeCatalog(catalogStateFor(state));
  const votedChoice = state.festivalVotes[String(input.month)];
  return freeze({
    season,
    rank,
    festival,
    question,
    monthlyEvents: monthly.events,
    rankPaused: monthly.rankPaused,
    todayText: describeToday(input),
    catalog,
    catalogClaimable: claimableLevels(catalogStateFor(state)),
    festivalVoted: votedChoice !== undefined,
    festivalVotedChoice: votedChoice !== undefined ? question.choices[votedChoice] : null,
    canVote: festival.phase === 'yobi' && votedChoice === undefined,
    festivalStatus: festivalStatusFor(state, input),
  });
}

// 対戦の結果が出たときの点つけ。resultKey が同じものは2回つけない。
// 返すのは新しい記録と、つけた点（つけなかったときは 0）。
export function recordSeasonBattleResult(storeState, { resultKey, month, day, hour } = {}) {
  const state = cleanSeasonState(storeState, { month });
  if (typeof resultKey !== 'string' || resultKey === '') throw new TypeError('RESULT_KEY_REQUIRED');
  if (state.grantedResultKeys.includes(resultKey)) return freeze({ state, granted: false, gained: 0 });
  const season = getSeasonForDate({ month, day, hour });
  const next = addCatalogPoints(catalogStateFor(state), BATTLE_POINTS, season.catalogMultiplier);
  const updated = cleanSeasonState({
    ...state,
    catalogPoints: next.points,
    grantedResultKeys: [...state.grantedResultKeys, resultKey],
  }, { month });
  return freeze({ state: updated, granted: true, gained: next.points - state.catalogPoints });
}

// カタログの無料の列の受け取り。取れたときだけ記録が進む。
export function claimSeasonFreeReward(storeState, level) {
  const state = cleanSeasonState(storeState, { month: 1 });
  const result = claimFreeReward(catalogStateFor(state), level);
  if (!result.claimed) return freeze({ state, claimed: false, reason: result.reason, reward: null });
  const updated = cleanSeasonState({ ...state, claimedFree: result.state.claimedFree }, { month: 1 });
  return freeze({ state: updated, claimed: true, reason: 'OK', reward: result.reward });
}

// お祭りの投票。1か月に1回だけ。選んだ番号を記録に残す。
export function voteSeasonFestival(storeState, { month, choiceIndex } = {}) {
  const state = cleanSeasonState(storeState, { month });
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  if (state.festivalVotes[String(month)] !== undefined) {
    return freeze({ state, voted: false, reason: 'ALREADY_VOTED' });
  }
  const festival = createFestivalState({ month });
  const result = voteFestival(festival, choiceIndex);
  if (!result.voted) return freeze({ state, voted: false, reason: result.reason });
  const updated = cleanSeasonState({
    ...state,
    festivalVotes: { ...state.festivalVotes, [String(month)]: choiceIndex },
    festival: { ...state.festival, vote: choiceIndex },
  }, { month });
  return freeze({ state: updated, voted: true, reason: 'OK', choice: result.choice });
}

const SEASON_HOME_CSS = `
#${SEASON_HOME_STRIP_ID}{position:absolute;left:10px;top:66px;z-index:40;width:min(430px,62vw);padding:10px 12px;border-radius:14px;background:rgba(20,16,8,.96);color:#f5ecd7;box-shadow:0 10px 28px rgba(0,0,0,.35);font-size:12px;line-height:1.5}
#${SEASON_HOME_STRIP_ID} .seasonHomeTitle{font-weight:900;font-size:14px}
#${SEASON_HOME_STRIP_ID} .seasonHomeToday{margin-top:2px;opacity:.92}
#${SEASON_HOME_STRIP_ID} .seasonHomeBar{height:8px;margin-top:8px;border-radius:99px;background:rgba(255,255,255,.16);overflow:hidden}
#${SEASON_HOME_STRIP_ID} .seasonHomeBarFill{height:100%;border-radius:99px;background:#e8b64c}
#${SEASON_HOME_STRIP_ID} .seasonHomeMeta{margin-top:4px;display:flex;justify-content:space-between;gap:8px}
#${SEASON_HOME_STRIP_ID} .seasonHomeButtons{display:flex;gap:8px;margin-top:8px}
#${SEASON_HOME_STRIP_ID} button{min-height:40px;padding:6px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:inherit;font:inherit;font-weight:800;cursor:pointer}
#${SEASON_HOME_STRIP_ID} .seasonHomeVote{margin-top:8px}
#${SEASON_HOME_STRIP_ID} .seasonHomeVoteRow{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
#${SEASON_HOME_STRIP_ID} .seasonHomeVoteRow button{min-height:36px;padding:4px 9px;font-size:11px}
#${SEASON_CATALOG_DIALOG_ID}[hidden],#${SEASON_SCHEDULE_DIALOG_ID}[hidden]{display:none!important}
#${SEASON_CATALOG_DIALOG_ID},#${SEASON_SCHEDULE_DIALOG_ID}{position:fixed;inset:0;z-index:220;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(6,9,18,.62)}
#${SEASON_CATALOG_DIALOG_ID} .seasonDialogPanel,#${SEASON_SCHEDULE_DIALOG_ID} .seasonDialogPanel{width:min(680px,96vw);max-height:86vh;overflow:auto;border-radius:18px;background:#fbf6ea;color:#2a2118;padding:16px 18px 20px;box-shadow:0 24px 64px rgba(0,0,0,.5)}
#${SEASON_CATALOG_DIALOG_ID} h2,#${SEASON_SCHEDULE_DIALOG_ID} h2{margin:0 0 6px;font-size:20px}
#${SEASON_CATALOG_DIALOG_ID} .seasonDialogHead,#${SEASON_SCHEDULE_DIALOG_ID} .seasonDialogHead{display:flex;justify-content:space-between;align-items:center;gap:10px}
#${SEASON_CATALOG_DIALOG_ID} .seasonDialogClose,#${SEASON_SCHEDULE_DIALOG_ID} .seasonDialogClose{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(0,0,0,.25);background:rgba(0,0,0,.06);font:inherit;font-weight:800;cursor:pointer}
#${SEASON_CATALOG_DIALOG_ID} .seasonRoad{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;margin:12px 0}
#${SEASON_CATALOG_DIALOG_ID} .seasonRoadStep{min-height:26px;display:flex;align-items:center;justify-content:center;border-radius:7px;background:#e7dcc4;font-size:10px;font-weight:800}
#${SEASON_CATALOG_DIALOG_ID} .seasonRoadStep.reached{background:#e8b64c;color:#2a2118}
#${SEASON_CATALOG_DIALOG_ID} .seasonClaimList{display:grid;gap:8px;margin-top:10px}
#${SEASON_CATALOG_DIALOG_ID} .seasonClaimList button{min-height:44px;padding:8px 12px;border-radius:11px;border:1px solid rgba(0,0,0,.25);background:#fff;font:inherit;font-weight:800;text-align:left;cursor:pointer}
#${SEASON_SCHEDULE_DIALOG_ID} .seasonMonth{margin-top:12px;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.05)}
#${SEASON_SCHEDULE_DIALOG_ID} .seasonMonth h3{margin:0 0 4px;font-size:15px}
#${SEASON_SCHEDULE_DIALOG_ID} .seasonMonth p{margin:2px 0;font-size:13px;line-height:1.55}
@media (max-width:540px){#${SEASON_HOME_STRIP_ID}{left:6px;right:6px;top:6px;width:auto}}
`;

function makeElement(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function buildDialog(doc, id, titleText) {
  const root = makeElement(doc, 'div');
  root.id = id;
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const panel = makeElement(doc, 'section', 'seasonDialogPanel');
  const head = makeElement(doc, 'div', 'seasonDialogHead');
  const title = makeElement(doc, 'h2', null, titleText);
  const close = makeElement(doc, 'button', 'seasonDialogClose', '閉じる');
  close.type = 'button';
  head.append(title, close);
  const body = makeElement(doc, 'div', 'seasonDialogBody');
  panel.append(head, body);
  root.append(panel);
  root.addEventListener('click', (event) => { if (event?.target === root) root.hidden = true; });
  close.addEventListener('click', () => { root.hidden = true; });
  return { root, body, close };
}

function renderCatalogBody(doc, body, storeState, onClaim) {
  const catalog = catalogStateFor(storeState);
  const summary = summarizeCatalog(catalog);
  const claimable = claimableLevels(catalog);
  body.replaceChildren();
  const status = makeElement(doc, 'p', null,
    `第1シーズンのカタログ：いま ${summary.level}段階・${summary.points}点。次の段階まであと ${summary.pointsToNext}点。対戦が終わると10点入るよ（追い上げの週はもっと多いよ）。`);
  body.append(status);
  const road = makeElement(doc, 'div', 'seasonRoad');
  for (let level = 1; level <= 100; level += 1) {
    const step = makeElement(doc, 'div', `seasonRoadStep${level <= summary.level ? ' reached' : ''}`,
      Object.prototype.hasOwnProperty.call(CATALOG_MILESTONES, level) ? String(level) : '');
    step.title = `${level}段階：${catalogRewardForLevel(level, 'free').label}`;
    road.append(step);
  }
  body.append(road);
  const list = makeElement(doc, 'div', 'seasonClaimList');
  if (claimable.length === 0) {
    list.append(makeElement(doc, 'p', null, '受け取れるごほうびは今はないよ。対戦して点をためよう。'));
  }
  for (const level of claimable) {
    const reward = catalogRewardForLevel(level, 'free');
    const button = makeElement(doc, 'button', null, `${level}段階のごほうびを受け取る：${reward.label}`);
    button.type = 'button';
    button.addEventListener('click', () => onClaim(level));
    list.append(button);
  }
  body.append(list);
  const passNote = makeElement(doc, 'p', null, 'パスの列は決め待ちで閉じたままだよ。無料の列だけで遊べるよ。');
  body.append(passNote);
}

const FESTIVAL_PHASE_LABELS = Object.freeze({
  announce: 'お知らせの期間',
  yobi: '前夜祭（投票の期間）',
  'main-first': '本祭（前半）',
  'main-second': '本祭（後半・特別な対戦）',
  'main-ended': '本祭が終わったところ',
  results: '結果発表',
});

function renderScheduleBody(doc, body, snapshot) {
  body.replaceChildren();
  body.append(makeElement(doc, 'p', null, snapshot.todayText));
  const status = snapshot.festivalStatus;
  if (status) {
    const deptNames = { yobiTokens: '前夜祭の品', votes: '投票', openBattles: '人との対戦', soloBattles: 'CPUとの対戦', specialBattles: '特別な対戦' };
    const deptLines = Object.entries(status.contribution)
      .map(([dept, values]) => `${deptNames[dept] ?? dept}：${values.join('・')}`)
      .join('／');
    const festivalBlock = makeElement(doc, 'div', 'seasonMonth');
    festivalBlock.append(makeElement(doc, 'h3', null, `今月のお祭り：${FESTIVAL_PHASE_LABELS[status.phase] ?? status.phase}`));
    festivalBlock.append(makeElement(doc, 'p', null, status.voted
      ? `投票した陣営：${status.teamIndex + 1}番目。称号は「${status.titleLabel}」（${status.titleStep + 1}段目）。`
      : 'まだ投票していないよ。投票すると、本祭の対戦が陣営の点になるよ。'));
    festivalBlock.append(makeElement(doc, 'p', null, `部門ごとの集まり：${deptLines}。部門の点：${status.points.join('・')}（合計 ${status.totalPoints}点）。`));
    festivalBlock.append(makeElement(doc, 'p', null, `勝ったときの貝：${status.shellsWin}個、負けたとき：${status.shellsLose}個。`));
    body.append(festivalBlock);
  }
  for (const monthInfo of SEASON_1_MONTHS) {
    const question = festivalQuestionForMonth(monthInfo.month);
    const block = makeElement(doc, 'div', 'seasonMonth');
    block.append(makeElement(doc, 'h3', null, `${monthInfo.month}月：${monthInfo.theme}`));
    block.append(makeElement(doc, 'p', null, `お祭りのお題「${question.question}」：${question.choices.join('／')}。本祭は19日9時から48時間。`));
    block.append(makeElement(doc, 'p', null, `1人用ドロップ「${monthInfo.dropEvent}」（1〜10日）、1週間のお題（4〜10日）、交換の目玉「${monthInfo.exchangeHighlight}」（22日〜月末）。`));
    block.append(makeElement(doc, 'p', null, monthInfo.shopNote));
    body.append(block);
  }
  const cycles = makeElement(doc, 'p', null, `ランクの回：${SEASON_1_CONFIG.rankCycles.join('・')}。1回は2週間で、上の段は1〜2段だけ下がって次へ進むよ。お祭りの本祭中はランクがお休みだよ。`);
  body.append(cycles);
}

function todayParts() {
  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours() };
}

// ホーム画面へ取り付ける。doc は本物の document か、検査用の代わりのもの。
// 戻り値は取り付けの手がかり（refresh で表示を今の記録に合わせ直す）。
export function mountSeasonHome({ document: doc, storage, now = todayParts() } = {}) {
  if (!doc || typeof doc.querySelector !== 'function' || typeof doc.createElement !== 'function') return null;
  const home = doc.querySelector('section[data-screen="home"]');
  if (!home || typeof home.append !== 'function') return null;
  if (doc.getElementById?.(SEASON_HOME_STRIP_ID)) return null;

  const store = createSeasonStore(storage);
  let state = store.load(now.month);

  if (doc.head?.append && !doc.getElementById?.(SEASON_HOME_STYLE_ID)) {
    const style = doc.createElement('style');
    style.id = SEASON_HOME_STYLE_ID;
    style.textContent = SEASON_HOME_CSS;
    doc.head.append(style);
  }

  const strip = makeElement(doc, 'div');
  strip.id = SEASON_HOME_STRIP_ID;
  const title = makeElement(doc, 'div', 'seasonHomeTitle');
  const todayLine = makeElement(doc, 'div', 'seasonHomeToday');
  const bar = makeElement(doc, 'div', 'seasonHomeBar');
  const fill = makeElement(doc, 'div', 'seasonHomeBarFill');
  bar.append(fill);
  const meta = makeElement(doc, 'div', 'seasonHomeMeta');
  const levelText = makeElement(doc, 'span');
  const nextText = makeElement(doc, 'span');
  meta.append(levelText, nextText);
  const buttons = makeElement(doc, 'div', 'seasonHomeButtons');
  const catalogButton = makeElement(doc, 'button', null, 'カタログを見る');
  catalogButton.type = 'button';
  const scheduleButton = makeElement(doc, 'button', null, '予定を見る');
  scheduleButton.type = 'button';
  buttons.append(catalogButton, scheduleButton);
  const voteArea = makeElement(doc, 'div', 'seasonHomeVote');
  strip.append(title, todayLine, bar, meta, buttons, voteArea);
  home.append(strip);

  const catalogDialog = buildDialog(doc, SEASON_CATALOG_DIALOG_ID, 'カタログ（100段階）');
  const scheduleDialog = buildDialog(doc, SEASON_SCHEDULE_DIALOG_ID, '予定：第1シーズン');
  if (doc.body?.append) {
    doc.body.append(catalogDialog.root, scheduleDialog.root);
  }

  // 記録は season-store が1つだけ持つ。お題・ドロップ・本祭の取り付けも
  // 同じ記録を書き換えるため、変わるたびに読み直してから使う。
  const reload = (when) => { state = ensureCurrentSeasonMonth(store.load(when.month), when.month); };
  const save = (next, when) => { state = store.save(next, when.month); };

  const refresh = (when = todayParts()) => {
    reload(when);
    const snapshot = seasonHomeSnapshot(state, when);
    title.textContent = `第${snapshot.season.seasonIndex + 1}シーズン「${snapshot.season.nameProvisional}」`;
    todayLine.textContent = snapshot.todayText;
    fill.style = fill.style || {};
    fill.style.width = `${snapshot.catalog.level}%`;
    levelText.textContent = `カタログ（第1シーズン） ${snapshot.catalog.level}段階・${snapshot.catalog.points}点`;
    nextText.textContent = snapshot.catalog.isMax
      ? '100段階まで届いたよ'
      : `次まであと ${snapshot.catalog.pointsToNext}点`;
    voteArea.replaceChildren();
    if (snapshot.canVote) {
      voteArea.append(makeElement(doc, 'div', null, `お祭りの前夜祭：${snapshot.question.question}`));
      const row = makeElement(doc, 'div', 'seasonHomeVoteRow');
      snapshot.question.choices.forEach((choice, index) => {
        const button = makeElement(doc, 'button', null, choice);
        button.type = 'button';
        button.addEventListener('click', () => {
          reload(when);
          const result = voteSeasonFestival(state, { month: when.month, choiceIndex: index });
          if (!result.voted) return;
          const look = grantFestivalLook(result.state, when.month);
          save(look.state, when);
          refresh(when);
        });
        row.append(button);
      });
      voteArea.append(row);
    } else if (snapshot.festivalVoted) {
      const lookGranted = state.claimBox.grants.some((grant) => grant.id === `festival-look-S1-${when.month}`);
      voteArea.append(makeElement(doc, 'div', null, lookGranted
        ? `お祭りに投票したよ：「${snapshot.festivalVotedChoice}」。見た目はカタログの窓の「受け取り箱」に入ったよ。`
        : `お祭りに投票したよ：「${snapshot.festivalVotedChoice}」`));
    } else if (snapshot.festival.phase === 'main-first' || snapshot.festival.phase === 'main-second') {
      voteArea.append(makeElement(doc, 'div', null, 'お祭りの本祭中だよ。'));
    }
    return snapshot;
  };

  const renderCatalog = () => {
    renderCatalogBody(doc, catalogDialog.body, state, (level) => {
      const when = todayParts();
      reload(when);
      const result = claimSeasonFreeReward(state, level);
      if (result.claimed) { save(result.state, when); refresh(); renderCatalog(); }
    });
  };
  catalogButton.addEventListener('click', () => {
    renderCatalog();
    catalogDialog.root.hidden = false;
  });
  scheduleButton.addEventListener('click', () => {
    const when = todayParts();
    reload(when);
    renderScheduleBody(doc, scheduleDialog.body, seasonHomeSnapshot(state, when));
    scheduleDialog.root.hidden = false;
  });

  // 結果画面が出たら、対戦の結果の点を1回だけつける。
  const resultSection = doc.querySelector('section[data-screen="result"]');
  const onResultShown = () => {
    const when = todayParts();
    reload(when);
    const grade = doc.getElementById?.('resultGrade')?.textContent ?? '';
    const headline = doc.getElementById?.('resultHeadline')?.textContent ?? '';
    const rounds = doc.getElementById?.('resultRounds')?.textContent ?? '';
    const points = doc.getElementById?.('resultPointsEarned')?.textContent ?? '';
    const resultKey = buildSeasonResultKey({ grade, headline, rounds, points, ...when });
    const result = recordSeasonBattleResult(state, { resultKey, ...when });
    if (result.granted) { save(result.state, when); refresh(when); }
  };
  let observer = null;
  if (resultSection && typeof MutationObserver !== 'undefined') {
    let wasActive = resultSection.classList?.contains?.('active') === true;
    observer = new MutationObserver(() => {
      const active = resultSection.classList?.contains?.('active') === true;
      if (active && !wasActive) onResultShown();
      wasActive = active;
    });
    observer.observe(resultSection, { attributes: true, attributeFilter: ['class'] });
  }

  // お題・ドロップ・本祭・受け取り箱の取り付け（同じ記録を使う）。
  const eventsMount = mountSeasonEvents({
    document: doc,
    store,
    onChange: () => { refresh(); },
  });

  refresh(now);
  return Object.freeze({
    strip,
    catalogDialog: catalogDialog.root,
    scheduleDialog: scheduleDialog.root,
    refresh,
    onResultShown,
    getState: () => state,
    unmount: () => {
      observer?.disconnect?.();
      eventsMount?.unmount?.();
      strip.remove?.();
      catalogDialog.root.remove?.();
      scheduleDialog.root.remove?.();
    },
  });
}

// 本物の画面では、読み込まれたら自分で取り付ける（検査で読むときは document がないので何もしない）。
// 取り付けの手がかりは globalThis.__SEASON_HOME__ にも置く（画面の検査用）。
if (typeof document !== 'undefined' && typeof localStorage !== 'undefined') {
  try {
    globalThis.__SEASON_HOME__ = mountSeasonHome({ document, storage: localStorage });
  } catch (error) {
    console.warn('season-home-mount', error);
  }
}
