import {createTransitionDirector} from './ui-state-feedback-core.mjs';

export const SCREEN_NAVIGATION_REASON = Object.freeze({
  EMPTY_TARGET: 'EMPTY_TARGET',
  CURRENT_SCREEN: 'CURRENT_SCREEN',
  NAVIGATE: 'NAVIGATE'
});

export const SCREEN_NAVIGATION_FALLBACK_PARENT = Object.freeze({
  cards: 'home', characters: 'home', setup: 'home', missions: 'home', profile: 'home',
  shop: 'home', gacha: 'shop', records: 'home', settings: 'home'
});

export const SCREEN_NAVIGATION_COMMON_BUTTON_SFX = Object.freeze({
  filename: 'click_002.ogg', formalRole: 'shared-button', playbackAuthority: 'HUMAN_ACCEPTED_FORMAL_ASSET'
});

const SCREEN_TRANSITION_EDGE_SHIMMER_STYLE_ID = 'gameroad-screen-transition-edge-shimmer-r1';
export const SCREEN_TRANSITION_EDGE_SHIMMER_ASSET = Object.freeze({
  id: 'screen-transition-edge-shimmer-sprite-v1',
  sourcePath: 'assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png',
  runtimePath: '../assets/visual/effects/screen-transition-edge-shimmer-sprite-v1.png',
  formal: true,
  readOnly: true,
  frameCount: 4,
  frameLayout: 'horizontal-4-up',
});
const SCREEN_TRANSITION_EDGE_SHIMMER_URL = new URL(
  SCREEN_TRANSITION_EDGE_SHIMMER_ASSET.runtimePath,
  import.meta.url,
).href;
export const SCREEN_TRANSITION_EDGE_SHIMMER_CSS = `
.gameroadScreenTransitionEdgeShimmer{position:absolute;inset:0;z-index:12;pointer-events:none;overflow:hidden;background-image:url('${SCREEN_TRANSITION_EDGE_SHIMMER_URL}');background-repeat:no-repeat;background-size:400% 100%;background-position:0% 50%;mix-blend-mode:screen;opacity:0;filter:saturate(1.02) brightness(1.06);will-change:opacity,background-position;contain:paint}
html.r10LowPerf .gameroadScreenTransitionEdgeShimmer,html.r10Reduced .gameroadScreenTransitionEdgeShimmer{filter:saturate(.92) brightness(1.02)}
@media(prefers-reduced-motion:reduce){.gameroadScreenTransitionEdgeShimmer{display:none!important}}
`;
export const SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES = Object.freeze({
  exit: Object.freeze([
    {opacity: 0, backgroundPosition: '0% 50%', transform: 'scale(1.015)'},
    {opacity: .34, backgroundPosition: '66.667% 50%', transform: 'scale(1.01)'},
    {opacity: 0, backgroundPosition: '100% 50%', transform: 'scale(1)'},
  ]),
  enter: Object.freeze([
    {opacity: 0, backgroundPosition: '100% 50%', transform: 'scale(1.01)'},
    {opacity: .26, backgroundPosition: '33.333% 50%', transform: 'scale(1)'},
    {opacity: 0, backgroundPosition: '0% 50%', transform: 'scale(1)'},
  ]),
});

export const MENU_TRANSITION_MOTION_PROFILE = Object.freeze({NORMAL: 'normal', REDUCED: 'reduced', NONE: 'none'});

export const SCREEN_MOTION_PRESENTATION_SPEC = Object.freeze({
  [MENU_TRANSITION_MOTION_PROFILE.NORMAL]: Object.freeze({exitMs: 90, enterMs: 120, feedbackMs: 72, edgeShimmerMs: 120, distancePx: 18, easing: 'cubic-bezier(.22,.72,.2,1)'}),
  [MENU_TRANSITION_MOTION_PROFILE.REDUCED]: Object.freeze({exitMs: 36, enterMs: 45, feedbackMs: 36, edgeShimmerMs: 36, distancePx: 0, easing: 'linear'}),
  [MENU_TRANSITION_MOTION_PROFILE.NONE]: Object.freeze({exitMs: 0, enterMs: 0, feedbackMs: 0, edgeShimmerMs: 0, distancePx: 0, easing: 'linear'})
});

export const SCREEN_MOTION_FAMILY = Object.freeze({ROUTE: 'route', CARDS: 'cards', CHARACTER: 'character', ECONOMY: 'economy', BATTLE: 'battle', UTILITY: 'utility'});

const SCREEN_MOTION_FAMILY_BY_SCREEN = Object.freeze({
  cards: SCREEN_MOTION_FAMILY.CARDS, deck: SCREEN_MOTION_FAMILY.CARDS,
  characters: SCREEN_MOTION_FAMILY.CHARACTER, partner: SCREEN_MOTION_FAMILY.CHARACTER,
  shop: SCREEN_MOTION_FAMILY.ECONOMY, gacha: SCREEN_MOTION_FAMILY.ECONOMY,
  setup: SCREEN_MOTION_FAMILY.BATTLE, battle: SCREEN_MOTION_FAMILY.BATTLE, result: SCREEN_MOTION_FAMILY.BATTLE,
  missions: SCREEN_MOTION_FAMILY.UTILITY, profile: SCREEN_MOTION_FAMILY.UTILITY,
  records: SCREEN_MOTION_FAMILY.UTILITY, settings: SCREEN_MOTION_FAMILY.UTILITY
});

