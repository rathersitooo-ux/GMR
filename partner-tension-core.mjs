// 相棒テンション（発話量）の核。C5 PARTNER-TENSION-SPEECH-DENSITY-CANON-001。
// 正本で決まっているのは「テンション＝発話量だけ」「音量ボタン風の上下操作」
// 「下げるほど喋らなくなる」「最低側は重要でない発話をほぼ行わない」
// 「判断に必要な情報は台詞に頼らない」「音量・ミュート・字幕とは別」の6点。
// 段階数・頻度・初期値はここでは推奨の形（3段階「静か／ふつう／よく話す」・初期値「ふつう」）
// を仮の正式値として置く。秒・分では決めず、発話の機会ごとに「出す／出さない」を分ける。
// 具体の「何割」は、同じ対戦の記録を3つの候補で回して測ってから決める（R11のB・D）。
// 画面へのつなぎ（設定画面の「パートナー音声音量」のとなり）はまだ。核と検査だけ先に作る。

const CORE_ID = 'gameroad.partner-tension-core.v1';

const STORAGE_KEY = 'GAMEROAD_PARTNER_TENSION';

const LEVELS = Object.freeze(['quiet', 'normal', 'chatty']);

const LEVEL_LABELS = Object.freeze({
  quiet: '静か',
  normal: 'ふつう',
  chatty: 'よく話す',
});

const DEFAULT_LEVEL = 'normal';

// 発話の機会の分け方（R11のA：5つの門のうち、テンションが変えてよいのは密度だけ）。
// essential（試合状態・必要操作・拒否理由など、利用者が判断に必要な情報）は
// 台詞の機会そのものではない。そもそも台詞に依存させず、通常の画面や記録で残す。
// milestone（節目）：対戦開始・結果・勝敗。flow（流れ）：対戦のきっかけ台詞。
// chat（雑談）：待機の雑談・反応。
const OPPORTUNITY_CLASS = Object.freeze({
  battle_start: 'milestone',
  game_result_first: 'milestone',
  attack_side_win: 'milestone',
  defense_side_win: 'milestone',
  initial_hand_intro: 'flow',
  duplicate_numbers: 'flow',
  honey_gained: 'flow',
  first_turn_start: 'flow',
  load_submit: 'flow',
  battle_card_submit: 'flow',
  load_reveal: 'flow',
  royal_reveal: 'flow',
  effect_activation: 'flow',
  delegate_normal: 'flow',
  idle_chat: 'chat',
});

// 段階ごとの密度の門。低は節目だけ、中は流れまで、高は雑談まで出す。
// 「何割」ではなく場面の種類で分けるのが今の形。具体の割は測ってから決める。
const DENSITY_ALLOWANCE = Object.freeze({
  quiet: Object.freeze(['milestone']),
  normal: Object.freeze(['milestone', 'flow']),
  chatty: Object.freeze(['milestone', 'flow', 'chat']),
});

// 5つの門の分け方。density と repeat-history だけ今ここで動く。
// 残りは後の仕事で埋める場所として名前だけ置く。
const GATES = Object.freeze([
  Object.freeze({ id: 'context_attention', implemented: true, note: '忙しい操作の最中は出さない' }),
  Object.freeze({ id: 'meaning_freshness', implemented: false, note: '古くなった出来事の台詞は出さない（未実装）' }),
  Object.freeze({ id: 'repeat_history', implemented: true, note: '直近と同じ台詞は出さない' }),
  Object.freeze({ id: 'interruption_resume', implemented: false, note: '中断・再開のため込みを防ぐ（未実装）' }),
  Object.freeze({ id: 'tension_density', implemented: true, note: '段階で変わる発話の機会の密度' }),
]);

const REPEAT_HISTORY_SIZE = 3;

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}

function normalizeTensionLevel(value) {
  return LEVELS.includes(value) ? value : DEFAULT_LEVEL;
}

function classifyOpportunity(kind) {
  if (typeof kind !== 'string' || !kind) return null;
  if (kind === 'match_state' || kind === 'required_action' || kind === 'rejection_reason') return 'essential';
  return OPPORTUNITY_CLASS[kind] || null;
}

function isTensionControlled(kind) {
  const klass = classifyOpportunity(kind);
  return klass !== null && klass !== 'essential';
}

function createTensionState() {
  return {
    recentSpokenTexts: [],
    opportunities: 0,
    spoken: 0,
    suppressedByReason: Object.freeze({}),
  };
}

