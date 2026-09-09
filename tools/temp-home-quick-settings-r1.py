from pathlib import Path
import subprocess

TARGET = Path('browser/home-shell-presentation-core.mjs')
TEST = Path('tests/home-quick-settings-live.focused.test.mjs')
EXPECTED_BLOB = '5639d47a9bcb0aceef1e27ca5502d30e5b91a994'

actual_blob = subprocess.check_output(['git', 'hash-object', str(TARGET)], text=True).strip()
if actual_blob != EXPECTED_BLOB:
    raise SystemExit(f'home-shell blob drift: {actual_blob}')

source = TARGET.read_text(encoding='utf-8')
if 'HOME QUICK SETTINGS START' in source:
    raise SystemExit('quick settings patch already present')

anchor = 'export function classifyHomeViewport(input = {}) {'
if source.count(anchor) != 1:
    raise SystemExit('classifyHomeViewport anchor count mismatch')

quick = r'''// HOME QUICK SETTINGS START
const HOME_QUICK_SETTINGS_DIALOG_ID = 'gameroadHomeQuickSettingsDialog';
const HOME_QUICK_SETTINGS_STYLE_ID = 'gameroad-home-quick-settings-style-r1';
const HOME_QUICK_SETTINGS_BUTTON_SELECTOR = 'section[data-screen="home"] .codexHomeUtilities .homeUtilityBtn[data-go="settings"]';
const HOME_DETAILED_SETTINGS_SCREEN_SELECTOR = 'section[data-screen="settings"], #settings';
const HOME_QUICK_SETTINGS_CONTROL_SELECTOR = 'input,select,button[role="switch"],button[aria-pressed],[role="switch"]';
const HOME_QUICK_SETTINGS_FIELDS = Object.freeze([
  Object.freeze({
    key: 'masterVolume',
    label: '全体音量',
    labels: Object.freeze(['全体音量', 'マスター音量']),
    selectors: Object.freeze(['#masterVolume', '#volumeMaster', 'input[name="masterVolume"]', 'input[name="volume"]', '[data-setting="masterVolume"] input', '[data-setting="volume"] input']),
  }),
  Object.freeze({
    key: 'bgm',
    label: 'BGM',
    labels: Object.freeze(['BGM']),
    selectors: Object.freeze(['#bgmVolume', '#volumeBgm', 'input[name="bgmVolume"]', 'input[name="bgm"]', '[data-setting="bgm"] input']),
  }),
  Object.freeze({
    key: 'sfx',
    label: '効果音',
    labels: Object.freeze(['効果音', 'SE']),
    selectors: Object.freeze(['#sfxVolume', '#seVolume', '#volumeSfx', 'input[name="sfxVolume"]', 'input[name="seVolume"]', '[data-setting="sfx"] input', '[data-setting="se"] input']),
  }),
  Object.freeze({
    key: 'voice',
    label: 'Voice',
    labels: Object.freeze(['Voice', 'ボイス', '音声']),
    selectors: Object.freeze(['#voiceVolume', '#volumeVoice', '#voiceEnabled', 'input[name="voiceVolume"]', 'input[name="voice"]', '[data-setting="voice"] input']),
  }),
  Object.freeze({
    key: 'reducedMotion',
    label: '動き軽減',
    labels: Object.freeze(['動き軽減', 'モーション軽減', 'アニメーション軽減']),
    selectors: Object.freeze(['#reducedMotion', 'input[name="reducedMotion"]', '[data-setting="reducedMotion"] input', '[data-setting="reduceMotion"] input']),
  }),
  Object.freeze({
    key: 'lowPerf',
    label: '軽量表示',
    labels: Object.freeze(['LowPerf', '軽量表示', '低負荷', '省負荷']),
    selectors: Object.freeze(['#lowPerf', '#lowPerformance', 'input[name="lowPerf"]', 'input[name="lowPerformance"]', '[data-setting="lowPerf"] input']),
  }),
]);

const homeQuickSettingsRuntime = {
  trigger: null,
  intercept: null,
  dialog: null,
  bypassNext: false,
};

function normalizedSettingText(value) {
  return String(value || '').replace(/[\s　:：・]/g, '').toLowerCase();
}

function quickSettingControlKind(control) {
  if (!control) return null;
  const tag = String(control.tagName || '').toLowerCase();
  const type = String(control.type || '').toLowerCase();
  if (tag === 'input' && type === 'checkbox') return 'toggle';
  if (tag === 'input' && type === 'range') return 'range';
  if (tag === 'input' && type === 'number') return 'number';
  if (tag === 'select') return 'select';
  const role = String(control.getAttribute?.('role') || '').toLowerCase();
  if (role === 'switch' || control.hasAttribute?.('aria-pressed') || control.hasAttribute?.('aria-checked')) return 'toggle';
  return null;
}

function readCanonicalQuickSettingValue(control) {
  const kind = quickSettingControlKind(control);
  if (kind === 'toggle') {
    const tag = String(control.tagName || '').toLowerCase();
    const type = String(control.type || '').toLowerCase();
    if (tag === 'input' && type === 'checkbox') return Boolean(control.checked);
    const ariaChecked = control.getAttribute?.('aria-checked');
    if (ariaChecked === 'true' || ariaChecked === 'false') return ariaChecked === 'true';
    const ariaPressed = control.getAttribute?.('aria-pressed');
    if (ariaPressed === 'true' || ariaPressed === 'false') return ariaPressed === 'true';
    return null;
  }
  if (kind === 'range' || kind === 'number' || kind === 'select') return String(control.value ?? '');
  return null;
}

function dispatchCanonicalSettingChange(control, value) {
  const kind = quickSettingControlKind(control);
  if (!kind) return false;
  if (kind === 'toggle') {
    const tag = String(control.tagName || '').toLowerCase();
    const type = String(control.type || '').toLowerCase();
    if (tag === 'input' && type === 'checkbox') {
      control.checked = Boolean(value);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    const current = readCanonicalQuickSettingValue(control);
    if (current === null) return false;
    if (Boolean(current) !== Boolean(value) && typeof control.click === 'function') control.click();
    return true;
  }
  control.value = String(value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function findControlFromLabel(settingsRoot, definition) {
  const rows = settingsRoot.querySelectorAll?.('label,.settingRow,.settingsRow,.settingsItem,[data-setting-row],[data-setting]') || [];
  for (const row of rows) {
    const text = normalizedSettingText(row.textContent);
    if (!definition.labels.some((label) => text.includes(normalizedSettingText(label)))) continue;
    if (String(row.tagName || '').toLowerCase() === 'label' && row.htmlFor && typeof document !== 'undefined') {
      const linked = document.getElementById(row.htmlFor);
      if (linked && settingsRoot.contains?.(linked) && quickSettingControlKind(linked)) return linked;
    }
    const nested = row.matches?.(HOME_QUICK_SETTINGS_CONTROL_SELECTOR)
      ? row
      : row.querySelector?.(HOME_QUICK_SETTINGS_CONTROL_SELECTOR);
    if (nested && quickSettingControlKind(nested)) return nested;
  }
  return null;
}

function findCanonicalQuickSettingControl(settingsRoot, definition) {
  if (!settingsRoot || !definition) return null;
  for (const selector of definition.selectors) {
    const control = settingsRoot.querySelector?.(selector);
    if (control && quickSettingControlKind(control)) return control;
  }
  return findControlFromLabel(settingsRoot, definition);
}

function ensureHomeQuickSettingsStyle() {
  if (typeof document === 'undefined' || document.getElementById(HOME_QUICK_SETTINGS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HOME_QUICK_SETTINGS_STYLE_ID;
  style.textContent = `
#${HOME_QUICK_SETTINGS_DIALOG_ID}[hidden]{display:none!important}
#${HOME_QUICK_SETTINGS_DIALOG_ID}{position:fixed;inset:0;z-index:100001;display:flex;align-items:flex-end;justify-content:center;padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));background:rgba(6,9,18,.52);backdrop-filter:blur(7px)}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsPanel{width:min(390px,100%);max-height:min(82vh,620px);overflow:auto;overscroll-behavior:contain;padding:16px;border-radius:22px;background:color-mix(in srgb,#111827 95%,transparent);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:0 20px 64px rgba(0,0,0,.48)}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsHead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} h2{margin:0;font-size:20px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsClose,#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsDetail{min-height:${TOUCH_TARGET_MIN_PX}px;border-radius:12px;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:inherit;font:inherit;font-weight:800;touch-action:manipulation;cursor:pointer}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsClose{min-width:${TOUCH_TARGET_MIN_PX}px;padding:0 12px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsFields{display:grid;gap:6px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsRow{min-height:52px;display:grid;grid-template-columns:minmax(7em,1fr) minmax(120px,1.35fr);align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,.1)}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsRow>span:first-child{font-weight:760}
#${HOME_QUICK_SETTINGS_DIALOG_ID} input,#${HOME_QUICK_SETTINGS_DIALOG_ID} select{min-height:${TOUCH_TARGET_MIN_PX}px;width:100%;accent-color:currentColor}
#${HOME_QUICK_SETTINGS_DIALOG_ID} input[type="checkbox"]{justify-self:end;width:${TOUCH_TARGET_MIN_PX}px;height:${TOUCH_TARGET_MIN_PX}px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsUnavailable{justify-self:end;opacity:.68;font-size:.9em}
#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsDetail{width:100%;margin-top:14px;padding:10px 14px}
#${HOME_QUICK_SETTINGS_DIALOG_ID} button:focus-visible,#${HOME_QUICK_SETTINGS_DIALOG_ID} input:focus-visible,#${HOME_QUICK_SETTINGS_DIALOG_ID} select:focus-visible{outline:3px solid currentColor;outline-offset:2px}
@media (min-width:700px) and (min-height:520px){#${HOME_QUICK_SETTINGS_DIALOG_ID}{align-items:center}}
@media (max-height:430px) and (orientation:landscape){#${HOME_QUICK_SETTINGS_DIALOG_ID}{align-items:stretch;justify-content:flex-end;padding:8px max(10px,env(safe-area-inset-right)) 8px max(10px,env(safe-area-inset-left))}#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsPanel{width:min(430px,62vw);max-height:none;border-radius:16px;padding:12px}#${HOME_QUICK_SETTINGS_DIALOG_ID} .gameroadHomeQuickSettingsRow{min-height:46px}}
`;
  document.head?.append(style);
}

function createQuickSettingProxy(definition, canonical) {
  const kind = quickSettingControlKind(canonical);
  if (!kind) return null;
  if (kind === 'toggle') {
    const proxy = document.createElement('input');
    proxy.type = 'checkbox';
    proxy.setAttribute('aria-label', definition.label);
    proxy.checked = Boolean(readCanonicalQuickSettingValue(canonical));
    proxy.addEventListener('change', () => dispatchCanonicalSettingChange(canonical, proxy.checked));
    return proxy;
  }
  if (kind === 'select') {
    const proxy = document.createElement('select');
    proxy.setAttribute('aria-label', definition.label);
    for (const option of canonical.options || []) {
      const clone = document.createElement('option');
      clone.value = option.value;
      clone.textContent = option.textContent;
      proxy.append(clone);
    }
    proxy.value = String(readCanonicalQuickSettingValue(canonical) ?? '');
    proxy.addEventListener('change', () => dispatchCanonicalSettingChange(canonical, proxy.value));
    return proxy;
  }
  const proxy = document.createElement('input');
  proxy.type = kind === 'range' ? 'range' : 'number';
  proxy.setAttribute('aria-label', definition.label);
  if (canonical.min !== undefined && canonical.min !== '') proxy.min = canonical.min;
  if (canonical.max !== undefined && canonical.max !== '') proxy.max = canonical.max;
  if (canonical.step !== undefined && canonical.step !== '') proxy.step = canonical.step;
  proxy.value = String(readCanonicalQuickSettingValue(canonical) ?? '');
  proxy.addEventListener('input', () => dispatchCanonicalSettingChange(canonical, proxy.value));
  proxy.addEventListener('change', () => dispatchCanonicalSettingChange(canonical, proxy.value));
  return proxy;
}

function syncHomeQuickSettings(dialog) {
  const fields = dialog?.querySelector?.('[data-home-quick-settings-fields="true"]');
  if (!fields) return;
  fields.replaceChildren();
  const settingsRoot = document.querySelector(HOME_DETAILED_SETTINGS_SCREEN_SELECTOR);
  for (const definition of HOME_QUICK_SETTINGS_FIELDS) {
    const row = document.createElement('label');
    row.className = 'gameroadHomeQuickSettingsRow';
    const name = document.createElement('span');
    name.textContent = definition.label;
    row.append(name);
    const canonical = settingsRoot ? findCanonicalQuickSettingControl(settingsRoot, definition) : null;
    const proxy = canonical ? createQuickSettingProxy(definition, canonical) : null;
    if (proxy) {
      proxy.dataset.quickSettingKey = definition.key;
      row.append(proxy);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'gameroadHomeQuickSettingsUnavailable';
      unavailable.textContent = '未対応';
      unavailable.setAttribute('aria-label', `${definition.label}は未対応です`);
      row.append(unavailable);
    }
    fields.append(row);
  }
}

function closeHomeQuickSettings({ restoreFocus = true } = {}) {
  const dialog = homeQuickSettingsRuntime.dialog;
  if (!dialog) return;
  dialog.hidden = true;
  if (restoreFocus) homeQuickSettingsRuntime.trigger?.focus?.();
}

function ensureHomeQuickSettingsDialog() {
  if (typeof document === 'undefined') return null;
  const existing = document.getElementById(HOME_QUICK_SETTINGS_DIALOG_ID);
  if (existing) {
    homeQuickSettingsRuntime.dialog = existing;
    return existing;
  }
  ensureHomeQuickSettingsStyle();
  const root = document.createElement('div');
  root.id = HOME_QUICK_SETTINGS_DIALOG_ID;
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${HOME_QUICK_SETTINGS_DIALOG_ID}Title`);
  root.innerHTML = `<div class="gameroadHomeQuickSettingsPanel"><div class="gameroadHomeQuickSettingsHead"><h2 id="${HOME_QUICK_SETTINGS_DIALOG_ID}Title">簡易設定</h2><button type="button" class="gameroadHomeQuickSettingsClose" aria-label="簡易設定を閉じる">閉じる</button></div><div class="gameroadHomeQuickSettingsFields" data-home-quick-settings-fields="true"></div><button type="button" class="gameroadHomeQuickSettingsDetail">詳細設定</button></div>`;
  root.querySelector('.gameroadHomeQuickSettingsClose')?.addEventListener('click', () => closeHomeQuickSettings());
  root.querySelector('.gameroadHomeQuickSettingsDetail')?.addEventListener('click', () => {
    const trigger = homeQuickSettingsRuntime.trigger;
    closeHomeQuickSettings({ restoreFocus: false });
    if (!trigger || typeof trigger.click !== 'function') return;
    homeQuickSettingsRuntime.bypassNext = true;
    trigger.click();
    queueMicrotask(() => { homeQuickSettingsRuntime.bypassNext = false; });
  });
  root.addEventListener('click', (event) => {
    if (event.target === root) closeHomeQuickSettings();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHomeQuickSettings();
    }
  });
  document.body?.append(root);
  homeQuickSettingsRuntime.dialog = root;
  return root;
}

function openHomeQuickSettings() {
  const dialog = ensureHomeQuickSettingsDialog();
  if (!dialog) return false;
  syncHomeQuickSettings(dialog);
  dialog.hidden = false;
  dialog.querySelector('.gameroadHomeQuickSettingsClose')?.focus?.();
  return true;
}

export function ensureHomeQuickSettingsConsumer() {
  if (typeof document === 'undefined') return false;
  const trigger = document.querySelector(HOME_QUICK_SETTINGS_BUTTON_SELECTOR);
  if (!trigger) return false;
  if (homeQuickSettingsRuntime.trigger === trigger && homeQuickSettingsRuntime.intercept) return true;
  if (homeQuickSettingsRuntime.trigger && homeQuickSettingsRuntime.intercept) {
    homeQuickSettingsRuntime.trigger.removeEventListener?.('click', homeQuickSettingsRuntime.intercept, true);
  }
  const intercept = (event) => {
    if (homeQuickSettingsRuntime.bypassNext) {
      homeQuickSettingsRuntime.bypassNext = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation?.();
    openHomeQuickSettings();
  };
  trigger.addEventListener('click', intercept, true);
  homeQuickSettingsRuntime.trigger = trigger;
  homeQuickSettingsRuntime.intercept = intercept;
  return true;
}

export const HOME_QUICK_SETTINGS_REQUIRED_LABELS = Object.freeze(HOME_QUICK_SETTINGS_FIELDS.map((field) => field.label));
export const HOME_QUICK_SETTINGS_TRIGGER_SELECTOR = HOME_QUICK_SETTINGS_BUTTON_SELECTOR;
// HOME QUICK SETTINGS END

'''
source = source.replace(anchor, quick + anchor)