const SCREEN_MOTION_KINETICS = Object.freeze({
  [SCREEN_MOTION_FAMILY.ROUTE]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: .995, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.CARDS]: Object.freeze({axis: 'y', enterSign: 1, scaleFrom: .985, rotateDeg: -.7}),
  [SCREEN_MOTION_FAMILY.CHARACTER]: Object.freeze({axis: 'x', enterSign: -1, scaleFrom: 1.012, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.ECONOMY]: Object.freeze({axis: 'x', enterSign: 1, scaleFrom: .992, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.BATTLE]: Object.freeze({axis: 'y', enterSign: -1, scaleFrom: 1.01, rotateDeg: 0}),
  [SCREEN_MOTION_FAMILY.UTILITY]: Object.freeze({axis: 'x', enterSign: -1, scaleFrom: .995, rotateDeg: 0})
});

export const SCREEN_MOTION_PIECE_SELECTORS = Object.freeze({
  cards: Object.freeze(['.cardsGrid > .collection', '.cardsGrid > .deckBoard']),
  characters: Object.freeze(['.charLayout > .charStage', '.charLayout > .charRoster']),
  partner: Object.freeze([
    '.partner-shell-runtime > .partner-shell-title',
    '.partner-shell-runtime > .partner-shell-active',
    '.partner-shell-runtime > .partner-shell-idle-readable',
    '.partner-shell-runtime > .partner-shell-menu',
    '.partner-shell-runtime > .partner-shell-roster',
    '.partner-shell-runtime > .partner-shell-detail',
    '.partner-shell-runtime > .partner-shell-formation',
    '.partner-shell-runtime > .partner-shell-strategy',
    '.partner-shell-runtime > .partner-dialogue-feedback',
    '.partner-shell-runtime > .partner-costume-shell-host',
    '.partner-shell-runtime > .partner-shell-navigation'
  ]),
  setup: Object.freeze(['.setupHero', '.setupBox']),
  profile: Object.freeze([
    '.profileStats > .profileIdentitySummary',
    '.profileStats > .profileRecordsNote',
    '.profileStats > .profileActions'
  ]),
  shop: Object.freeze(['.shopGrid > .shopCard']),
  gacha: Object.freeze(['.gachaLayout > .gachaStage', '.gachaLayout > .gachaControls'])
});

const HOME_ROUTE_SELECTOR = '.homePadChoice[data-home-target]';
const HOME_SLIDEPAD_CENTER_SELECTOR = '#homePadCenter';
const HOME_VISUAL_LAYER_SELECTOR = '.codexHomeVisualLayer';


export const GACHA_PREVIEW_NOTICE_ID = 'gachaPreviewAuthorityNotice';
export const GACHA_PREVIEW_NOTICE_TEXT = '※ 現在は演出プレビューです。表示されたカードは所持・保存には反映されません。';

export function ensureGachaPreviewDisclosure(documentSource = globalThis.document) {
  if (!documentSource || typeof documentSource.getElementById !== 'function' || typeof documentSource.createElement !== 'function') return null;
  try {
    const screen = documentSource.getElementById('gachaScreen');
    if (!screen) return null;
    const existing = documentSource.getElementById(GACHA_PREVIEW_NOTICE_ID);
    if (existing) return existing;

    const note = documentSource.createElement('p');
    note.id = GACHA_PREVIEW_NOTICE_ID;
    note.className = 'gachaPreviewAuthorityNotice';
    note.textContent = GACHA_PREVIEW_NOTICE_TEXT;
    note.setAttribute?.('role', 'note');
    note.setAttribute?.('data-gacha-authority', 'preview-only');
    if (note.style) {
      note.style.margin = '8px 0 4px';
      note.style.fontSize = '12px';
      note.style.lineHeight = '1.45';
      note.style.fontWeight = '700';
      note.style.textAlign = 'center';
      note.style.letterSpacing = '.01em';
      note.style.pointerEvents = 'none';
    }

    const openButton = documentSource.getElementById('openPack');
    if (openButton?.parentNode?.insertBefore) {
      openButton.parentNode.insertBefore(note, openButton);
      return note;
    }
    if (typeof screen.prepend === 'function') {
      screen.prepend(note);
      return note;
    }
    if (typeof screen.appendChild === 'function') {
      screen.appendChild(note);
      return note;
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveScreenMotionIntent(from, to, reason = 'navigation') {
  const destinationKey = String(to || '').trim().toLowerCase();
  const family = SCREEN_MOTION_FAMILY_BY_SCREEN[destinationKey] || SCREEN_MOTION_FAMILY.ROUTE;
  const base = SCREEN_MOTION_KINETICS[family];
  const reverseSemantic = reason === 'back' || destinationKey === 'home';
  return Object.freeze({
    from, to, family, bridge: `${family}-bridge`, reverseSemantic, axis: base.axis,
    enterSign: reverseSemantic ? -base.enterSign : base.enterSign,
    scaleFrom: base.scaleFrom,
    rotateDeg: reverseSemantic ? -base.rotateDeg : base.rotateDeg
  });
}

function commonButtonSfxUrl() {
  const moduleUrl = new URL(import.meta.url);
  const sourceBrowserModule = /\/browser\/screen-navigation-core\.mjs$/.test(moduleUrl.pathname);
  return new URL(sourceBrowserModule ? '../assets/audio/sfx/click_002.ogg' : './click_002.ogg', moduleUrl).href;
}

function hasActiveUserGesture() { return globalThis.navigator?.userActivation?.isActive === true; }
function playAcceptedNavigationSfx() {
  if (!hasActiveUserGesture()) return false;
  const AudioCtor = globalThis.Audio;
  if (typeof AudioCtor !== 'function') return false;
  try {
    const audio = new AudioCtor(commonButtonSfxUrl());
    const playback = audio?.play?.();
    if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    return true;
  } catch { return false; }
}

function temporarySfxTone(wave, startHz, endHz, durationSec, gain, offsetSec = 0) {
  return Object.freeze({wave, startHz, endHz, durationSec, gain, offsetSec});
}
function temporarySfxCue(description, tones) {
  return Object.freeze({description, tones: Object.freeze(tones)});
}

export const TEMPORARY_ACTION_SFX_CATALOG = Object.freeze({
  ui_button: temporarySfxCue('Shared soft button tap', [temporarySfxTone('triangle', 620, 480, 0.065, 0.045)]),
  ui_confirm: temporarySfxCue('Confirm action', [
    temporarySfxTone('triangle', 620, 760, 0.072, 0.045),
    temporarySfxTone('triangle', 780, 980, 0.085, 0.05, 0.06),
  ]),
  ui_select: temporarySfxCue('Selection', [temporarySfxTone('sine', 460, 560, 0.055, 0.035)]),
  ui_tab: temporarySfxCue('Tab switch', [temporarySfxTone('sine', 520, 680, 0.045, 0.028)]),
  ui_toggle_on: temporarySfxCue('Toggle on', [temporarySfxTone('triangle', 550, 840, 0.07, 0.04)]),
  ui_toggle_off: temporarySfxCue('Toggle off', [temporarySfxTone('triangle', 720, 440, 0.08, 0.038)]),
  ui_open: temporarySfxCue('Open panel or menu', [temporarySfxTone('triangle', 380, 720, 0.11, 0.04)]),
  ui_close: temporarySfxCue('Close or return', [temporarySfxTone('triangle', 720, 360, 0.10, 0.04)]),
  ui_slider: temporarySfxCue('Slider tick', [temporarySfxTone('sine', 800, 730, 0.028, 0.022)]),
  ui_focus: temporarySfxCue('Text field focus', [temporarySfxTone('sine', 490, 490, 0.035, 0.022)]),
  ui_invalid: temporarySfxCue('Unavailable or rejected action', [temporarySfxTone('sine', 240, 180, 0.085, 0.04)]),
  ui_empty_tap: temporarySfxCue('Quiet blank-screen tap', [temporarySfxTone('sine', 350, 260, 0.06, 0.018)]),
  battle_card_select: temporarySfxCue('Battle card selection', [temporarySfxTone('triangle', 220, 340, 0.06, 0.05)]),
  battle_target: temporarySfxCue('Battle target selection', [temporarySfxTone('sine', 390, 520, 0.065, 0.045)]),
  battle_action: temporarySfxCue('Battle action commit', [
    temporarySfxTone('triangle', 180, 360, 0.10, 0.065),
    temporarySfxTone('triangle', 360, 520, 0.08, 0.055, 0.055),
  ]),
  battle_turn: temporarySfxCue('Battle turn end or pass', [temporarySfxTone('sine', 300, 190, 0.12, 0.055)]),
  battle_button: temporarySfxCue('Battle utility button', [temporarySfxTone('triangle', 420, 320, 0.055, 0.04)]),
  battle_empty_tap: temporarySfxCue('Quiet blank Battle-board tap', [temporarySfxTone('sine', 260, 190, 0.07, 0.016)]),
});

export const TEMPORARY_ACTION_SFX_ASSIGNMENTS = Object.freeze({
  acceptedNavigation: 'formal:click_002.ogg',
  genericButton: 'ui_button',
  confirmation: 'ui_confirm',
  selection: 'ui_select',
  tab: 'ui_tab',
  toggleOn: 'ui_toggle_on',
  toggleOff: 'ui_toggle_off',
  panelOpen: 'ui_open',
  closeOrBack: 'ui_close',
  rangeInput: 'ui_slider',
  textFieldFocus: 'ui_focus',
  unavailableOrRejected: 'ui_invalid',
  blankActiveScreenTap: 'ui_empty_tap',
  battleCardSelection: 'battle_card_select',
  battleTargetSelection: 'battle_target',
  battleActionCommit: 'battle_action',
  battleTurnEndOrPass: 'battle_turn',
  battleUtilityButton: 'battle_button',
  blankBattleTap: 'battle_empty_tap',
});

const TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR = [
  'button', 'a[href]', 'input', 'select', 'textarea', '[role="button"]', '[role="tab"]',
  '[role="switch"]', '[role="checkbox"]', '[role="radio"]', '[data-action]',
  '[data-battle-action]', '[data-battle-target]', '[data-card-id]', '[data-player]',
  '[data-target-id]', '[data-cell-id]', '[data-tile-id]', '.handCard', '.boardPlayerToken',
  '.node.reachable', '.node.path', '.node.currentPosition', '.node.nextStep',
  '[tabindex]:not([tabindex="-1"])', '[onclick]', '[contenteditable="true"]',
].join(',');
const TEMPORARY_ACTION_SFX_BATTLE_CARD_SELECTOR = '.handCard[data-card-id],[data-battle-card],[data-card-id],.battleCard';
const TEMPORARY_ACTION_SFX_BATTLE_TARGET_SELECTOR = '.boardPlayerToken[data-player],[data-battle-target],[data-target-id],[data-player],.node.reachable,.node.path,.node.nextStep';
const TEMPORARY_ACTION_SFX_ACTIVE_SCREEN_SELECTOR = '.screen.active[data-screen]';
const temporaryActionSfxNavigationDecisions = new WeakMap();
let temporaryActionSfxActiveClickEvent = null;
const temporaryActionSfxInstallations = new WeakMap();

function temporarySfxClosest(target, selector) {
  let current = target?.nodeType === 3 ? target.parentElement : target;
  if (typeof current?.closest === 'function') return current.closest(selector);
  while (current) {
    if (typeof current.matches === 'function' && current.matches(selector)) return current;
    current = current.parentElement || current.parentNode || null;
  }
  return null;
}
function temporarySfxInputType(control) {
  return String(control?.type || control?.getAttribute?.('type') || '').toLowerCase();
}
function temporarySfxRole(control) {
  return String(control?.getAttribute?.('role') || '').toLowerCase();
}
function temporarySfxDisabled(control) {
  return control?.disabled === true || control?.getAttribute?.('aria-disabled') === 'true' || Boolean(control?.matches?.(':disabled'));
}
function temporarySfxControlText(control) {
  return [
    control?.id,
    control?.getAttribute?.('aria-label'),
    control?.getAttribute?.('title'),
    control?.dataset?.action,
    control?.dataset?.sfxRole,
    control?.textContent,
  ].filter(Boolean).join(' ').slice(0, 180);
}
function temporarySfxToggleIsOn(control) {
  if (typeof control?.checked === 'boolean') return control.checked;
  const ariaChecked = control?.getAttribute?.('aria-checked');
  if (ariaChecked !== null && ariaChecked !== undefined) return ariaChecked === 'true';
  const ariaPressed = control?.getAttribute?.('aria-pressed');
  if (ariaPressed !== null && ariaPressed !== undefined) return ariaPressed === 'true';
  return /\bON\b/i.test(temporarySfxControlText(control));
}
function temporarySfxLooksLikeConfirm(text) {
  return /\b(confirm|start|buy|purchase|claim|draw|equip|upgrade|save|submit|play|fight|attack|cast|use|accept|apply|finish|proceed|exchange)\b|決定|開始|購入|引く|開封|受取|受け取|装備|強化|保存|実行|送信|確定|攻撃|行動|使用|交換|応募|回す/i.test(text);
}
function temporarySfxLooksLikeClose(text) {
  return /\b(back|close|cancel|dismiss|return|go back)\b|戻る|閉じる|キャンセル|中止|やめる/i.test(text);
}
function temporarySfxLooksLikeOpen(text) {
  return /\b(open|menu|shop|profile|settings|details|more|view)\b|開く|ショップ|プロフィール|設定|詳細|見る/i.test(text);
}
function temporarySfxLooksLikeSelection(text) {
  return /\b(select|choose|pick|card|character|item|player|token)\b|選択|選ぶ|カード|キャラ|対象/i.test(text);
}

export function resolveTemporaryActionSfxCue({target, event, interaction = 'click', screenName = null} = {}) {
  if (event && typeof event === 'object' && temporaryActionSfxNavigationDecisions.has(event)) {
    const navigationDecision = temporaryActionSfxNavigationDecisions.get(event);
    return navigationDecision?.ok ? null : 'ui_invalid';
  }
  const control = temporarySfxClosest(target, TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR);
  if (!control) return null;
  if (temporarySfxDisabled(control)) return 'ui_invalid';

  const inputType = temporarySfxInputType(control);
  const role = temporarySfxRole(control);
  if (inputType === 'range' || role === 'slider') return interaction === 'input' ? 'ui_slider' : null;
  if (inputType === 'checkbox' || inputType === 'radio' || role === 'checkbox' || role === 'radio') {
    if (interaction !== 'change') return null;
    return temporarySfxToggleIsOn(control) ? 'ui_toggle_on' : 'ui_toggle_off';
  }
  if (role === 'switch') {
    if (interaction !== 'click') return null;
    return temporarySfxToggleIsOn(control) ? 'ui_toggle_on' : 'ui_toggle_off';
  }
  if (inputType === 'submit' && temporarySfxClosest(control, 'form')) return null;
  if (inputType === 'select-one' || inputType === 'select-multiple' || String(control?.tagName || '').toLowerCase() === 'select') {
    if (interaction === 'change') return 'ui_select';
    return interaction === 'click' ? 'ui_open' : null;
  }

  if (interaction !== 'click') return null;
  if (/^(text|search|email|url|tel|password|number|date|time)$/.test(inputType)
    || String(control?.tagName || '').toLowerCase() === 'textarea' || control?.isContentEditable === true) return null;
  const text = temporarySfxControlText(control);
  if (role === 'tab' || control?.matches?.('[role="tab"],[data-tab]')) return 'ui_tab';
  if (control?.matches?.('[role="switch"],[aria-pressed]') || /(?:mute|toggle|switch)$/i.test(String(control?.id || ''))) {
    return temporarySfxToggleIsOn(control) ? 'ui_toggle_on' : 'ui_toggle_off';
  }

  const screen = String(screenName || temporarySfxClosest(target, TEMPORARY_ACTION_SFX_ACTIVE_SCREEN_SELECTOR)?.dataset?.screen || '').toLowerCase();
  if (screen === 'battle') {
    if (temporarySfxClosest(target, TEMPORARY_ACTION_SFX_BATTLE_CARD_SELECTOR)) return 'battle_card_select';
    if (temporarySfxClosest(target, TEMPORARY_ACTION_SFX_BATTLE_TARGET_SELECTOR)) return 'battle_target';
    if (temporarySfxLooksLikeClose(text)) return 'ui_close';
    if (/\b(pass|end turn|finish turn|turn end)\b|ターン終了|手番終了|パス/i.test(text)) return 'battle_turn';
    if (control?.matches?.('#readyPlan,[data-battle-action]') || temporarySfxLooksLikeConfirm(text)) return 'battle_action';
    return 'battle_button';
  }

  if (temporarySfxLooksLikeClose(text)) return 'ui_close';
  if (temporarySfxLooksLikeConfirm(text)) return 'ui_confirm';
  if (temporarySfxLooksLikeSelection(text)) return 'ui_select';
  if (temporarySfxLooksLikeOpen(text)) return 'ui_open';
  return 'ui_button';
}

export function resolveTemporaryEmptyTapCue(target) {
  if (temporarySfxClosest(target, TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR)) return null;
  if (temporarySfxClosest(target, '.contextHelp,.tooltip,[data-tutorial-popover],#screenMotionBridge')) return null;
  const surface = temporarySfxClosest(target, TEMPORARY_ACTION_SFX_ACTIVE_SCREEN_SELECTOR);
  if (!surface?.dataset?.screen) return null;
  return String(surface.dataset.screen).toLowerCase() === 'battle' ? 'battle_empty_tap' : 'ui_empty_tap';
}

function readTemporarySfxSettings(documentSource) {
  const muteControl = documentSource?.querySelector?.('#sfxMute');
  const volumeControl = documentSource?.querySelector?.('#sfxVolume');
  const muteLabel = String(muteControl?.textContent || '');
  const rawVolume = Number(volumeControl?.value);
  return {
    muted: /\bON\b/i.test(muteLabel),
    volume: Number.isFinite(rawVolume) ? Math.max(0, Math.min(1, rawVolume / 100)) : 0.8,
  };
}

export function createTemporarySfxPlayer({
  audioContextFactory,
  readSettings = () => ({muted: false, volume: 0.8}),
  hasUserGesture = (event) => event?.isTrusted === true && hasActiveUserGesture(),
} = {}) {
  let context = null;

  function getAudioContext() {
    if (context) return context;
    if (typeof audioContextFactory !== 'function') return null;
    try { context = audioContextFactory() || null; } catch { context = null; }
    return context;
  }

  function play(cueId, event) {
    const cue = TEMPORARY_ACTION_SFX_CATALOG[cueId];
    if (!cue || !hasUserGesture(event)) return false;
    let settings;
    try { settings = readSettings() || {}; } catch { return false; }
    const rawVolume = Number(settings.volume);
    if (settings.muted === true || !Number.isFinite(rawVolume) || rawVolume <= 0) return false;
    const volume = Math.min(1, Math.max(0, rawVolume));

    try {
      const audioContext = getAudioContext();
      if (!audioContext || typeof audioContext.createOscillator !== 'function' || typeof audioContext.createGain !== 'function') return false;
      if (audioContext.state === 'suspended') Promise.resolve(audioContext.resume?.()).catch(() => {});
      const now = Number(audioContext.currentTime) || 0;
      let scheduled = 0;
      for (const tone of cue.tones) {
        try {
          const when = now + tone.offsetSec;
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = tone.wave;
          oscillator.frequency?.setValueAtTime?.(Math.max(1, tone.startHz), when);
          if (tone.endHz !== tone.startHz) oscillator.frequency?.exponentialRampToValueAtTime?.(Math.max(1, tone.endHz), when + tone.durationSec);
          gain.gain?.setValueAtTime?.(0.0001, when);
          gain.gain?.linearRampToValueAtTime?.(Math.max(0.0001, tone.gain * volume), when + Math.min(0.006, tone.durationSec * 0.2));
          gain.gain?.exponentialRampToValueAtTime?.(0.0001, when + tone.durationSec);
          oscillator.connect?.(gain);
          gain.connect?.(audioContext.destination);
          oscillator.start?.(when);
          oscillator.stop?.(when + tone.durationSec + 0.015);
          scheduled += 1;
        } catch {}
      }
      return scheduled > 0;
    } catch { return false; }
  }

  function dispose() {
    const old = context;
    context = null;
    try { void old?.close?.(); } catch {}
  }

  return Object.freeze({play, dispose});
}

export function installTemporaryActionSfxRuntime({
  documentSource = globalThis.document,
  audioContextFactory = null,
  hasUserGesture = (event) => event?.isTrusted === true && hasActiveUserGesture(),
} = {}) {
  if (!documentSource || typeof documentSource.addEventListener !== 'function') {
    return Object.freeze({installed: false, playCue: () => false, dispose: () => {}});
  }
  const previous = temporaryActionSfxInstallations.get(documentSource);
  if (previous) return previous;

  const makeAudioContext = audioContextFactory || (() => {
    const AudioContextCtor = documentSource.defaultView?.AudioContext
      ?? documentSource.defaultView?.webkitAudioContext
      ?? globalThis.AudioContext
      ?? globalThis.webkitAudioContext;
    return typeof AudioContextCtor === 'function' ? new AudioContextCtor() : null;
  });
  const player = createTemporarySfxPlayer({
    audioContextFactory: makeAudioContext,
    readSettings: () => readTemporarySfxSettings(documentSource),
    hasUserGesture,
  });
  const pointerStarts = new Map();
  const recentPointerInvalidControls = new WeakMap();
  const listeners = [];
  let lastSliderCueAt = Number.NEGATIVE_INFINITY;
  let draggedGesture = null;
  let disposed = false;

  function listen(type, handler, options = false) {
    documentSource.addEventListener(type, handler, options);
    listeners.push([type, handler, options]);
  }
  function eventTime(event) {
    const timestamp = Number(event?.timeStamp);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }
  function pointerKey(event) {
    return event?.pointerId === undefined || event?.pointerId === null ? 1 : event.pointerId;
  }
  function onClickCapture(event) {
    if (!event || typeof event !== 'object') return;
    temporaryActionSfxActiveClickEvent = event;
    Promise.resolve().then(() => {
      if (temporaryActionSfxActiveClickEvent === event) temporaryActionSfxActiveClickEvent = null;
    });
  }
  function onClick(event) {
    if (!event || typeof event !== 'object') return;
    const clickControl = temporarySfxClosest(event.target, TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR);
    const invalidPointerAt = clickControl ? recentPointerInvalidControls.get(clickControl) : undefined;
    const duplicateInvalidPointerCue = Number(event.detail) > 0 && Number.isFinite(invalidPointerAt)
      && Date.now() - invalidPointerAt <= 500;
    if (duplicateInvalidPointerCue) recentPointerInvalidControls.delete(clickControl);
    if (temporaryActionSfxNavigationDecisions.has(event)) {
      const navigationDecision = temporaryActionSfxNavigationDecisions.get(event);
      if (!navigationDecision?.ok && !duplicateInvalidPointerCue) player.play('ui_invalid', event);
      return;
    }
    if (duplicateInvalidPointerCue) return;
    if (draggedGesture && Date.now() <= draggedGesture.expiresAt
      && clickControl && clickControl === draggedGesture.control) {
      draggedGesture = null;
      return;
    }
    draggedGesture = null;
    const cueId = resolveTemporaryActionSfxCue({target: event.target, event, interaction: 'click'});
    if (cueId) player.play(cueId, event);
  }
  function onPointerDown(event) {
    if (event?.isPrimary === false || Number(event?.button) > 0) return;
    const surface = temporarySfxClosest(event?.target, TEMPORARY_ACTION_SFX_ACTIVE_SCREEN_SELECTOR);
    if (!surface) return;
    const pointX = Number(event?.clientX);
    const pointY = Number(event?.clientY);
    pointerStarts.set(pointerKey(event), {
      target: event.target,
      control: temporarySfxClosest(event.target, TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR),
      surface,
      screenName: String(surface?.dataset?.screen || '').toLowerCase(),
      x: Number.isFinite(pointX) ? pointX : 0,
      y: Number.isFinite(pointY) ? pointY : 0,
      at: eventTime(event),
    });
  }
  function onPointerUp(event) {
    const start = pointerStarts.get(pointerKey(event));
    pointerStarts.delete(pointerKey(event));
    if (!start || event?.isPrimary === false || Number(event?.button) > 0) return;

    const endSurface = temporarySfxClosest(event.target, TEMPORARY_ACTION_SFX_ACTIVE_SCREEN_SELECTOR);
    const endControl = temporarySfxClosest(event.target, TEMPORARY_ACTION_SFX_INTERACTIVE_SELECTOR);
    const disabledControl = temporarySfxDisabled(endControl) ? endControl
      : temporarySfxDisabled(start.control) && start.control === endControl ? start.control
        : null;
    if (disabledControl) {
      recentPointerInvalidControls.set(disabledControl, Date.now());
      player.play('ui_invalid', event);
      return;
    }

    const dx = (Number(event?.clientX) || 0) - start.x;
    const dy = (Number(event?.clientY) || 0) - start.y;
    const distance = Math.hypot(dx, dy);
    const elapsed = Math.max(0, eventTime(event) - start.at);
    if (distance >= 8) {
      const startedOnBattleCard = start.screenName === 'battle'
        && Boolean(temporarySfxClosest(start.target, TEMPORARY_ACTION_SFX_BATTLE_CARD_SELECTOR));
      const endedOnBattleTarget = String(endSurface?.dataset?.screen || '').toLowerCase() === 'battle'
        && Boolean(temporarySfxClosest(event.target, TEMPORARY_ACTION_SFX_BATTLE_TARGET_SELECTOR));
      if (startedOnBattleCard && endedOnBattleTarget) player.play('battle_action', event);
      if (start.control) draggedGesture = {control: start.control, expiresAt: Date.now() + 500};
      return;
    }
    if (elapsed > 900 || start.surface !== endSurface) return;
    const cueId = resolveTemporaryEmptyTapCue(event.target);
    if (cueId) player.play(cueId, event);
  }
  function onPointerCancel(event) {
    pointerStarts.delete(pointerKey(event));
  }
  function onInput(event) {
    const cueId = resolveTemporaryActionSfxCue({target: event?.target, event, interaction: 'input'});
    if (!cueId) return;
    const now = Date.now();
    if (now - lastSliderCueAt < 110) return;
    lastSliderCueAt = now;
    player.play(cueId, event);
  }
  function onChange(event) {
    const cueId = resolveTemporaryActionSfxCue({target: event?.target, event, interaction: 'change'});
    if (cueId) player.play(cueId, event);
  }
  function onFocusIn(event) {
    const control = temporarySfxClosest(event?.target, 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),textarea,[contenteditable="true"]');
    if (control) player.play('ui_focus', event);
  }
  function onSubmit(event) {
    if (String(event?.target?.tagName || '').toLowerCase() === 'form') player.play('ui_confirm', event);
  }
  function onKeyDown(event) {
    if (String(event?.key || '') === 'Escape' && event?.repeat !== true) player.play('ui_close', event);
  }

  listen('click', onClickCapture, true);
  listen('click', onClick);
  listen('pointerdown', onPointerDown, true);
  listen('pointerup', onPointerUp);
  listen('pointercancel', onPointerCancel);
  listen('input', onInput);
  listen('change', onChange);
  listen('focusin', onFocusIn);
  listen('submit', onSubmit);
  listen('keydown', onKeyDown, true);

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const [type, handler, options] of listeners) documentSource.removeEventListener?.(type, handler, options);
    pointerStarts.clear();
    player.dispose();
    temporaryActionSfxInstallations.delete(documentSource);
  }
  const runtime = Object.freeze({
    installed: true,
    playCue(cueId, event) { return player.play(cueId, event); },
    dispose,
  });
  temporaryActionSfxInstallations.set(documentSource, runtime);
  return runtime;
}

export function resolveScreenNavigation(currentScreen, requestedTarget) {
  if (!requestedTarget) return {ok: false, from: currentScreen, to: currentScreen, reason: SCREEN_NAVIGATION_REASON.EMPTY_TARGET};
  if (requestedTarget === currentScreen) return {ok: false, from: currentScreen, to: currentScreen, reason: SCREEN_NAVIGATION_REASON.CURRENT_SCREEN};
  const decision = {ok: true, from: currentScreen, to: requestedTarget, reason: SCREEN_NAVIGATION_REASON.NAVIGATE};
  if (temporaryActionSfxActiveClickEvent) {
    temporaryActionSfxNavigationDecisions.set(temporaryActionSfxActiveClickEvent, decision);
  }
  playAcceptedNavigationSfx();
  return decision;
}

export function resolveScreenBackTarget(currentScreen, historyEntry) {
  return historyEntry?.screen || SCREEN_NAVIGATION_FALLBACK_PARENT[currentScreen] || 'home';
}

export function createScreenNavigationRuntimeBridge(options = {}) {
  installTemporaryActionSfxRuntime(options);
  return Object.freeze({
    resolve(currentScreen, requestedTarget) { return resolveScreenNavigation(currentScreen, requestedTarget); },
    resolveBackTarget(currentScreen, historyEntry) { return resolveScreenBackTarget(currentScreen, historyEntry); }
  });
}

function requireFunction(value, label) { if (typeof value !== 'function') throw new Error(`${label} must be a function`); return value; }
function readBoolean(source) { return Boolean(typeof source === 'function' ? source() : source); }
function resolveMotionProfile({reducedMotion, lowPerf}) {
  if (reducedMotion) return MENU_TRANSITION_MOTION_PROFILE.NONE;
  if (lowPerf) return MENU_TRANSITION_MOTION_PROFILE.REDUCED;
  return MENU_TRANSITION_MOTION_PROFILE.NORMAL;
}
function freezeTransitionResult(result) { return Object.freeze(result); }
function screenSurface(documentSource, screen) {
  if (!documentSource || typeof documentSource.querySelectorAll !== 'function') return null;
  return [...documentSource.querySelectorAll('.screen[data-screen]')].find((candidate) => candidate?.dataset?.screen === screen) || null;
}
function containsNode(surface, node) { return Boolean(surface && node && (surface === node || surface.contains?.(node))); }

function rectCenter(node) {
  const rect = node?.getBoundingClientRect?.();
  const left = Number(rect?.left);
  const top = Number(rect?.top);
  const width = Number(rect?.width);
  const height = Number(rect?.height);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return Object.freeze({x: left + width / 2, y: top + height / 2});
}

export function resolveHomeRouteMotionVector(surface, to) {
  if (!surface || typeof surface.querySelector !== 'function' || typeof surface.querySelectorAll !== 'function') return null;
  const targetKey = String(to || '').trim();
  if (!targetKey) return null;
  const pivot = surface.querySelector(HOME_SLIDEPAD_CENTER_SELECTOR);
  const target = [...surface.querySelectorAll(HOME_ROUTE_SELECTOR)]
    .find((candidate) => String(candidate?.dataset?.homeTarget || '').trim() === targetKey);
  const pivotCenter = rectCenter(pivot);
  const targetCenter = rectCenter(target);
  if (!pivotCenter || !targetCenter) return null;
  const dx = targetCenter.x - pivotCenter.x;
  const dy = targetCenter.y - pivotCenter.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance > 0)) return null;
  return Object.freeze({x: dx / distance, y: dy / distance, target: targetKey});
}

