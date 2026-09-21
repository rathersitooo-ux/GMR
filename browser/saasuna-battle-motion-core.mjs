import { SAASUNA_PARTNER_ID } from './partner-saasuna-conversation-source.mjs';
import { SAASUNA_BUSTUP_ASSETS } from './partner-saasuna-bustup-visuals.mjs';

const MOTION_STYLE_ID = 'gameroad-saasuna-battle-motion-r1';
const KEYFRAME_SHEET_FILE = 'saasuna-battle-keyframes-r1.png';
const KEYFRAME_SHEET_URL = new URL(`../assets/visual/provisional/${KEYFRAME_SHEET_FILE}`, import.meta.url).href;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function profile({ state, keyframeId, column, row, emotionState, durationMs, loop = false, easing, effect = 'none' }) {
  return freeze({
    state,
    keyframeId,
    column,
    row,
    emotionState,
    durationMs,
    loop,
    easing,
    effect,
    backgroundPosition: `${column * 50}% ${row * 50}%`,
  });
}

// The sheet is deliberately a 3x3 provisional storyboard. It is not formal art.
export const SAASUNA_BATTLE_MOTION_PROFILES = freeze({
  IDLE_GENTLE: profile({
    state: 'IDLE_GENTLE', keyframeId: 'idle', column: 0, row: 0, emotionState: 'IDLE_GENTLE',
    durationMs: 1400, loop: true, easing: 'ease-in-out', effect: 'none'
  }),
  ENTRY_SKATE: profile({
    state: 'ENTRY_SKATE', keyframeId: 'result-glide', column: 2, row: 2, emotionState: 'GUIDE_PRESENT',
    durationMs: 760, easing: 'cubic-bezier(.16,.78,.2,1)', effect: 'ice'
  }),
  STAFF_FREEZE: profile({
    state: 'STAFF_FREEZE', keyframeId: 'staff-freeze', column: 1, row: 0, emotionState: 'GUIDE_PRESENT',
    durationMs: 820, easing: 'cubic-bezier(.18,.82,.2,1)', effect: 'ice'
  }),
  ICE_SLIDE_LOW: profile({
    state: 'ICE_SLIDE_LOW', keyframeId: 'ice-slide-low', column: 2, row: 0, emotionState: 'CURIOUS_CONFUSED',
    durationMs: 860, easing: 'cubic-bezier(.12,.86,.2,1)', effect: 'ice-wind'
  }),
  SKIRT_SPIN: profile({
    state: 'SKIRT_SPIN', keyframeId: 'skirt-spin', column: 0, row: 1, emotionState: 'HAPPY_WAVE',
    durationMs: 900, easing: 'cubic-bezier(.14,.82,.18,1)', effect: 'wind'
  }),
  MAGIC_RELEASE: profile({
    state: 'MAGIC_RELEASE', keyframeId: 'magic-release', column: 1, row: 1, emotionState: 'SURPRISED',
    durationMs: 780, easing: 'cubic-bezier(.14,.84,.2,1)', effect: 'ice-wind'
  }),
  WIND_CUT: profile({
    state: 'WIND_CUT', keyframeId: 'wind-cut', column: 2, row: 1, emotionState: 'HAPPY_SMILE',
    durationMs: 620, easing: 'cubic-bezier(.16,.78,.22,1)', effect: 'wind'
  }),
  HIT_RECOIL: profile({
    state: 'HIT_RECOIL', keyframeId: 'wind-cut', column: 2, row: 1, emotionState: 'TOUCH_CRY',
    durationMs: 620, easing: 'cubic-bezier(.2,.68,.24,1)', effect: 'impact'
  }),
  KNEE_PILLOW: profile({
    state: 'KNEE_PILLOW', keyframeId: 'knee-pillow', column: 0, row: 2, emotionState: 'HAPPY_SMILE',
    durationMs: 1200, easing: 'cubic-bezier(.2,.8,.24,1)', effect: 'none'
  }),
  MATERNAL_HUG: profile({
    state: 'MATERNAL_HUG', keyframeId: 'maternal-hug', column: 1, row: 2, emotionState: 'HAPPY_WAVE',
    durationMs: 1100, easing: 'cubic-bezier(.18,.86,.22,1)', effect: 'ice'
  }),
  RESULT_GLIDE: profile({
    state: 'RESULT_GLIDE', keyframeId: 'result-glide', column: 2, row: 2, emotionState: 'HAPPY_SMILE',
    durationMs: 1050, easing: 'cubic-bezier(.18,.82,.22,1)', effect: 'ice-wind'
  }),
});

