const STYLE_ID = 'gameroad-naki-battle-magic-motion-r1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalized(value) {
  return typeof value === 'string' ? value.trim().toUpperCase().replaceAll('-', '_') : '';
}

function profile({ state, durationMs, loop = false, easing = 'ease-out', heartIntensity, moonlightIntensity, crescentIntensity = 0, voice = false, slash = false, impact = false }) {
  return deepFreeze({
    state,
    durationMs,
    loop,
    easing,
    heartIntensity,
    moonlightIntensity,
    crescentIntensity,
    voice,
    slash,
    impact,
    primaryMotif: 'heart',
    secondaryMotif: 'moonlight',
    crescentRole: crescentIntensity > 0 ? 'subordinate-accent' : 'absent',
  });
}

export const NAKI_BATTLE_MAGIC_MOTION_PROFILES = deepFreeze({
  IDLE_HEART_MOON: profile({
    state: 'IDLE_HEART_MOON', durationMs: 1400, loop: true, easing: 'ease-in-out',
    heartIntensity: 0.46, moonlightIntensity: 0.22
  }),
  ENTRY_MIC: profile({
    state: 'ENTRY_MIC', durationMs: 620, easing: 'cubic-bezier(.16,.82,.2,1)',
    heartIntensity: 0.62, moonlightIntensity: 0.3, voice: true
  }),
  MIC_SPELLCAST: profile({
    state: 'MIC_SPELLCAST', durationMs: 560, easing: 'cubic-bezier(.18,.76,.2,1)',
    heartIntensity: 1, moonlightIntensity: 0.36, voice: true, crescentIntensity: 0
  }),
  HEART_RELEASE: profile({
    state: 'HEART_RELEASE', durationMs: 300, easing: 'cubic-bezier(.12,.86,.16,1)',
    heartIntensity: 1, moonlightIntensity: 0.28, voice: true, crescentIntensity: 0
  }),
  SLASH_TURN: profile({
    state: 'SLASH_TURN', durationMs: 280, easing: 'cubic-bezier(.14,.84,.18,1)',
    heartIntensity: 0.78, moonlightIntensity: 0.2, crescentIntensity: 0.18, slash: true
  }),
  IMPACT_HEART: profile({
    state: 'IMPACT_HEART', durationMs: 220, easing: 'cubic-bezier(.12,.72,.18,1)',
    heartIntensity: 1, moonlightIntensity: 0.16, crescentIntensity: 0.12, impact: true
  }),
  HIT_RECOIL: profile({
    state: 'HIT_RECOIL', durationMs: 500, easing: 'cubic-bezier(.2,.66,.24,1)',
    heartIntensity: 0.28, moonlightIntensity: 0.12
  }),
  RESULT_HEART: profile({
    state: 'RESULT_HEART', durationMs: 820, easing: 'cubic-bezier(.18,.82,.22,1)',
    heartIntensity: 0.74, moonlightIntensity: 0.34
  }),
});

export const NAKI_BATTLE_MAGIC_MOTION_STATES = Object.freeze(Object.keys(NAKI_BATTLE_MAGIC_MOTION_PROFILES));

const SEQUENCES = deepFreeze({
  ATTACK_SOURCE: ['MIC_SPELLCAST', 'HEART_RELEASE', 'SLASH_TURN', 'IMPACT_HEART', 'IDLE_HEART_MOON'],
  ABILITY_SOURCE: ['MIC_SPELLCAST', 'HEART_RELEASE', 'IMPACT_HEART', 'IDLE_HEART_MOON'],
  FINISHER_SOURCE: ['MIC_SPELLCAST', 'HEART_RELEASE', 'SLASH_TURN', 'IMPACT_HEART', 'RESULT_HEART'],
  TARGET_REACTION: ['HIT_RECOIL', 'IDLE_HEART_MOON'],
  ENTRY: ['ENTRY_MIC', 'IDLE_HEART_MOON'],
  RESULT: ['RESULT_HEART'],
  IDLE: ['IDLE_HEART_MOON'],
});

function sequenceProfiles(stateIds) {
  return deepFreeze(stateIds.map((state) => NAKI_BATTLE_MAGIC_MOTION_PROFILES[state]));
}