function transformFor(intent, distance, scale = 1, rotateDeg = 0) {
  const translate = intent.routeVector
    ? `translate3d(${intent.routeVector.x * distance}px,${intent.routeVector.y * distance}px,0)`
    : intent.axis === 'x' ? `translate3d(${distance}px,0,0)` : `translate3d(0,${distance}px,0)`;
  const rotation = rotateDeg === 0 ? '' : ` rotate(${rotateDeg}deg)`;
  const scaling = scale === 1 ? '' : ` scale(${scale})`;
  return `${translate}${rotation}${scaling}`;
}

function presentationFrames(kind, spec, intent) {
  if (kind === 'press') return [{transform: 'scale(1)'}, {transform: 'scale(.985)'}, {transform: 'scale(1)'}];
  if (kind === 'focus') return [
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'},
    {boxShadow: '0 0 0 3px rgba(160,239,213,.34)'},
    {boxShadow: '0 0 0 0 rgba(160,239,213,0)'}
  ];
  if (spec.distancePx <= 0) return kind === 'exit' ? [{opacity: 1}, {opacity: .88}] : [{opacity: .86}, {opacity: 1}];
  const signedDistance = spec.distancePx * intent.enterSign;
  const routeDirected = Boolean(intent.routeVector);
  const exitDistance = routeDirected ? spec.distancePx : -signedDistance;
  const enterDistance = routeDirected ? -spec.distancePx : signedDistance;
  if (kind === 'exit') return [
    {opacity: 1, transform: transformFor(intent, 0)},
    {opacity: .84, transform: transformFor(intent, exitDistance, 1 + ((1 - intent.scaleFrom) * .35), -intent.rotateDeg * .5)}
  ];
  return [
    {opacity: .8, transform: transformFor(intent, enterDistance, intent.scaleFrom, intent.rotateDeg)},
    {opacity: 1, transform: transformFor(intent, 0)}
  ];
}