export const SAASUNA_BATTLE_MOTION_STATES = Object.freeze(Object.keys(SAASUNA_BATTLE_MOTION_PROFILES));
export const SAASUNA_BATTLE_KEYFRAME_SHEET = freeze({
  fileName: KEYFRAME_SHEET_FILE,
  src: KEYFRAME_SHEET_URL,
  columns: 3,
  rows: 3,
  provisional: true,
  formalArt: false,
});

function own(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function normalizeState(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replaceAll('-', '_') : '';
}

export function resolveSaasunaBattleMotionState(input = {}) {
  const characterId = input.characterId ?? input.partnerId;
  if (characterId && characterId !== SAASUNA_PARTNER_ID) return null;

  const explicit = normalizeState(input.motionState ?? input.state ?? input.cue);
  if (explicit && own(SAASUNA_BATTLE_MOTION_PROFILES, explicit)) return explicit;

  const phase = normalizeState(input.phase);
  const role = normalizeState(input.role);
  const transition = normalizeState(input.transition);

  if (explicit === 'KNEE_PILLOW' || input.kneePillow === true) return 'KNEE_PILLOW';
  if (explicit === 'MATERNAL_HUG' || input.maternalHug === true) return 'MATERNAL_HUG';
  if (phase === 'ATTACK') return role === 'TARGET' ? 'HIT_RECOIL' : 'MAGIC_RELEASE';
  if (phase === 'ABILITY') return role === 'TARGET' ? 'HIT_RECOIL' : 'ICE_SLIDE_LOW';
  if (transition === 'ENTRY' || phase === 'REVEAL') return 'ENTRY_SKATE';
  if (phase === 'FINISHER') return 'SKIRT_SPIN';
  if (phase === 'SETTLE' || phase === 'RESULT') return 'RESULT_GLIDE';
  if (transition.includes('IMPACT')) return role === 'TARGET' ? 'HIT_RECOIL' : 'WIND_CUT';
  return 'IDLE_GENTLE';
}

export function resolveSaasunaBattleMotionPlan(input = {}) {
  const state = resolveSaasunaBattleMotionState(input);
  if (!state) return null;
  const motion = SAASUNA_BATTLE_MOTION_PROFILES[state];
  const emotionAsset = SAASUNA_BUSTUP_ASSETS[motion.emotionState] ?? null;
  return freeze({
    ...motion,
    state,
    keyframeSheet: SAASUNA_BATTLE_KEYFRAME_SHEET,
    emotionAsset,
    presentationOnly: true,
    gameplayAuthority: false,
    formalArt: false,
  });
}

function createNode(doc, tag, className = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  return node;
}

function setData(node, key, value) {
  if (!node?.dataset) return;
  if (value == null) delete node.dataset[key];
  else node.dataset[key] = String(value);
}

export function ensureSaasunaBattleMotionStyle(doc) {
  if (!doc?.head || typeof doc.createElement !== 'function') return false;
  if (doc.getElementById?.(MOTION_STYLE_ID)) return false;
  const style = createNode(doc, 'style');
  style.id = MOTION_STYLE_ID;
  style.textContent = `
[data-role="saasuna-battle-motion-surface"]{position:absolute;inset:-12% -24% 0;z-index:2;pointer-events:none;overflow:visible;transform-origin:50% 100%;}
[data-role="saasuna-battle-keyframe"]{position:absolute;inset:0;background-repeat:no-repeat;background-size:300% 300%;background-color:rgba(205,231,248,.08);background-blend-mode:screen;filter:drop-shadow(0 10px 12px rgba(0,18,40,.24));opacity:.98;transform-origin:50% 100%;}
[data-role="saasuna-battle-keyframe"][hidden],[data-role="saasuna-battle-ice"][hidden],[data-role="saasuna-battle-wind"][hidden],[data-role="saasuna-battle-impact"][hidden]{display:none!important}
[data-role="saasuna-battle-ice"],[data-role="saasuna-battle-wind"],[data-role="saasuna-battle-impact"]{position:absolute;inset:0;display:block;pointer-events:none;}
[data-role="saasuna-battle-ice"]{inset:auto -18% -2%;height:34%;opacity:0;transform-origin:50% 100%;background:linear-gradient(180deg,transparent,rgba(167,237,255,.46) 46%,rgba(239,253,255,.08));clip-path:polygon(0 100%,12% 49%,35% 62%,52% 5%,72% 58%,100% 38%,100% 100%);filter:blur(.2px) drop-shadow(0 0 12px rgba(138,226,255,.8));}
[data-role="saasuna-battle-ice"]::after{content:"";position:absolute;left:12%;right:10%;bottom:21%;height:3px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(240,255,255,.95),rgba(130,216,255,.45),transparent);box-shadow:0 0 12px rgba(161,232,255,.88);transform:rotate(-8deg);}
[data-role="saasuna-battle-wind"] i{position:absolute;display:block;left:3%;width:64%;height:3px;border-radius:999px;background:linear-gradient(90deg,transparent,rgba(225,253,255,.9) 25%,rgba(145,224,255,.72) 72%,transparent);box-shadow:0 0 8px rgba(167,239,255,.6);opacity:0;transform-origin:left center;}
[data-role="saasuna-battle-wind"] i:nth-child(1){top:33%;transform:rotate(-18deg)}
[data-role="saasuna-battle-wind"] i:nth-child(2){top:49%;width:52%;transform:rotate(-13deg);opacity:.6}
[data-role="saasuna-battle-wind"] i:nth-child(3){top:64%;width:42%;transform:rotate(-8deg);opacity:.38}
[data-role="saasuna-battle-impact"]{opacity:0;inset:25% -8% 28%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,255,255,.92),rgba(181,235,255,.48) 18%,transparent 69%);filter:blur(1px);}
[data-saasuna-battle-motion-state="ENTRY_SKATE"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleEntry 760ms cubic-bezier(.16,.78,.2,1) both}
[data-saasuna-battle-motion-state="STAFF_FREEZE"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattlePlant 820ms cubic-bezier(.18,.82,.2,1) both}
[data-saasuna-battle-motion-state="ICE_SLIDE_LOW"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleLowSlide 860ms cubic-bezier(.12,.86,.2,1) both}
[data-saasuna-battle-motion-state="SKIRT_SPIN"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleSpin 900ms cubic-bezier(.14,.82,.18,1) both}
[data-saasuna-battle-motion-state="MAGIC_RELEASE"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleRelease 780ms cubic-bezier(.14,.84,.2,1) both}
[data-saasuna-battle-motion-state="WIND_CUT"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleWindCut 620ms cubic-bezier(.16,.78,.22,1) both}
[data-saasuna-battle-motion-state="HIT_RECOIL"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleHit 620ms cubic-bezier(.2,.68,.24,1) both}
[data-saasuna-battle-motion-state="KNEE_PILLOW"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleComfort 1200ms cubic-bezier(.2,.8,.24,1) both}
[data-saasuna-battle-motion-state="MATERNAL_HUG"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleHug 1100ms cubic-bezier(.18,.86,.22,1) both}
[data-saasuna-battle-motion-state="RESULT_GLIDE"] [data-role="saasuna-battle-motion-surface"]{animation:saasunaBattleResult 1050ms cubic-bezier(.18,.82,.22,1) both}
[data-saasuna-battle-motion-state="STAFF_FREEZE"] [data-role="saasuna-battle-ice"],[data-saasuna-battle-motion-state="ICE_SLIDE_LOW"] [data-role="saasuna-battle-ice"],[data-saasuna-battle-motion-state="MAGIC_RELEASE"] [data-role="saasuna-battle-ice"],[data-saasuna-battle-motion-state="MATERNAL_HUG"] [data-role="saasuna-battle-ice"],[data-saasuna-battle-motion-state="RESULT_GLIDE"] [data-role="saasuna-battle-ice"]{animation:saasunaBattleIce 820ms ease-out both}
[data-saasuna-battle-motion-state="ICE_SLIDE_LOW"] [data-role="saasuna-battle-wind"],[data-saasuna-battle-motion-state="SKIRT_SPIN"] [data-role="saasuna-battle-wind"],[data-saasuna-battle-motion-state="MAGIC_RELEASE"] [data-role="saasuna-battle-wind"],[data-saasuna-battle-motion-state="WIND_CUT"] [data-role="saasuna-battle-wind"]{animation:saasunaBattleWind 720ms cubic-bezier(.16,.78,.22,1) both}
[data-saasuna-battle-motion-state="HIT_RECOIL"] [data-role="saasuna-battle-impact"]{animation:saasunaBattleImpact 620ms ease-out both}
[data-saasuna-battle-motion-state="static_only"] [data-role="saasuna-battle-motion-surface"],[data-saasuna-battle-motion="static_only"] [data-role="saasuna-battle-motion-surface"]{animation:none!important}
[data-saasuna-battle-motion="static_only"] [data-role="saasuna-battle-ice"],[data-saasuna-battle-motion="static_only"] [data-role="saasuna-battle-wind"],[data-saasuna-battle-motion="static_only"] [data-role="saasuna-battle-impact"]{animation:none!important;opacity:.22!important}
@keyframes saasunaBattleEntry{0%{opacity:.18;transform:translate3d(-34px,8px,0) scale(.88) rotate(-4deg)}68%{opacity:1;transform:translate3d(4px,-4px,0) scale(1.05) rotate(2deg)}100%{opacity:1;transform:none}}
@keyframes saasunaBattlePlant{0%{transform:translate3d(0,16px,0) scale(.96)}44%{transform:translate3d(0,-4px,0) scale(1.04)}100%{transform:none}}
@keyframes saasunaBattleLowSlide{0%{transform:translate3d(-22px,18px,0) rotate(-5deg) scale(.96,.92)}38%{transform:translate3d(4px,12px,0) rotate(2deg) scale(1.04,.94)}72%{transform:translate3d(20px,4px,0) rotate(360deg) scale(1.03)}100%{transform:translate3d(0,0,0) rotate(360deg) scale(1)}}
@keyframes saasunaBattleSpin{0%{transform:translate3d(-4px,8px,0) rotate(-10deg) scale(.94)}46%{transform:translate3d(0,-10px,0) rotate(176deg) scale(1.08)}82%{transform:translate3d(0,-3px,0) rotate(340deg) scale(1.02)}100%{transform:none}}
@keyframes saasunaBattleRelease{0%{transform:translate3d(-8px,10px,0) scale(.94)}42%{transform:translate3d(10px,-4px,0) scale(1.06)}66%{transform:translate3d(16px,-1px,0) scale(1.08)}100%{transform:none}}
@keyframes saasunaBattleWindCut{0%{transform:translate3d(-16px,6px,0) skewX(-6deg);opacity:.2}50%{transform:translate3d(9px,-3px,0) skewX(5deg);opacity:1}100%{transform:none;opacity:1}}
@keyframes saasunaBattleHit{0%,42%{transform:translate3d(12px,0,0) scale(.96);opacity:.32}58%{transform:translate3d(-6px,2px,0) rotate(-5deg) scale(1.02);opacity:1}100%{transform:none;opacity:1}}
@keyframes saasunaBattleComfort{0%{transform:translate3d(0,10px,0) scale(.94)}45%{transform:translate3d(0,-2px,0) scale(1.03)}100%{transform:none}}
@keyframes saasunaBattleHug{0%{transform:translate3d(0,8px,0) scale(.94)}46%{transform:translate3d(0,-3px,0) scale(1.06)}100%{transform:none}}
@keyframes saasunaBattleResult{0%{transform:translate3d(-20px,8px,0) rotate(-3deg) scale(.92);opacity:.25}62%{transform:translate3d(6px,-4px,0) rotate(2deg) scale(1.06);opacity:1}100%{transform:none;opacity:1}}
@keyframes saasunaBattleIce{0%{opacity:0;transform:scaleX(.25) translateY(8px)}42%{opacity:.96;transform:scaleX(1.08) translateY(0)}100%{opacity:0;transform:scaleX(1.22) translateY(-4px)}}
@keyframes saasunaBattleWind{0%{opacity:0;transform:translateX(-26px) scaleX(.2)}36%{opacity:1;transform:translateX(0) scaleX(1)}100%{opacity:0;transform:translateX(30px) scaleX(.42)}}
@keyframes saasunaBattleImpact{0%,50%{opacity:0;transform:scale(.42)}66%{opacity:.95;transform:scale(1.2)}100%{opacity:0;transform:scale(1.5)}}
@media(prefers-reduced-motion:reduce){[data-role="saasuna-battle-motion-surface"],[data-role="saasuna-battle-ice"],[data-role="saasuna-battle-wind"],[data-role="saasuna-battle-impact"]{animation:none!important;transition:none!important}}
`;
  doc.head.appendChild(style);
  return true;
}

function ensureSurface(doc, host) {
  const surface = createNode(doc, 'span');
  surface.dataset.role = 'saasuna-battle-motion-surface';
  surface.dataset.provisional = 'true';

  const keyframe = createNode(doc, 'span');
  keyframe.dataset.role = 'saasuna-battle-keyframe';
  keyframe.setAttribute?.('aria-hidden', 'true');

  const ice = createNode(doc, 'span');
  ice.dataset.role = 'saasuna-battle-ice';
  ice.setAttribute?.('aria-hidden', 'true');

  const wind = createNode(doc, 'span');
  wind.dataset.role = 'saasuna-battle-wind';
  wind.setAttribute?.('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) wind.appendChild(createNode(doc, 'i'));

  const impact = createNode(doc, 'span');
  impact.dataset.role = 'saasuna-battle-impact';
  impact.setAttribute?.('aria-hidden', 'true');

  surface.appendChild(keyframe);
  surface.appendChild(ice);
  surface.appendChild(wind);
  surface.appendChild(impact);
  host.appendChild(surface);
  return Object.freeze({ surface, keyframe, ice, wind, impact });
}

export function createSaasunaBattleMotionController({
  doc,
  host,
  characterHost = null,
  characterId = SAASUNA_PARTNER_ID,
  role = 'source',
  motion = 'normal',
  phase = 'idle',
  transition = 'CONTINUE',
  motionState = null,
} = {}) {
  if (!doc || !host || characterId !== SAASUNA_PARTNER_ID) return null;
  ensureSaasunaBattleMotionStyle(doc);
  const surface = ensureSurface(doc, host);
  const reducedMotion = Boolean(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const previousVisibility = characterHost?.style?.visibility ?? '';
  if (characterHost?.style) characterHost.style.visibility = 'hidden';

  let currentState = null;
  let sequence = 0;

  const setState = (input = {}, options = {}) => {
    const plan = resolveSaasunaBattleMotionPlan({
      characterId,
      role,
      phase,
      transition,
      motionState,
      ...input,
    });
    if (!plan) return null;
    const restart = options.restart !== false;
    if (!restart && currentState === plan.state) return plan;
    currentState = plan.state;
    sequence += 1;
    setData(host, 'saasunaBattleMotion', motion === 'static_only' ? 'static_only' : 'normal');
    setData(host, 'saasunaBattleMotionState', plan.state);
    setData(host, 'saasunaBattleKeyframe', plan.keyframeId);
    setData(host, 'saasunaBattleEmotion', plan.emotionState);
    setData(host, 'saasunaBattleMotionSequence', sequence);
    setData(host, 'saasunaBattleVisualSource', 'provisional-keyframe-sheet');
    setData(host, 'saasunaBattleFormalArt', 'false');
    surface.surface.dataset.motion = motion;
    surface.surface.dataset.motionState = plan.state;
    surface.surface.dataset.role = 'saasuna-battle-motion-surface';
    surface.keyframe.hidden = false;
    surface.keyframe.style.backgroundImage = `url("${plan.keyframeSheet.src}")`;
    surface.keyframe.style.backgroundPosition = plan.backgroundPosition;
    surface.keyframe.style.backgroundSize = '300% 300%';
    surface.keyframe.dataset.keyframeId = plan.keyframeId;
    surface.ice.hidden = !plan.effect.includes('ice') || reducedMotion;
    surface.wind.hidden = !plan.effect.includes('wind') || reducedMotion;
    surface.impact.hidden = plan.effect !== 'impact' || reducedMotion;
    return plan;
  };

  const clear = () => {
    currentState = null;
    delete host.dataset.saasunaBattleMotion;
    delete host.dataset.saasunaBattleMotionState;
    delete host.dataset.saasunaBattleKeyframe;
    delete host.dataset.saasunaBattleEmotion;
    delete host.dataset.saasunaBattleMotionSequence;
    delete host.dataset.saasunaBattleVisualSource;
    delete host.dataset.saasunaBattleFormalArt;
    surface.surface.parentNode?.removeChild?.(surface.surface);
    if (characterHost?.style) characterHost.style.visibility = previousVisibility;
  };

  setState({ phase, transition, motionState });
  return Object.freeze({
    setState,
    clear,
    destroy: clear,
    snapshot: () => freeze({ state: currentState, reducedMotion, surface }),
  });
}

export const SAASUNA_BATTLE_MOTION_RUNTIME = freeze({
  schema: 'gameroad.saasuna-battle-motion-core.v1',
  presentationOnly: true,
  gameplayAuthority: false,
  boardAuthority: false,
  formalArt: false,
  keyframeCount: 9,
  states: SAASUNA_BATTLE_MOTION_STATES,
  effects: Object.freeze(['ice', 'wind', 'impact']),
  reducedMotion: 'static_pose_no_timeline',
  fallback: 'existing_character_runtime_or_css_proxy',
});
