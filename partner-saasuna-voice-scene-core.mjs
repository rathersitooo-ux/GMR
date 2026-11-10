// サースナーの声「1つ完成」の核。
// 既にある部品（対戦セリフ・端末音声と調声・立ち絵と動き）を、1つの場面として
// 束ねる。文・声・動き・絵を別々に呼ぶのではなく、この計画を1つ作れば
// 全部そろう形にする。
// 正式な声はまだない。ここで完成させるのは「受理の手前」まで:
// 端末の声で全場面が声+動き+絵つきで再生でき、旗で再生の結果が残り、
// 声を消しても文と動きは残る（パージでも場面は成立する）ところまで。
import {
  SAASUNA_BATTLE_SPEECH_ACT,
  SAASUNA_DIALOGUE_SOURCE_ID,
  SAASUNA_DIALOGUE_VERSION,
  SAASUNA_PARTNER_ID,
  getSaasunaConversationSource,
  selectSaasunaBattleUtterance,
  selectSaasunaFallback,
} from './partner-saasuna-conversation-source.mjs';
import {
  SAASUNA_VOICE_RUNTIME,
  buildSaasunaVoicePreviewPlan,
  previewSaasunaVoice,
} from './partner-saasuna-voice-runtime.mjs';
import { normalizePartnerVoiceTuning } from './partner-dialogue-feedback-core.mjs';
import {
  SAASUNA_MOTION_STATES,
  resolveSaasunaMotionPlan,
} from './partner-saasuna-motion-core.mjs';
import { SAASUNA_BUSTUP_ASSETS } from './partner-saasuna-bustup-visuals.mjs';

export const SAASUNA_VOICE_SCENE_SCHEMA = 'gameroad.partner-saasuna-voice-scene.v1';

// サースナー1人目の声の土台（仮の決め。耳で聞いて直す前提の出発点）。
// 人柄の正本は「冷静で戦略的、礼儀と自信。食べ物と妹の話では平静が崩れる」。
// 端末音声は素のままだと平たいため、少しだけ高く・少しだけゆっくりに寄せる。
export const SAASUNA_VOICE_PRESET = Object.freeze({
  id: 'saasuna-voice-preset-1',
  label: 'サースナー 声の土台1（仮）',
  tuning: Object.freeze({
    rate: 0.95,
    pitch: 1.15,
    volume: 1,
    pauseMs: 160,
    voiceURI: '',
  }),
  provisional: true,
  canonicalVoice: false,
  productionFormalVoice: false,
  note: '正式な声の受理前。端末の日本語音声にこの調整を重ねた仮の声。',
});

// 対戦の合図ごとに、どの動きで言うか。動きの正本は motion-core の9種。
// 食べ物で平静が崩れる所（honey_gained）は驚き、勝ちの締めは笑顔、
// といった人柄の出どころは conversation-source の personaGuidance。
export const SAASUNA_TRIGGER_MOTION = Object.freeze({
  battle_start: 'GUIDE_PRESENT',
  initial_hand_intro: 'CURIOUS_CONFUSED',
  duplicate_numbers: 'HAPPY_SMILE',
  honey_gained: 'SURPRISED',
  first_turn_start: 'GUIDE_PRESENT',
  load_submit: 'IDLE_GENTLE',
  battle_card_submit: 'GUIDE_PRESENT',
  load_reveal: 'SURPRISED',
  royal_reveal: 'HAPPY_WAVE',
  effect_activation: 'GUIDE_PRESENT',
  delegate_normal: 'HAPPY_SMILE',
  game_result_first: 'HAPPY_SMILE',
  attack_side_win: 'HAPPY_SMILE',
  defense_side_win: 'HAPPY_SMILE',
  idle: 'IDLE_GENTLE',
});

export const SAASUNA_VOICE_SCENE_TRIGGERS = Object.freeze(Object.keys(SAASUNA_TRIGGER_MOTION));

function mergeTuning(override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return normalizePartnerVoiceTuning(SAASUNA_VOICE_PRESET.tuning);
  }
  return normalizePartnerVoiceTuning({ ...SAASUNA_VOICE_PRESET.tuning, ...override });
}