function animationDuration(kind, spec) {
  if (kind === 'exit') return spec.exitMs;
  if (kind === 'enter') return spec.enterMs;
  return spec.feedbackMs;
}

function viewportSize(documentSource) {
  const root = documentSource?.documentElement;
  return {width: Number(root?.clientWidth) || 0, height: Number(root?.clientHeight) || 0};
}

function motionPieces(surface, screen) {
  if (!surface || typeof surface.querySelectorAll !== 'function') return [];
  const selectors = SCREEN_MOTION_PIECE_SELECTORS[String(screen || '').trim().toLowerCase()] || [];
  const pieces = [];
  for (const selector of selectors) {
    for (const node of surface.querySelectorAll(selector)) {
      if (!node || pieces.includes(node)) continue;
      const rect = node.getBoundingClientRect?.();
      if (!rect || !(rect.width > 0) || !(rect.height > 0)) continue;
      pieces.push(node);
    }
  }
  return pieces;
}

function pieceEnterFrames(piece, documentSource, intent) {
  const rect = piece?.getBoundingClientRect?.();
  const viewport = viewportSize(documentSource);
  if (!rect || !(viewport.width > 0) || !(viewport.height > 0)) return null;
  const margin = 12;
  let dx = 0;
  let dy = 0;
  if (intent.axis === 'x') {
    const fromLeft = -(rect.right + margin);
    const fromRight = viewport.width - rect.left + margin;
    dx = Math.abs(fromLeft) <= Math.abs(fromRight) ? fromLeft : fromRight;
  } else {
    const fromTop = -(rect.bottom + margin);
    const fromBottom = viewport.height - rect.top + margin;
    dy = Math.abs(fromTop) <= Math.abs(fromBottom) ? fromTop : fromBottom;
  }
  return [
    {opacity: .76, translate: `${dx}px ${dy}px`, scale: String(intent.scaleFrom)},
    {opacity: 1, translate: '0px 0px', scale: '1'}
  ];
}