export function resolveNakiBattleMagicMotionState(input = {}) {
  const explicit = normalized(input.motionState ?? input.state ?? input.cue);
  if (explicit && Object.hasOwn(NAKI_BATTLE_MAGIC_MOTION_PROFILES, explicit)) return explicit;
  const phase = normalized(input.phase);
  const role = normalized(input.role);
  const transition = normalized(input.transition);
  if ((phase === 'ATTACK' || phase === 'ABILITY') && role === 'TARGET') return 'HIT_RECOIL';
  if (phase === 'ATTACK') return 'MIC_SPELLCAST';
  if (phase === 'ABILITY') return 'MIC_SPELLCAST';
  if (phase === 'FINISHER') return 'MIC_SPELLCAST';
  if (phase === 'SETTLE' || phase === 'RESULT') return 'RESULT_HEART';
  if (transition === 'ENTRY' || phase === 'REVEAL') return 'ENTRY_MIC';
  return 'IDLE_HEART_MOON';
}

export function resolveNakiBattleMagicMotionSequence(input = {}) {
  const explicit = normalized(input.motionState ?? input.state ?? input.cue);
  if (explicit && Object.hasOwn(NAKI_BATTLE_MAGIC_MOTION_PROFILES, explicit)) {
    return sequenceProfiles([explicit]);
  }
  const phase = normalized(input.phase);
  const role = normalized(input.role);
  const transition = normalized(input.transition);
  if ((phase === 'ATTACK' || phase === 'ABILITY') && role === 'TARGET') return sequenceProfiles(SEQUENCES.TARGET_REACTION);
  if (phase === 'ATTACK') return sequenceProfiles(SEQUENCES.ATTACK_SOURCE);
  if (phase === 'ABILITY') return sequenceProfiles(SEQUENCES.ABILITY_SOURCE);
  if (phase === 'FINISHER') return sequenceProfiles(SEQUENCES.FINISHER_SOURCE);
  if (phase === 'SETTLE' || phase === 'RESULT') return sequenceProfiles(SEQUENCES.RESULT);
  if (transition === 'ENTRY' || phase === 'REVEAL') return sequenceProfiles(SEQUENCES.ENTRY);
  return sequenceProfiles(SEQUENCES.IDLE);
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

export function ensureNakiBattleMagicMotionStyle(doc) {
  if (!doc?.head || typeof doc.createElement !== 'function') return false;
  if (doc.getElementById?.(STYLE_ID)) return false;
  const style = createNode(doc, 'style');
  style.id = STYLE_ID;
  style.textContent = [
    '[data-role="naki-battle-magic-motion"]{position:absolute;inset:-10% -18% -4%;z-index:4;pointer-events:none;overflow:visible;transform-origin:50% 72%;}',
    '[data-role="naki-moonlight"]{position:absolute;inset:4% 6% 10%;border-radius:50%;opacity:var(--naki-moon,.2);background:radial-gradient(circle at 52% 34%,rgba(250,245,255,.56),rgba(179,140,238,.18) 36%,rgba(50,16,76,.08) 62%,transparent 76%);filter:blur(1px);}',
    '[data-role="naki-heart-field"]{position:absolute;inset:0;opacity:var(--naki-heart,.7);}',
    '[data-role="naki-heart-field"] i{position:absolute;display:block;font-style:normal;font-weight:900;color:rgba(255,90,155,.92);text-shadow:0 0 8px rgba(255,74,154,.75),0 0 18px rgba(181,47,138,.42);opacity:.22;transform:translate3d(0,12px,0) scale(.72);}',
    '[data-role="naki-heart-field"] i:nth-child(1){left:24%;top:55%}[data-role="naki-heart-field"] i:nth-child(2){left:39%;top:38%}[data-role="naki-heart-field"] i:nth-child(3){left:54%;top:48%}[data-role="naki-heart-field"] i:nth-child(4){left:67%;top:31%}[data-role="naki-heart-field"] i:nth-child(5){left:73%;top:59%}',
    '[data-role="naki-voice-rings"]{position:absolute;left:42%;top:24%;width:22%;height:34%;opacity:0;}',
    '[data-role="naki-voice-rings"] i{position:absolute;inset:18%;border:2px solid rgba(255,119,184,.78);border-left-color:transparent;border-bottom-color:transparent;border-radius:50%;transform:rotate(35deg) scale(.45);opacity:0;}',
    '[data-role="naki-slash"]{position:absolute;left:16%;top:18%;width:70%;height:58%;opacity:0;border-radius:50%;border-top:4px solid rgba(255,151,204,.95);border-right:2px solid rgba(229,193,255,.64);filter:drop-shadow(0 0 10px rgba(255,84,167,.62));transform:rotate(-24deg) scale(.62);}',
    '[data-role="naki-crescent"]{position:absolute;inset:0;opacity:0;}',
    '[data-role="naki-crescent"] i{position:absolute;width:18px;height:18px;border-radius:50%;border-right:3px solid rgba(238,217,255,.88);filter:drop-shadow(0 0 6px rgba(184,130,238,.7));opacity:.7;}',
    '[data-role="naki-crescent"] i:first-child{left:68%;top:36%;transform:rotate(-28deg) scale(.72)}[data-role="naki-crescent"] i:last-child{left:57%;top:62%;transform:rotate(18deg) scale(.46)}',
    '[data-role="naki-impact"]{position:absolute;left:55%;top:42%;width:30%;height:34%;opacity:0;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.96),rgba(255,91,163,.76) 16%,rgba(180,64,185,.26) 46%,transparent 72%);filter:blur(.3px);transform:scale(.35);}',
    '[data-naki-battle-motion-state="MIC_SPELLCAST"] [data-role="naki-battle-magic-motion"]{animation:nakiMicCast 560ms cubic-bezier(.18,.76,.2,1) both}',
    '[data-naki-battle-motion-state="MIC_SPELLCAST"] [data-role="naki-heart-field"] i{animation:nakiHeartRise 560ms ease-out both}',
    '[data-naki-battle-motion-state="MIC_SPELLCAST"] [data-role="naki-voice-rings"]{animation:nakiVoiceShow 560ms ease-out both}',
    '[data-naki-battle-motion-state="MIC_SPELLCAST"] [data-role="naki-voice-rings"] i{animation:nakiVoiceRing 560ms ease-out both}',
    '[data-naki-battle-motion-state="HEART_RELEASE"] [data-role="naki-heart-field"] i{animation:nakiHeartRelease 300ms cubic-bezier(.12,.86,.16,1) both}',
    '[data-naki-battle-motion-state="SLASH_TURN"] [data-role="naki-battle-magic-motion"]{animation:nakiSlashTurn 280ms cubic-bezier(.14,.84,.18,1) both}',
    '[data-naki-battle-motion-state="SLASH_TURN"] [data-role="naki-slash"]{animation:nakiSlashArc 280ms ease-out both}',
    '[data-naki-battle-motion-state="SLASH_TURN"] [data-role="naki-crescent"]{animation:nakiCrescentAccent 280ms ease-out both}',
    '[data-naki-battle-motion-state="IMPACT_HEART"] [data-role="naki-impact"]{animation:nakiImpactHeart 220ms ease-out both}',
    '[data-naki-battle-motion-state="IMPACT_HEART"] [data-role="naki-crescent"]{animation:nakiCrescentImpact 220ms ease-out both}',
    '[data-naki-battle-motion-state="HIT_RECOIL"] [data-role="naki-battle-magic-motion"]{animation:nakiHitRecoil 500ms cubic-bezier(.2,.66,.24,1) both}',
    '[data-naki-battle-motion-state="ENTRY_MIC"] [data-role="naki-battle-magic-motion"]{animation:nakiEntry 620ms cubic-bezier(.16,.82,.2,1) both}',
    '[data-naki-battle-motion-state="RESULT_HEART"] [data-role="naki-battle-magic-motion"]{animation:nakiResult 820ms cubic-bezier(.18,.82,.22,1) both}',
    '@keyframes nakiMicCast{0%{transform:translate3d(0,10px,0) scale(.96)}42%{transform:translate3d(-2px,-6px,0) scale(1.03)}72%{transform:translate3d(3px,-3px,0) scale(1.055)}100%{transform:none}}',
    '@keyframes nakiHeartRise{0%{opacity:.08;transform:translate3d(0,16px,0) scale(.55)}54%{opacity:1;transform:translate3d(0,-5px,0) scale(1.04)}100%{opacity:.26;transform:translate3d(3px,-15px,0) scale(.82)}}',
    '@keyframes nakiVoiceShow{0%,16%{opacity:0}42%{opacity:.96}100%{opacity:0}}',
    '@keyframes nakiVoiceRing{0%{opacity:0;transform:rotate(35deg) scale(.32)}44%{opacity:.84}100%{opacity:0;transform:rotate(35deg) scale(1.45)}}',
    '@keyframes nakiHeartRelease{0%{opacity:.24;transform:translate3d(-8px,5px,0) scale(.66)}52%{opacity:1;transform:translate3d(12px,-8px,0) scale(1.12)}100%{opacity:0;transform:translate3d(34px,-14px,0) scale(.76)}}',
    '@keyframes nakiSlashTurn{0%{transform:rotate(-5deg) scale(.98)}48%{transform:rotate(8deg) scale(1.05)}100%{transform:rotate(0) scale(1)}}',
    '@keyframes nakiSlashArc{0%{opacity:0;transform:rotate(-28deg) scale(.38)}38%{opacity:1}100%{opacity:0;transform:rotate(18deg) scale(1.18)}}',
    '@keyframes nakiCrescentAccent{0%,44%{opacity:0}62%{opacity:.72}100%{opacity:0}}',
    '@keyframes nakiImpactHeart{0%,34%{opacity:0;transform:scale(.25)}58%{opacity:1;transform:scale(1.2)}100%{opacity:0;transform:scale(1.58)}}',
    '@keyframes nakiCrescentImpact{0%,54%{opacity:0}70%{opacity:.46}100%{opacity:0}}',
    '@keyframes nakiHitRecoil{0%,34%{transform:translateX(10px) scale(.98);opacity:.52}52%{transform:translateX(-8px) rotate(-4deg) scale(1.02);opacity:1}100%{transform:none;opacity:1}}',
    '@keyframes nakiEntry{0%{opacity:.15;transform:translate3d(-24px,8px,0) scale(.9) rotate(-3deg)}68%{opacity:1;transform:translate3d(3px,-4px,0) scale(1.04) rotate(1deg)}100%{transform:none;opacity:1}}',
    '@keyframes nakiResult{0%{transform:translateY(7px) scale(.95);opacity:.4}54%{transform:translateY(-5px) scale(1.04);opacity:1}100%{transform:none;opacity:1}}',
    '@media(prefers-reduced-motion:reduce){[data-role="naki-battle-magic-motion"],[data-role="naki-heart-field"] i,[data-role="naki-voice-rings"],[data-role="naki-voice-rings"] i,[data-role="naki-slash"],[data-role="naki-crescent"],[data-role="naki-impact"]{animation:none!important;transition:none!important}}'
  ].join('\n');
  doc.head.appendChild(style);
  return true;
}

function ensureSurface(doc, host) {
  const surface = createNode(doc, 'span');
  surface.dataset.role = 'naki-battle-magic-motion';
  surface.dataset.presentationOnly = 'true';

  const moon = createNode(doc, 'span');
  moon.dataset.role = 'naki-moonlight';
  moon.setAttribute?.('aria-hidden', 'true');

  const hearts = createNode(doc, 'span');
  hearts.dataset.role = 'naki-heart-field';
  hearts.setAttribute?.('aria-hidden', 'true');
  for (let index = 0; index < 5; index += 1) {
    const heart = createNode(doc, 'i');
    heart.textContent = '♥';
    hearts.appendChild(heart);
  }

  const voice = createNode(doc, 'span');
  voice.dataset.role = 'naki-voice-rings';
  voice.setAttribute?.('aria-hidden', 'true');
  for (let index = 0; index < 3; index += 1) voice.appendChild(createNode(doc, 'i'));

  const slash = createNode(doc, 'span');
  slash.dataset.role = 'naki-slash';
  slash.setAttribute?.('aria-hidden', 'true');

  const crescent = createNode(doc, 'span');
  crescent.dataset.role = 'naki-crescent';
  crescent.setAttribute?.('aria-hidden', 'true');
  crescent.appendChild(createNode(doc, 'i'));
  crescent.appendChild(createNode(doc, 'i'));

  const impact = createNode(doc, 'span');
  impact.dataset.role = 'naki-impact';
  impact.setAttribute?.('aria-hidden', 'true');

  surface.appendChild(moon);
  surface.appendChild(hearts);
  surface.appendChild(voice);
  surface.appendChild(slash);
  surface.appendChild(crescent);
  surface.appendChild(impact);
  host.appendChild(surface);
  return Object.freeze({ surface, moon, hearts, voice, slash, crescent, impact });
}

function applyProfile(host, layers, motion, profile, reducedMotion) {
  setData(host, 'nakiBattleMotionState', profile.state);
  setData(host, 'nakiBattlePrimaryMotif', 'heart');
  setData(host, 'nakiBattleSecondaryMotif', 'moonlight');
  setData(host, 'nakiBattleCrescentRole', profile.crescentRole);
  setData(host, 'nakiBattleSpellcasting', profile.voice ? 'microphone-singing' : 'none');
  setData(host, 'nakiBattlePresentationOnly', 'true');
  setData(host, 'nakiBattleGameplayAuthority', 'false');
  setData(host, 'nakiBattleFormalArt', 'false');
  layers.surface.style?.setProperty?.('--naki-heart', String(profile.heartIntensity));
  layers.surface.style?.setProperty?.('--naki-moon', String(profile.moonlightIntensity));
  layers.surface.dataset.motion = motion;
  layers.surface.dataset.state = profile.state;
  layers.voice.hidden = !profile.voice || reducedMotion;
  layers.slash.hidden = !profile.slash || reducedMotion;
  layers.crescent.hidden = profile.crescentIntensity <= 0 || reducedMotion;
  layers.impact.hidden = !profile.impact || reducedMotion;
  return profile;
}

export function createNakiBattleMagicMotionController({
  doc,
  host,
  characterHost = null,
  characterIdentityVerified = false,
  role = 'source',
  motion = 'normal',
  phase = 'idle',
  transition = 'CONTINUE',
  motionState = null,
  setTimeoutFn = null,
  clearTimeoutFn = null,
} = {}) {
  if (!doc || !host || characterIdentityVerified !== true) return null;
  ensureNakiBattleMagicMotionStyle(doc);
  const layers = ensureSurface(doc, host);
  const reducedMotion = Boolean(doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) || motion === 'static_only';
  const schedule = setTimeoutFn ?? doc.defaultView?.setTimeout?.bind(doc.defaultView) ?? null;
  const cancel = clearTimeoutFn ?? doc.defaultView?.clearTimeout?.bind(doc.defaultView) ?? null;
  const timers = new Set();
  let currentState = null;
  let sequenceSerial = 0;

  const clearTimers = () => {
    if (cancel) {
      for (const timer of timers) {
        try { cancel(timer); } catch {}
      }
    }
    timers.clear();
  };

  const setState = (input = {}) => {
    const state = resolveNakiBattleMagicMotionState({ role, phase, transition, motionState, ...input });
    const profileValue = NAKI_BATTLE_MAGIC_MOTION_PROFILES[state];
    currentState = state;
    return applyProfile(host, layers, motion, profileValue, reducedMotion);
  };

  const playSequence = (input = {}) => {
    clearTimers();
    const sequence = resolveNakiBattleMagicMotionSequence({ role, phase, transition, motionState, ...input });
    sequenceSerial += 1;
    setData(host, 'nakiBattleSequenceSerial', sequenceSerial);
    if (sequence.length === 0) return sequence;
    applyProfile(host, layers, motion, sequence[0], reducedMotion);
    currentState = sequence[0].state;
    if (reducedMotion || !schedule || sequence.length === 1) return sequence;
    let elapsed = 0;
    for (let index = 1; index < sequence.length; index += 1) {
      elapsed += sequence[index - 1].durationMs;
      const profileValue = sequence[index];
      const timer = schedule(() => {
        timers.delete(timer);
        currentState = profileValue.state;
        applyProfile(host, layers, motion, profileValue, false);
      }, elapsed);
      timers.add(timer);
    }
    return sequence;
  };

  const clear = () => {
    clearTimers();
    currentState = null;
    for (const key of [
      'nakiBattleMotionState', 'nakiBattlePrimaryMotif', 'nakiBattleSecondaryMotif',
      'nakiBattleCrescentRole', 'nakiBattleSpellcasting', 'nakiBattlePresentationOnly',
      'nakiBattleGameplayAuthority', 'nakiBattleFormalArt', 'nakiBattleSequenceSerial'
    ]) delete host.dataset?.[key];
    layers.surface.parentNode?.removeChild?.(layers.surface);
  };

  if (characterHost?.dataset) characterHost.dataset.nakiBattleEffectOverlay = 'true';
  playSequence({ phase, transition, motionState });
  return Object.freeze({
    setState,
    playSequence,
    clear,
    destroy: clear,
    snapshot: () => deepFreeze({ state: currentState, reducedMotion, sequenceSerial }),
  });
}

export const NAKI_BATTLE_MAGIC_MOTION_RUNTIME = deepFreeze({
  schema: 'gameroad.naki-battle-magic-motion-core.v1',
  characterIdentityPolicy: 'CALLER_EXPLICIT_NAKI_IDENTITY_VERIFICATION_REQUIRED',
  characterIdentityInference: false,
  primaryMotif: 'heart',
  spellcasting: 'microphone-singing',
  secondaryMotif: 'moonlight',
  crescentPolicy: 'SUBORDINATE_SLASH_OR_POST_HIT_ACCENT_ONLY',
  crescentMaxIntensity: 0.18,
  preAttackCrescentIntensity: 0,
  presentationOnly: true,
  gameplayAuthority: false,
  boardAuthority: false,
  formalArt: false,
  reducedMotion: 'static_semantic_cue_no_spatial_sweep',
  saasunaMotionReuse: false,
  states: NAKI_BATTLE_MAGIC_MOTION_STATES,
});
