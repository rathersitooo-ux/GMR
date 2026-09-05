const STYLE_ID = 'gameroad-quick-settings-panel-style-r1';
const PANEL_ATTR = 'data-gameroad-quick-settings-panel';

export const QUICK_SETTINGS_CONTROL_IDS = Object.freeze({
  reduceMotion: 'reduceMotion',
  lowPerf: 'lowPerf',
  musicVolume: 'musicVolume',
  sfxVolume: 'sfxVolume',
  partnerVoiceVolume: 'partnerVoiceVolume',
  musicMute: 'musicMute',
  sfxMute: 'sfxMute',
  partnerVoiceMute: 'partnerVoiceMute',
});

export const QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS = Object.freeze(['masterVolume']);

const AUDIO_ROWS = Object.freeze([
  Object.freeze({ key: 'music', label: 'BGM', volume: 'musicVolume', mute: 'musicMute' }),
  Object.freeze({ key: 'sfx', label: '効果音', volume: 'sfxVolume', mute: 'sfxMute' }),
  Object.freeze({ key: 'voice', label: 'Voice', volume: 'partnerVoiceVolume', mute: 'partnerVoiceMute' }),
]);

const TOGGLE_ROWS = Object.freeze([
  Object.freeze({ key: 'reduceMotion', label: '動き軽減' }),
  Object.freeze({ key: 'lowPerf', label: '軽量表示' }),
]);

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 100;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toggleOn(control) {
  const aria = control?.getAttribute?.('aria-pressed');
  if (aria === 'true') return true;
  if (aria === 'false') return false;
  const value = text(control?.textContent).toLowerCase();
  return value === 'on' || value === 'オン' || value.includes(' on');
}

function dispatchExisting(global, control, type) {
  if (!control?.dispatchEvent) return false;
  const EventCtor = global?.Event;
  if (typeof EventCtor === 'function') control.dispatchEvent(new EventCtor(type, { bubbles: true }));
  else control.dispatchEvent({ type, bubbles: true, target: control });
  return true;
}

function controlByKey(document, key) {
  const id = QUICK_SETTINGS_CONTROL_IDS[key];
  if (!id) return null;
  return document?.getElementById?.(id) ?? null;
}

export function inspectExistingSettingsAuthority(document) {
  const controls = {};
  const missing = [];
  for (const key of Object.keys(QUICK_SETTINGS_CONTROL_IDS)) {
    const control = controlByKey(document, key);
    controls[key] = control;
    if (!control) missing.push(key);
  }
  return Object.freeze({
    settingsSection: document?.querySelector?.('section[data-screen="settings"]') ?? null,
    controls: Object.freeze(controls),
    missing: Object.freeze(missing),
    knownAuthorityGaps: QUICK_SETTINGS_KNOWN_AUTHORITY_GAPS,
  });
}

export function createExistingSettingsBridge(document, global = globalThis) {
  function read() {
    const authority = inspectExistingSettingsAuthority(document);
    const controls = authority.controls;
    return Object.freeze({
      musicVolume: controls.musicVolume ? percent(controls.musicVolume.value) : null,
      sfxVolume: controls.sfxVolume ? percent(controls.sfxVolume.value) : null,
      partnerVoiceVolume: controls.partnerVoiceVolume ? percent(controls.partnerVoiceVolume.value) : null,
      musicMuted: controls.musicMute ? toggleOn(controls.musicMute) : null,
      sfxMuted: controls.sfxMute ? toggleOn(controls.sfxMute) : null,
      partnerVoiceMuted: controls.partnerVoiceMute ? toggleOn(controls.partnerVoiceMute) : null,
      reduceMotion: controls.reduceMotion ? toggleOn(controls.reduceMotion) : null,
      lowPerf: controls.lowPerf ? toggleOn(controls.lowPerf) : null,
      missing: authority.missing,
      knownAuthorityGaps: authority.knownAuthorityGaps,
    });
  }

  function setVolume(key, value) {
    if (!['musicVolume', 'sfxVolume', 'partnerVoiceVolume'].includes(key)) return false;
    const control = controlByKey(document, key);
    if (!control) return false;
    control.value = String(percent(value));
    dispatchExisting(global, control, 'input');
    dispatchExisting(global, control, 'change');
    return true;
  }

  function toggle(key) {
    if (!['musicMute', 'sfxMute', 'partnerVoiceMute', 'reduceMotion', 'lowPerf'].includes(key)) return false;
    const control = controlByKey(document, key);
    if (!control || typeof control.click !== 'function') return false;
    control.click();
    return true;
  }

  return Object.freeze({ read, setVolume, toggle });
}

function node(document, tag, className = '', label = '') {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (label) value.textContent = label;
  return value;
}

