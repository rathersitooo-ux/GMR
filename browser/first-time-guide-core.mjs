// FIRST-TIME-GUIDE-HOME-SETUP-001 — 初めての人の案内（核）。
// 対象はホームから準備、初めての対戦を始めるまでの流れだけ。
// 対戦中の案内（今やること）は別の担当（BATTLE-NOW-GUIDE）のため、ここでは触らない。
//
// 決まっている考え方（2026-11-08、ライカの割り当て）：
// - 文字の説明はほとんど読まれない。長い説明ではなく、その場で教える・
//   すぐ使わせる・少しずつ重ねる・すぐ分かる反応を返す、の形で「なじませる」。
// - だから案内は1画面に1行だけ。文は短く、押す所を光らせ、
//   案内のボタン自体がその場で次の動きをする。
//
// 手元の写しで自分で確かめた、初めての人が止まる所：
// - ホームは行き先が多く、初めての人は「バトルへ」がどれか分からない。
// - 準備は選ぶものが多い（遊び方2つ・人数3つ・相手・デッキ・フレンドルーム・
//   対戦開始）。勝ち方の説明は「一列7枚」の題だけで、遊び方の説明文
//   （#contentNote へ出す形）は準備画面の見える所に出ていない。
// - デッキは既定で使えるものが入っているのに、それが分からない。
//   準備画面のデッキの欄は「デッキを確認中」から始まる。
// - 初めてかどうかの見分けは、保存の中の遊んだ回数（history）が 0 かで付く。
//   今は初回専用の案内がホーム／準備にはない。
//
// この核は「今どの案内を出すか」を決めるだけの表示専用部品。
// 対戦の状態・デッキ・勝敗・報酬は一切変えない（presentationOnly / autoExecute=false）。
// 文面と出し方（常時か初回だけか）の最終決定は決め待ち。
// 決まったら、この核の文と出し方だけを差し替える。
//
// レビュー51（ポケモンZAのチュートリアル比べ、2026-11-08）からの形：
// - チュートリアルの文は2文で短くする。1文は短く、大事な所だけ色を付ける。
// - ボタンには絵を入れる（文の中のボタン名と、ボタンの絵は同じ動きを指す）。
// - 大きな説明が終わったあとは、短い案内を2つだけ残す。
//   対戦中の画面に残す短い案内は、対戦の案内（BATTLE-NOW-GUIDE）の範囲のため
//   ここでは触らない。ここではホーム／準備に残す2つだけを扱う。
// - 新しい遊び方（じゃんけんで手番を決めること・ロードカードの力で順番が
//   決まること）は、使う場面（対戦開始の直前）でその場で教える。

export const FIRST_TIME_GUIDE_SCHEMA = 'gameroad.first-time-guide.v1';
export const FIRST_TIME_GUIDE_STORAGE_KEY = 'gameroad.first-time-guide.v1';

export const FIRST_TIME_GUIDE_STEPS = Object.freeze(['home', 'content', 'mode', 'ready']);

const STEP_BY_SCREEN = Object.freeze({
  home: 'home',
  setup: 'content',
});

// 文の決まり（レビュー51の形）：どの文も2文だけ。1文は20文字まで。
// ready の段は対戦開始の直前なので、ここで新しい遊び方を2文で教える
// （手番はじゃんけん・順番はロードカードの力）。「対戦開始を押す」は
// ボタンの文字と光る所が伝えるため、文には入れない。文面は仮置きで、最終決定は決め待ち。
const STEP_MESSAGES = Object.freeze({
  home: 'はじめは「バトル」から。いちばん大きなボタンを押すだけ',
  content: '遊び方は「ハニーハント」のままでOK。7枚ためると門が開くよ',
  mode: '人数は「四人」のままでOK。相手はCPUだよ',
  ready: '手番はじゃんけんで決まるよ。順番はロードカードの力で決まるよ',
});

const STEP_ACTIONS = Object.freeze({
  home: 'バトルへ',
  content: 'このままでOK',
  mode: 'このままでOK',
  ready: '対戦開始',
});

const STEP_TARGETS = Object.freeze({
  home: '.homePadChoice[data-home-target="setup"]',
  content: '.contentBtn[data-content="honey_hunt"]',
  mode: '.modeBtn[data-mode="4p"]',
  ready: '#startMatch',
});

// 文の中で色を付ける大事な所（ポケモンZAのオレンジの強調と同じ形）。
// どの emphasis も、その段の message の中にある文言そのもの。
const STEP_EMPHASIS = Object.freeze({
  home: '「バトル」',
  content: '7枚',
  mode: 'CPU',
  ready: 'じゃんけん',
});

// ボタンに入れる絵の種類。絵そのものは取り付け側が小さな線画で描く。
const STEP_ICONS = Object.freeze({
  home: 'swords',
  content: 'check',
  mode: 'check',
  ready: 'play',
});

const DECK_NOT_USABLE_MESSAGE = 'デッキがまだ使えないよ。「デッキへ」から直してね';
const DECK_NOT_USABLE_EMPHASIS = '「デッキへ」';
const DECK_NOT_USABLE_ICON = 'cards';

// 説明が終わったあと、ホーム／準備に残す短い案内は2つだけ。
// 中身はこのゲームの新しい遊び方の2つ（勝ち方と手番）。1つ12文字まで。
// 出すのは「案内が終わったあと、初めての対戦がまだ終わっていない間」だけ。
// 対戦が1回終わったら（history が 1 以上）、もう出さない。
export const FIRST_TIME_AFTER_GUIDE_ITEMS = Object.freeze([
  Object.freeze({ id: 'gate', text: '7枚ためると門が開く' }),
  Object.freeze({ id: 'janken', text: '手番はじゃんけんで決まる' }),
]);