export function ensureScreenTransitionEdgeShimmerStyle(documentSource = globalThis.document) {
  if (!documentSource?.head || typeof documentSource.createElement !== 'function') return false;
  if (documentSource.getElementById?.(SCREEN_TRANSITION_EDGE_SHIMMER_STYLE_ID)) return false;
  const style = documentSource.createElement('style');
  style.id = SCREEN_TRANSITION_EDGE_SHIMMER_STYLE_ID;
  style.textContent = SCREEN_TRANSITION_EDGE_SHIMMER_CSS;
  documentSource.head.append?.(style);
  return true;
}

export function ensureScreenTransitionEdgeShimmer(documentSource, surface) {
  if (!documentSource || !surface || typeof documentSource.createElement !== 'function' || typeof surface.append !== 'function') return null;
  const existing = surface.querySelector?.('[data-screen-transition-edge-shimmer]');
  if (existing) return existing;
  ensureScreenTransitionEdgeShimmerStyle(documentSource);
  const overlay = documentSource.createElement('span');
  overlay.className = 'gameroadScreenTransitionEdgeShimmer';
  overlay.dataset.screenTransitionEdgeShimmer = 'true';
  overlay.setAttribute?.('aria-hidden', 'true');
  overlay.setAttribute?.('data-presentation-only', 'true');
  surface.append(overlay);
  return overlay;
}