// 1場面分の計画を作る。作れなければ null（黙って落ちる、他のキャラへ流用しない）。
// input: {
//   triggerId,            // 対戦の合図 or 'idle'
//   seed, fields,         // 文の選択と {カード名} の差し込み
//   tuning,               // 土台の上書き（任意）
//   voiceEnabled,         // false で声だけ止める（文・動き・絵は残る）
//   voicePurged,          // true で声の部品ごと外す（文・動き・絵は残る）
//   reducedMotion,        // true で動きを止め絵にする（絵と文は残る）
// }
export function buildSaasunaVoiceScenePlan(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const triggerId = typeof input.triggerId === 'string' ? input.triggerId : null;
  if (!triggerId || !Object.hasOwn(SAASUNA_TRIGGER_MOTION, triggerId)) return null;

  let text = null;
  let utterance = null;
  if (triggerId === 'idle') {
    text = selectSaasunaFallback(typeof input.seed === 'string' ? input.seed : 'idle');
  } else {
    utterance = selectSaasunaBattleUtterance({
      partnerId: SAASUNA_PARTNER_ID,
      dialogueVersion: SAASUNA_DIALOGUE_VERSION,
      sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
      speechAct: SAASUNA_BATTLE_SPEECH_ACT,
      triggerId,
      seed: input.seed,
      fields: input.fields,
    });
    text = utterance?.text ?? null;
  }
  if (!text) return null;

  const tuning = mergeTuning(input.tuning);
  const voicePlan = buildSaasunaVoicePreviewPlan({ text, tuning });
  if (!voicePlan) return null;

  const motionState = SAASUNA_TRIGGER_MOTION[triggerId];
  const motionPlan = resolveSaasunaMotionPlan({
    partnerId: SAASUNA_PARTNER_ID,
    visualState: motionState,
  });
  if (!motionPlan) return null;

  const purged = input.voicePurged === true;
  const enabled = input.voiceEnabled !== false;
  const shouldSpeak = enabled && !purged;
  const voiceReason = purged
    ? 'voice_purged'
    : enabled
      ? null
      : 'voice_off';

  const reducedMotion = input.reducedMotion === true;

  return Object.freeze({
    schema: SAASUNA_VOICE_SCENE_SCHEMA,
    partnerId: SAASUNA_PARTNER_ID,
    displayName: SAASUNA_VOICE_RUNTIME.displayName,
    triggerId,
    text,
    sourceState: 'approved_current',
    dialogueVersion: SAASUNA_DIALOGUE_VERSION,
    sourceId: SAASUNA_DIALOGUE_SOURCE_ID,
    presetId: SAASUNA_VOICE_PRESET.id,
    voice: Object.freeze({
      shouldSpeak,
      reason: voiceReason,
      segments: voicePlan.segments,
      tuning: voicePlan.tuning,
      runtime: SAASUNA_VOICE_RUNTIME,
      provisional: true,
      canonicalVoice: false,
      productionFormalVoice: false,
    }),
    motion: Object.freeze({
      state: motionPlan.state,
      durationMs: motionPlan.durationMs,
      loop: motionPlan.loop,
      easing: motionPlan.easing,
      keyframes: motionPlan.keyframes,
      effect: motionPlan.effect,
      returnState: motionPlan.returnState,
      suppressed: reducedMotion,
    }),
    asset: Object.freeze({
      state: motionPlan.state,
      fileName: motionPlan.asset.fileName,
      src: motionPlan.asset.src,
    }),
    presentationOnly: true,
    gameplayAuthorityMutated: false,
    autoExecute: false,
  });
}

// 完成の内訳。数が合っているかを検査と引き継ぎで使う。
export function buildSaasunaVoiceCompleteness() {
  const source = getSaasunaConversationSource();
  const battleTriggerIds = source ? [...source.approvedBattleTriggerIds] : [];
  const mappedBattle = battleTriggerIds.filter((id) => Object.hasOwn(SAASUNA_TRIGGER_MOTION, id));
  return Object.freeze({
    schema: SAASUNA_VOICE_SCENE_SCHEMA,
    partnerId: SAASUNA_PARTNER_ID,
    displayName: SAASUNA_VOICE_RUNTIME.displayName,
    battleLineCount: battleTriggerIds.length,
    battleLinesWithMotion: mappedBattle.length,
    fallbackLineCount: source ? source.approvedFallbackLines.length : 0,
    motionStateCount: SAASUNA_MOTION_STATES.length,
    bustupAssetCount: Object.keys(SAASUNA_BUSTUP_ASSETS).length,
    preset: SAASUNA_VOICE_PRESET,
    voiceProvider: SAASUNA_VOICE_RUNTIME.provider,
    provisional: true,
    canonicalVoice: false,
    productionFormalVoice: false,
    formalAcceptancePending: true,
    formalAcceptanceNote: '正式な声（声の主・録音・権利・受理）は人が決める。ここは受理の手前まで。',
  });
}