// 文の決まりの上限（検査で縛る）。1文は20文字まで、残す案内は1つ12文字まで。
export const FIRST_TIME_GUIDE_SENTENCE_LIMIT = 20;
export const FIRST_TIME_AFTER_GUIDE_ITEM_LIMIT = 12;

function inactive(reason) {
  return Object.freeze({
    schema: FIRST_TIME_GUIDE_SCHEMA,
    active: false,
    reason,
    step: null,
    message: null,
    actionLabel: null,
    targetSelector: null,
    icon: null,
    emphasis: null,
    presentationOnly: true,
    autoExecute: false,
  });
}

function active(step, message, actionLabel, targetSelector, icon, emphasis) {
  return Object.freeze({
    schema: FIRST_TIME_GUIDE_SCHEMA,
    active: true,
    reason: null,
    step,
    message,
    actionLabel,
    targetSelector,
    icon,
    emphasis,
    presentationOnly: true,
    autoExecute: false,
  });
}

function token(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// snapshot: { screen, historyLength, dismissed, done, step, deckUsable }
// 画面の今の状態と、案内の進み具合だけを読む。状態は作らない。
export function projectFirstTimeGuide(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return inactive('SNAPSHOT_REQUIRED');
  }
  if (snapshot.done === true) return inactive('ALREADY_DONE');
  if (snapshot.dismissed === true) return inactive('DISMISSED');
  if (typeof snapshot.historyLength === 'number' && snapshot.historyLength > 0) {
    return inactive('ALREADY_PLAYED');
  }

  const screen = token(snapshot.screen);
  if (screen !== 'home' && screen !== 'setup') return inactive('GUIDE_CONTEXT_REQUIRED');

  const requestedStep = token(snapshot.step);
  const step = FIRST_TIME_GUIDE_STEPS.includes(requestedStep)
    ? requestedStep
    : STEP_BY_SCREEN[screen];
  // ホームでは home の案内だけ、準備では content 以降の案内だけを出す。
  // 画面と段が合わないときは、その画面の最初の段からやり直す。
  const effectiveStep = screen === 'home'
    ? 'home'
    : step === 'home' ? 'content' : step;

  if (effectiveStep === 'ready' && snapshot.deckUsable === false) {
    return active(
      effectiveStep,
      DECK_NOT_USABLE_MESSAGE,
      'デッキへ',
      '#fixDeckFromSetup',
      DECK_NOT_USABLE_ICON,
      DECK_NOT_USABLE_EMPHASIS,
    );
  }
  return active(
    effectiveStep,
    STEP_MESSAGES[effectiveStep],
    STEP_ACTIONS[effectiveStep],
    STEP_TARGETS[effectiveStep],
    STEP_ICONS[effectiveStep],
    STEP_EMPHASIS[effectiveStep],
  );
}

// 説明が終わったあとに残す短い案内（2つだけ）。
// 出すのは「案内が終わり（done）、まだ1回も遊んでいない（history 0）」
// 間だけ。ホーム／準備の画面だけ。閉じた（dismissed）ときは出さない。
// 対戦中の画面に残す短い案内は、対戦の案内（BATTLE-NOW-GUIDE）の範囲。
export function projectFirstTimeAfterGuide(snapshot = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return Object.freeze({ schema: FIRST_TIME_GUIDE_SCHEMA, active: false, reason: 'SNAPSHOT_REQUIRED', items: [] });
  }
  const screen = token(snapshot.screen);
  if (screen !== 'home' && screen !== 'setup') {
    return Object.freeze({ schema: FIRST_TIME_GUIDE_SCHEMA, active: false, reason: 'GUIDE_CONTEXT_REQUIRED', items: [] });
  }
  if (snapshot.done !== true) {
    return Object.freeze({ schema: FIRST_TIME_GUIDE_SCHEMA, active: false, reason: 'GUIDE_NOT_DONE', items: [] });
  }
  if (snapshot.dismissed === true) {
    return Object.freeze({ schema: FIRST_TIME_GUIDE_SCHEMA, active: false, reason: 'DISMISSED', items: [] });
  }
  if (snapshot.historyLength !== 0) {
    return Object.freeze({ schema: FIRST_TIME_GUIDE_SCHEMA, active: false, reason: 'ALREADY_PLAYED', items: [] });
  }
  return Object.freeze({
    schema: FIRST_TIME_GUIDE_SCHEMA,
    active: true,
    reason: null,
    items: FIRST_TIME_AFTER_GUIDE_ITEMS,
  });
}

export const FIRST_TIME_GUIDE_STEP_MESSAGES = STEP_MESSAGES;
export const FIRST_TIME_GUIDE_STEP_ACTIONS = STEP_ACTIONS;
export const FIRST_TIME_GUIDE_STEP_TARGETS = STEP_TARGETS;
export const FIRST_TIME_GUIDE_STEP_EMPHASIS = STEP_EMPHASIS;
export const FIRST_TIME_GUIDE_STEP_ICONS = STEP_ICONS;
export const FIRST_TIME_GUIDE_DECK_NOT_USABLE_MESSAGE = DECK_NOT_USABLE_MESSAGE;
export const FIRST_TIME_GUIDE_DECK_NOT_USABLE_EMPHASIS = DECK_NOT_USABLE_EMPHASIS;
export const FIRST_TIME_GUIDE_DECK_NOT_USABLE_ICON = DECK_NOT_USABLE_ICON;

// 次の段。home → content → mode → ready → done（null）。
export function nextFirstTimeGuideStep(step) {
  const index = FIRST_TIME_GUIDE_STEPS.indexOf(token(step));
  if (index < 0 || index + 1 >= FIRST_TIME_GUIDE_STEPS.length) return null;
  return FIRST_TIME_GUIDE_STEPS[index + 1];
}