old = '  ensureSharedShellPresentation();\n  ensureHomeUpdateDetailsConsumer();\n'
new = '  ensureSharedShellPresentation();\n  ensureHomeUpdateDetailsConsumer();\n  ensureHomeQuickSettingsConsumer();\n'
if source.count(old) != 1:
    raise SystemExit('createHomeShellState hook anchor mismatch')
source = source.replace(old, new, 1)
TARGET.write_text(source, encoding='utf-8')

TEST.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../browser/home-shell-presentation-core.mjs', import.meta.url), 'utf8');
const start = source.indexOf('// HOME QUICK SETTINGS START');
const end = source.indexOf('// HOME QUICK SETTINGS END');
const quick = source.slice(start, end);

test('Home Settings entry is intercepted by the existing live Home shell', () => {
  assert.ok(start >= 0 && end > start);
  assert.match(quick, /section\[data-screen=\\"home\\"\] \.codexHomeUtilities \.homeUtilityBtn\[data-go=\\"settings\\"\]/);
  assert.match(source, /ensureHomeUpdateDetailsConsumer\(\);\s*ensureHomeQuickSettingsConsumer\(\);/);
  assert.match(quick, /addEventListener\('click', intercept, true\)/);
});

test('all user-required quick settings stay visible and missing canonical controls fail visibly', () => {
  for (const label of ['全体音量', 'BGM', '効果音', 'Voice', '動き軽減', '軽量表示']) {
    assert.ok(quick.includes(`label: '${label}'`), label);
  }
  assert.match(quick, /unavailable\.textContent = '未対応'/);
});