function countSuppressed(state, reason) {
  const next = { ...state.suppressedByReason };
  next[reason] = (next[reason] || 0) + 1;
  return Object.freeze(next);
}

// 発話の可否を決める。state は createTensionState() の返すものを使う。
// 返すのは { speak, reason, level, opportunityClass }。
// reason は通った門・止めた門の名前。通ったときは 'ALLOWED'。
function decideSpeech(state, input) {
  const level = normalizeTensionLevel(input && input.level);
  const kind = input && input.kind;
  const text = input && typeof input.text === 'string' ? input.text : '';
  const busy = Boolean(input && input.busy);
  const opportunityClass = classifyOpportunity(kind);
  state.opportunities += 1;

  if (opportunityClass === null) {
    state.suppressedByReason = countSuppressed(state, 'UNKNOWN_KIND');
    return { speak: false, reason: 'UNKNOWN_KIND', level, opportunityClass: null };
  }
  if (opportunityClass === 'essential') {
    // 判断に必要な情報は台詞にしない。画面や記録が持つ。門ではなく入口の問題。
    state.suppressedByReason = countSuppressed(state, 'ESSENTIAL_NOT_DIALOGUE');
    return { speak: false, reason: 'ESSENTIAL_NOT_DIALOGUE', level, opportunityClass };
  }
  if (busy) {
    state.suppressedByReason = countSuppressed(state, 'BUSY_CONTEXT');
    return { speak: false, reason: 'BUSY_CONTEXT', level, opportunityClass };
  }
  if (text && state.recentSpokenTexts.includes(text)) {
    state.suppressedByReason = countSuppressed(state, 'REPEAT_HISTORY');
    return { speak: false, reason: 'REPEAT_HISTORY', level, opportunityClass };
  }
  if (!DENSITY_ALLOWANCE[level].includes(opportunityClass)) {
    state.suppressedByReason = countSuppressed(state, 'TENSION_DENSITY');
    return { speak: false, reason: 'TENSION_DENSITY', level, opportunityClass };
  }
  state.spoken += 1;
  if (text) {
    state.recentSpokenTexts = [...state.recentSpokenTexts, text].slice(-REPEAT_HISTORY_SIZE);
  }
  return { speak: true, reason: 'ALLOWED', level, opportunityClass };
}

// 音量ボタン風の＋／－操作。端では止まる（回らない）。
function nextTensionLevel(level, direction) {
  const current = normalizeTensionLevel(level);
  const index = LEVELS.indexOf(current);
  if (direction === 'up') return LEVELS[Math.min(index + 1, LEVELS.length - 1)];
  if (direction === 'down') return LEVELS[Math.max(index - 1, 0)];
  return current;
}

function loadTensionLevel(storage) {
  if (!storage || typeof storage.getItem !== 'function') return DEFAULT_LEVEL;
  try {
    return normalizeTensionLevel(storage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LEVEL;
  }
}

function saveTensionLevel(storage, level) {
  const normalized = normalizeTensionLevel(level);
  if (!storage || typeof storage.setItem !== 'function') return normalized;
  try {
    storage.setItem(STORAGE_KEY, normalized);
  } catch {
    // 保存できない端末では、返す値だけ正しくする。
  }
  return normalized;
}

export {
  CORE_ID,
  STORAGE_KEY,
  LEVELS,
  LEVEL_LABELS,
  DEFAULT_LEVEL,
  OPPORTUNITY_CLASS,
  DENSITY_ALLOWANCE,
  GATES,
  REPEAT_HISTORY_SIZE,
  normalizeTensionLevel,
  classifyOpportunity,
  isTensionControlled,
  createTensionState,
  decideSpeech,
  nextTensionLevel,
  loadTensionLevel,
  saveTensionLevel,
};
export default Object.freeze({
  CORE_ID,
  STORAGE_KEY,
  LEVELS,
  LEVEL_LABELS,
  DEFAULT_LEVEL,
  OPPORTUNITY_CLASS,
  DENSITY_ALLOWANCE,
  GATES,
  REPEAT_HISTORY_SIZE,
  normalizeTensionLevel,
  classifyOpportunity,
  isTensionControlled,
  createTensionState,
  decideSpeech,
  nextTensionLevel,
  loadTensionLevel,
  saveTensionLevel,
});