// 場面の再生役。声と動きを同時に始め、同じ場面は1回だけ鳴らす。
// 旗は端末に残す形と同じ3種: 聞けた / 飛ばした / 聞けなかった。
// （「失敗した」という言い方はしない。利用者の目線の言葉にそろえる。）
export function createSaasunaVoiceScenePlayer({
  previewVoice = previewSaasunaVoice,
  motionController = null,
  onFlag = null,
} = {}) {
  if (typeof previewVoice !== 'function') throw new TypeError('previewVoice must be a function');
  const played = new Set();
  const flags = [];
  let active = null;

  const record = (entry) => {
    const frozen = Object.freeze({ ...entry });
    flags.push(frozen);
    if (typeof onFlag === 'function') {
      try { onFlag(frozen); } catch {}
    }
    return frozen;
  };

  const cancelActive = (markSkipped) => {
    const current = active;
    if (!current) return;
    active = null;
    if (markSkipped && !current.settled) {
      current.settled = true;
      record({ kind: 'skipped', triggerId: current.plan.triggerId, text: current.plan.text });
    }
    try { current.voiceResult?.cancel?.(); } catch {}
  };

  const play = (plan, { fingerprint } = {}) => {
    if (!plan || plan.schema !== SAASUNA_VOICE_SCENE_SCHEMA || plan.partnerId !== SAASUNA_PARTNER_ID) {
      return Object.freeze({ ok: false, reason: 'saasuna_voice_scene_plan_invalid' });
    }
    const key = typeof fingerprint === 'string' && fingerprint ? fingerprint : `${plan.triggerId}:${plan.text}`;
    if (played.has(key)) {
      return Object.freeze({ ok: false, reason: 'saasuna_voice_scene_already_played', fingerprint: key });
    }
    played.add(key);
    cancelActive(true);

    if (motionController && typeof motionController.setState === 'function') {
      try {
        motionController.setState(
          { partnerId: SAASUNA_PARTNER_ID, visualState: plan.motion.state },
          { restart: true },
        );
      } catch {}
    }

    if (!plan.voice.shouldSpeak) {
      record({
        kind: plan.voice.reason === 'voice_purged' ? 'purged' : 'muted',
        triggerId: plan.triggerId,
        text: plan.text,
      });
      return Object.freeze({
        ok: true,
        reason: null,
        fingerprint: key,
        plan,
        spoken: false,
        done: Promise.resolve(Object.freeze({ status: 'silent', reason: plan.voice.reason })),
      });
    }

    let result;
    try {
      result = previewVoice({ text: plan.text, tuning: plan.voice.tuning });
    } catch {
      record({ kind: 'notHeard', triggerId: plan.triggerId, text: plan.text });
      return Object.freeze({
        ok: true,
        reason: null,
        fingerprint: key,
        plan,
        spoken: false,
        done: Promise.resolve(Object.freeze({ status: 'error', reason: 'saasuna_voice_start_failed' })),
      });
    }

    if (!result?.ok) {
      record({ kind: 'notHeard', triggerId: plan.triggerId, text: plan.text });
      return Object.freeze({
        ok: true,
        reason: null,
        fingerprint: key,
        plan,
        spoken: false,
        done: Promise.resolve(Object.freeze({ status: 'error', reason: result?.reason ?? 'saasuna_voice_unsupported' })),
      });
    }

    const entry = { plan, voiceResult: result, settled: false };
    active = entry;
    const done = Promise.resolve(result.done).then((outcome) => {
      if (entry.settled) return outcome;
      entry.settled = true;
      if (active === entry) active = null;
      if (outcome?.status === 'completed') {
        record({ kind: 'heard', triggerId: plan.triggerId, text: plan.text });
      } else if (outcome?.status === 'cancelled') {
        record({ kind: 'skipped', triggerId: plan.triggerId, text: plan.text });
      } else {
        record({ kind: 'notHeard', triggerId: plan.triggerId, text: plan.text });
      }
      return outcome;
    });
    return Object.freeze({ ok: true, reason: null, fingerprint: key, plan, spoken: true, done });
  };

  return Object.freeze({
    play,
    stop() { cancelActive(true); },
    flags: () => Object.freeze([...flags]),
    playedCount: () => played.size,
    reset() {
      cancelActive(false);
      played.clear();
    },
  });
}