export function createScreenMotionPresentationDriver({document: documentSource = globalThis.document, maxEvents = 32} = {}) {
  const sessions = new Map();
  const events = [];
  ensureScreenTransitionEdgeShimmerStyle(documentSource);
  const record = (event) => {
    events.push(Object.freeze({...event}));
    if (events.length > maxEvents) events.splice(0, events.length - maxEvents);
  };
  const markerTargets = (session) => [...new Set([session.outgoing, session.incoming].filter(Boolean))];

  function clearMarkers(session) {
    const revision = String(session.revision);
    for (const surface of markerTargets(session)) {
      if (surface.dataset?.screenMotionRevision !== revision) continue;
      delete surface.dataset.screenMotionRevision;
      delete surface.dataset.screenMotionPhase;
      delete surface.dataset.screenMotionProfile;
      delete surface.dataset.screenMotionFamily;
      delete surface.dataset.screenMotionBridge;
    }
  }

  function finishRevision(revision, status = 'finished') {
    const session = sessions.get(revision);
    if (!session) return false;
    sessions.delete(revision);
    session.signal?.removeEventListener?.('abort', session.onAbort);
    for (const animation of session.animations) animation.cancel?.();
    session.animations.clear();
    for (const shimmer of session.edgeShimmers) shimmer.remove?.();
    session.edgeShimmers.clear();
    clearMarkers(session);
    record({revision, phase: 'CLEANUP', status});
    return true;
  }

  function ensureSession(context) {
    let session = sessions.get(context.revision);
    if (session) return session;
    const outgoing = screenSurface(documentSource, context.from);
    const baseIntent = resolveScreenMotionIntent(context.from, context.to, context.reason);
    const routeVector = context.from === 'home' && context.reason !== 'back'
      ? resolveHomeRouteMotionVector(outgoing, context.to)
      : null;
    const intent = routeVector
      ? Object.freeze({...baseIntent, routeVector, motionSource: 'home-route-geometry'})
      : baseIntent;
    const exitTarget = context.from === 'home'
      ? outgoing?.querySelector?.(HOME_VISUAL_LAYER_SELECTOR) || outgoing
      : outgoing;
    session = {
      revision: context.revision, signal: context.signal,
      outgoing, incoming: null, exitTarget,
      pressedControl: null, animations: new Set(), edgeShimmers: new Set(), onAbort: null, exitPromise: null,
      intent
    };
    session.pressedControl = containsNode(session.outgoing, documentSource?.activeElement) ? documentSource.activeElement : null;
    session.onAbort = () => finishRevision(context.revision, 'aborted');
    context.signal?.addEventListener?.('abort', session.onAbort, {once: true});
    sessions.set(context.revision, session);
    return session;
  }

  function prepareEdgeShimmer(session, surface) {
    const shimmer = ensureScreenTransitionEdgeShimmer(documentSource, surface);
    if (shimmer) session.edgeShimmers.add(shimmer);
    return shimmer;
  }

  function mark(surface, context, phase, intent) {
    if (!surface?.dataset) return;
    surface.dataset.screenMotionRevision = String(context.revision);
    surface.dataset.screenMotionPhase = String(phase).toLowerCase();
    surface.dataset.screenMotionProfile = context.motionProfile;
    surface.dataset.screenMotionFamily = intent.family;
    surface.dataset.screenMotionBridge = intent.bridge;
  }

  async function animateFrames(session, target, kind, context, frames, eventExtra = {}, durationOverride = null) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC[MENU_TRANSITION_MOTION_PROFILE.NORMAL];
    const duration = Number.isFinite(durationOverride) ? durationOverride : animationDuration(kind, spec);
    if (!target || duration === 0 || typeof target.animate !== 'function' || context.signal?.aborted) {
      record({revision: context.revision, phase: context.phase, kind, status: 'no_effect', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra});
      return;
    }
    let animation;
    try {
      animation = target.animate(frames, {duration, easing: spec.easing, fill: 'none'});
    } catch (error) {
      record({revision: context.revision, phase: context.phase, kind, status: 'failed_soft', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra, errorName: error instanceof Error ? error.name : 'Error'});
      return;
    }
    session.animations.add(animation);
    const cancel = () => animation.cancel?.();
    context.signal?.addEventListener?.('abort', cancel, {once: true});
    try {
      await Promise.resolve(animation.finished);
      record({revision: context.revision, phase: context.phase, kind, status: 'completed', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra});
    } catch (error) {
      record({revision: context.revision, phase: context.phase, kind, status: context.signal?.aborted ? 'aborted' : 'failed_soft', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, ...eventExtra, errorName: error instanceof Error ? error.name : 'Error'});
    } finally {
      context.signal?.removeEventListener?.('abort', cancel);
      session.animations.delete(animation);
      animation.cancel?.();
    }
  }

  async function animate(session, target, kind, context) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC[MENU_TRANSITION_MOTION_PROFILE.NORMAL];
    return animateFrames(session, target, kind, context, presentationFrames(kind, spec, session.intent));
  }

  async function animateEdgeShimmer(session, target, direction, context) {
    const spec = SCREEN_MOTION_PRESENTATION_SPEC[context.motionProfile] || SCREEN_MOTION_PRESENTATION_SPEC[MENU_TRANSITION_MOTION_PROFILE.NORMAL];
    const frames = SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES[direction] || SCREEN_TRANSITION_EDGE_SHIMMER_FRAMES.exit;
    return animateFrames(session, target, 'edge_shimmer', context, frames, {effect: 'edge_shimmer', direction}, spec.edgeShimmerMs);
  }

  async function animateIncoming(session, context) {
    if (session.intent.routeVector || context.motionProfile !== MENU_TRANSITION_MOTION_PROFILE.NORMAL) {
      await animate(session, session.incoming, 'enter', context);
      return;
    }
    const pieces = motionPieces(session.incoming, context.to);
    const frames = pieces.map((piece) => pieceEnterFrames(piece, documentSource, session.intent));
    if (pieces.length < 2 || frames.some((value) => !value)) {
      await animate(session, session.incoming, 'enter', context);
      return;
    }
    record({revision: context.revision, phase: context.phase, kind: 'multi_surface_enter', status: 'started', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge, pieceCount: pieces.length});
    await Promise.all(pieces.map((piece, index) => animateFrames(session, piece, 'enter', context, frames[index], {pieceIndex: index, pieceCount: pieces.length, multiSurface: true})));
  }

  async function runPhase(phase, context) {
    const session = ensureSession(context);
    if (context.signal?.aborted) return;
    const phaseContext = Object.freeze({...context, phase});
    try {
      if (phase === 'PREPARE') {
        mark(session.outgoing, context, phase, session.intent);
        void animate(session, session.pressedControl, 'press', phaseContext);
      } else if (phase === 'EXIT') {
        mark(session.outgoing, context, phase, session.intent);
        const exitShimmer = prepareEdgeShimmer(session, session.outgoing);
        session.exitPromise = Promise.all([
          animate(session, session.exitTarget, 'exit', phaseContext),
          animateEdgeShimmer(session, exitShimmer, 'exit', phaseContext),
        ]);
      } else if (phase === 'SWAP') {
        session.incoming = screenSurface(documentSource, context.to);
        mark(session.incoming, context, phase, session.intent);
        record({revision: context.revision, phase, kind: 'surface_swap_observed', status: session.incoming ? 'completed' : 'surface_missing', profile: context.motionProfile, family: session.intent.family, bridge: session.intent.bridge});
        prepareEdgeShimmer(session, session.incoming);
      } else if (phase === 'ENTER') {
        mark(session.incoming, context, phase, session.intent);
        const exitPromise = session.exitPromise || Promise.resolve();
        const enterPromise = Promise.all([
          animateIncoming(session, phaseContext),
          animateEdgeShimmer(session, prepareEdgeShimmer(session, session.incoming), 'enter', phaseContext),
        ]);
        await Promise.all([exitPromise, enterPromise]);
        session.exitPromise = null;
      } else if (phase === 'SETTLE') {
        mark(session.incoming, context, phase, session.intent);
        const focusedControl = containsNode(session.incoming, documentSource?.activeElement) ? documentSource.activeElement : null;
        await animate(session, focusedControl, 'focus', phaseContext);
        finishRevision(context.revision, 'settled');
      }
    } catch (error) {
      record({revision: context.revision, phase, kind: 'driver', status: 'failed_soft', errorName: error instanceof Error ? error.name : 'Error'});
      finishRevision(context.revision, 'failed_soft');
    }
  }

  function getState() {
    return Object.freeze({activeRevisions: Object.freeze([...sessions.keys()]), events: Object.freeze(events.map((event) => Object.freeze({...event})))});
  }
  return Object.freeze({runPhase, finishRevision, getState});
}