function ensureStyle(document) {
  if (!document?.head || document.getElementById?.(STYLE_ID)) return;
  const style = node(document, 'style');
  style.id = STYLE_ID;
  style.textContent = `
[${PANEL_ATTR}][hidden]{display:none!important}
[${PANEL_ATTR}]{position:fixed;inset:0;z-index:100100;display:flex;align-items:flex-end;justify-content:flex-end;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:rgba(4,10,14,.46);backdrop-filter:blur(5px)}
[${PANEL_ATTR}] .grQuickSettingsPanel{width:min(420px,100%);max-height:min(88vh,650px);overflow:auto;display:grid;gap:12px;padding:15px;border:1px solid rgba(255,255,255,.18);border-radius:18px;background:rgba(13,28,31,.97);color:#f7fbfa;box-shadow:0 20px 58px rgba(0,0,0,.42);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
[${PANEL_ATTR}] .grQuickSettingsHead{display:flex;align-items:center;justify-content:space-between;gap:10px}
[${PANEL_ATTR}] .grQuickSettingsHead h2{margin:0;font-size:18px}
[${PANEL_ATTR}] button,[${PANEL_ATTR}] input{touch-action:manipulation}
[${PANEL_ATTR}] button{min-height:44px;border:1px solid rgba(255,255,255,.22);border-radius:12px;background:rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:800}
[${PANEL_ATTR}] .grQuickSettingsClose{min-width:44px}
[${PANEL_ATTR}] .grQuickSettingsRow{display:grid;grid-template-columns:minmax(62px,auto) minmax(110px,1fr) minmax(70px,auto);align-items:center;gap:9px}
[${PANEL_ATTR}] .grQuickSettingsRow>span{font-weight:800}
[${PANEL_ATTR}] input[type="range"]{width:100%;min-height:44px}
[${PANEL_ATTR}] .grQuickSettingsToggle{grid-column:2/4;width:100%}
[${PANEL_ATTR}] .grQuickSettingsDetails{width:100%;margin-top:2px}
[${PANEL_ATTR}] .grQuickSettingsStatus{margin:0;font-size:12px;opacity:.72}
[${PANEL_ATTR}] button:focus-visible,[${PANEL_ATTR}] input:focus-visible{outline:3px solid currentColor;outline-offset:2px}
@media(max-height:430px) and (orientation:landscape){[${PANEL_ATTR}]{align-items:stretch}[${PANEL_ATTR}] .grQuickSettingsPanel{max-height:none;width:min(390px,52vw);gap:8px;padding:10px}[${PANEL_ATTR}] .grQuickSettingsRow{gap:6px}}
`;
  document.head.append(style);
}

function removeNode(value) {
  if (!value?.parentNode) return;
  if (typeof value.remove === 'function') value.remove();
  else if (typeof value.parentNode.removeChild === 'function') value.parentNode.removeChild(value);
}