test('quick settings do not create a second settings store and write through canonical controls', () => {
  assert.doesNotMatch(quick, /localStorage|sessionStorage|indexedDB|fetch\(/);
  assert.match(quick, /dispatchCanonicalSettingChange\(canonical/);
  assert.match(quick, /dispatchEvent\(new Event\('input'/);
  assert.match(quick, /dispatchEvent\(new Event\('change'/);
});

test('Detailed Settings reuses the original Settings navigation and close paths are nonblocking', () => {
  assert.match(quick, /homeQuickSettingsRuntime\.bypassNext = true/);
  assert.match(quick, /trigger\.click\(\)/);
  assert.match(quick, /event\.target === root/);
  assert.match(quick, /event\.key === 'Escape'/);
  assert.match(quick, /restoreFocus/);
});

test('quick-settings slice does not define gameplay or persistence authority', () => {
  assert.doesNotMatch(quick, /gameState|matchState|saveData|economy|network|WebSocket/);
  assert.doesNotMatch(quick, /data-go=\\"quick|data-screen=\\"quick/);
});
''', encoding='utf-8')

subprocess.run(['node', '--check', str(TARGET)], check=True)
subprocess.run(['node', '--test', str(TEST), 'tests/home-boot-presentation.test.mjs', 'tests/home-boot-runtime-base-r3.test.mjs'], check=True)
print('HOME_QUICK_SETTINGS_PATCH_OK')