export function createScreenTransitionRuntimeAdapter({
  getCurrentScreen, applyScreen, runVisualPhase = async () => {},
  presentationDriver = createScreenMotionPresentationDriver(), navigationBridge = createScreenNavigationRuntimeBridge(),
  reducedMotion = false, lowPerf = false
} = {}) {
  requireFunction(getCurrentScreen, 'getCurrentScreen');
  requireFunction(applyScreen, 'applyScreen');
  requireFunction(runVisualPhase, 'runVisualPhase');
  if (!presentationDriver || typeof presentationDriver.runPhase !== 'function') throw new Error('presentationDriver must expose runPhase');
  if (!navigationBridge || typeof navigationBridge.resolve !== 'function' || typeof navigationBridge.resolveBackTarget !== 'function') throw new Error('navigationBridge must expose resolve and resolveBackTarget');

  const director = createTransitionDirector({
    runPhase: async (phase, context) => {
      const motionProfile = resolveMotionProfile(context);
      const visualContext = Object.freeze({...context, motionProfile});
      await Promise.all([presentationDriver.runPhase(phase, visualContext), runVisualPhase(phase, visualContext)]);
    }
  });

  async function navigate(requestedTarget, {reason = 'navigation'} = {}) {
    const from = getCurrentScreen();
    const decision = navigationBridge.resolve(from, requestedTarget);
    if (!decision.ok) {
      if (decision.reason === SCREEN_NAVIGATION_REASON.CURRENT_SCREEN && director.getState().activeRevision !== null) director.cancel();
      return freezeTransitionResult({status: 'ignored', revision: director.getState().revision, from: decision.from, to: decision.to, swapped: false, reason: decision.reason});
    }
    const result = await director.start({
      from: decision.from, to: decision.to, reason,
      reducedMotion: readBoolean(reducedMotion), lowPerf: readBoolean(lowPerf),
      applySwap: (context) => {
        const applied = applyScreen(decision.to, Object.freeze({from: decision.from, to: decision.to, reason, revision: context.revision}));
        if (applied && typeof applied.then === 'function') throw new Error('applyScreen must be synchronous');
        if (decision.to === 'gacha') ensureGachaPreviewDisclosure(globalThis.document);
      }
    });
    presentationDriver.finishRevision?.(result.revision, result.status);
    return freezeTransitionResult({...result, navigationReason: decision.reason});
  }

  async function back(historyEntry, options = {}) {
    const current = getCurrentScreen();
    const target = navigationBridge.resolveBackTarget(current, historyEntry);
    return navigate(target, {reason: options.reason || 'back'});
  }

  return Object.freeze({
    navigate, back, cancel: director.cancel, getState: director.getState,
    getPresentationState: typeof presentationDriver.getState === 'function' ? presentationDriver.getState : () => Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])})
  });
}