export function mountQuickSettingsPanel(global = globalThis, { surface = 'home', trigger = null, onDetail = null } = {}) {
  const document = global?.document;
  if (!document?.body || typeof document.createElement !== 'function') {
    return Object.freeze({ connected: false, surface, open: () => false, close: () => false, refresh: () => null, destroy: () => false });
  }
  ensureStyle(document);
  const bridge = createExistingSettingsBridge(document, global);
  const overlay = node(document, 'div');
  overlay.hidden = true;
  overlay.setAttribute?.(PANEL_ATTR, '1');
  overlay.setAttribute?.('role', 'dialog');
  overlay.setAttribute?.('aria-modal', 'true');
  overlay.dataset.surface = surface;
  const panel = node(document, 'section', 'grQuickSettingsPanel');
  const head = node(document, 'div', 'grQuickSettingsHead');
  const title = node(document, 'h2', '', surface === 'battle' ? '対戦設定' : '簡易設定');
  const closeButton = node(document, 'button', 'grQuickSettingsClose', '閉じる');
  closeButton.setAttribute?.('type', 'button');
  head.append(title, closeButton);
  panel.append(head);

  const volumeInputs = {};
  const muteButtons = {};
  for (const row of AUDIO_ROWS) {
    const wrap = node(document, 'div', 'grQuickSettingsRow');
    const label = node(document, 'span', '', row.label);
    const range = node(document, 'input');
    range.setAttribute?.('type', 'range');
    range.setAttribute?.('min', '0');
    range.setAttribute?.('max', '100');
    range.setAttribute?.('step', '1');
    range.setAttribute?.('aria-label', `${row.label}音量`);
    const mute = node(document, 'button', '', 'MUTE');
    mute.setAttribute?.('type', 'button');
    mute.setAttribute?.('aria-label', `${row.label}ミュート`);
    range.addEventListener?.('input', () => {
      bridge.setVolume(row.volume, range.value);
      refresh();
    });
    mute.addEventListener?.('click', () => {
      bridge.toggle(row.mute);
      refresh();
    });
    volumeInputs[row.volume] = range;
    muteButtons[row.mute] = mute;
    wrap.append(label, range, mute);
    panel.append(wrap);
  }

  const toggleButtons = {};
  for (const row of TOGGLE_ROWS) {
    const wrap = node(document, 'div', 'grQuickSettingsRow');
    const label = node(document, 'span', '', row.label);
    const button = node(document, 'button', 'grQuickSettingsToggle');
    button.setAttribute?.('type', 'button');
    button.addEventListener?.('click', () => {
      bridge.toggle(row.key);
      refresh();
    });
    toggleButtons[row.key] = button;
    wrap.append(label, button);
    panel.append(wrap);
  }

  let detailButton = null;
  if (surface === 'home' && typeof onDetail === 'function') {
    detailButton = node(document, 'button', 'grQuickSettingsDetails', '詳細設定');
    detailButton.setAttribute?.('type', 'button');
    detailButton.addEventListener?.('click', () => onDetail());
    panel.append(detailButton);
  }
  const status = node(document, 'p', 'grQuickSettingsStatus');
  panel.append(status);
  overlay.append(panel);
  document.body.append(overlay);

  function refresh() {
    const current = bridge.read();
    for (const row of AUDIO_ROWS) {
      const range = volumeInputs[row.volume];
      const mute = muteButtons[row.mute];
      const value = current[row.volume];
      range.disabled = value == null;
      if (value != null) range.value = String(value);
      const mutedKey = row.mute === 'musicMute' ? 'musicMuted' : row.mute === 'sfxMute' ? 'sfxMuted' : 'partnerVoiceMuted';
      const muted = current[mutedKey];
      mute.disabled = muted == null;
      mute.textContent = muted === true ? 'MUTE ON' : muted === false ? 'MUTE OFF' : '未接続';
      mute.setAttribute?.('aria-pressed', muted === true ? 'true' : 'false');
    }
    for (const row of TOGGLE_ROWS) {
      const button = toggleButtons[row.key];
      const enabled = current[row.key];
      button.disabled = enabled == null;
      button.textContent = enabled === true ? 'ON' : enabled === false ? 'OFF' : '未接続';
      button.setAttribute?.('aria-pressed', enabled === true ? 'true' : 'false');
    }
    status.textContent = current.missing.length ? `未接続: ${current.missing.join(', ')}` : '';
    overlay.dataset.authorityGap = current.knownAuthorityGaps.join(',');
    return current;
  }

  function open() {
    refresh();
    overlay.hidden = false;
    trigger?.setAttribute?.('aria-expanded', 'true');
    closeButton.focus?.();
    return true;
  }

  function close() {
    if (overlay.hidden) return false;
    overlay.hidden = true;
    trigger?.setAttribute?.('aria-expanded', 'false');
    trigger?.focus?.();
    return true;
  }

  const overlayClick = (event) => { if (event?.target === overlay) close(); };
  const keydown = (event) => { if (event?.key === 'Escape' && !overlay.hidden) close(); };
  overlay.addEventListener?.('click', overlayClick);
  document.addEventListener?.('keydown', keydown);
  closeButton.addEventListener?.('click', close);

  let destroyed = false;
  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    document.removeEventListener?.('keydown', keydown);
    removeNode(overlay);
    trigger?.setAttribute?.('aria-expanded', 'false');
    return true;
  }

  return Object.freeze({ connected: true, surface, overlay, panel, bridge, open, close, refresh, destroy, detailButton });
}

export function bindQuickSettingsTrigger(global = globalThis, { trigger, surface = 'home' } = {}) {
  if (!trigger || typeof trigger.addEventListener !== 'function') {
    return Object.freeze({ connected: false, surface, trigger: trigger ?? null, destroy: () => false, open: () => false });
  }
  let bypassOnce = false;
  let panel = null;
  const openDetailedSettings = surface === 'home'
    ? () => {
        panel?.close?.();
        bypassOnce = true;
        trigger.click?.();
        if (bypassOnce) bypassOnce = false;
      }
    : null;
  panel = mountQuickSettingsPanel(global, { surface, trigger, onDetail: openDetailedSettings });
  const click = (event) => {
    if (bypassOnce) {
      bypassOnce = false;
      return;
    }
    event?.preventDefault?.();
    event?.stopPropagation?.();
    panel.open();
  };
  trigger.addEventListener('click', click, true);
  trigger.setAttribute?.('aria-haspopup', 'dialog');
  let destroyed = false;
  return Object.freeze({
    connected: panel.connected,
    surface,
    trigger,
    panel,
    open: panel.open,
    destroy() {
      if (destroyed) return false;
      destroyed = true;
      trigger.removeEventListener?.('click', click, true);
      panel.destroy();
      return true;
    },
  });
}
