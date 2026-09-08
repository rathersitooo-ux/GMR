from pathlib import Path
import re
import subprocess

NAV = Path('browser/screen-navigation-core.mjs')
TEST = Path('tests/screen-navigation-core.test.mjs')
BUILD_TEST = Path('deploy/cloudflare/tests/build.test.mjs')

NOTICE_ID = 'gachaPreviewAuthorityNotice'
NOTICE_TEXT = '※ 現在は演出プレビューです。表示されたカードは所持・保存には反映されません。'

nav = NAV.read_text(encoding='utf-8')
if 'export function ensureGachaPreviewDisclosure' not in nav:
    marker = "const HOME_VISUAL_LAYER_SELECTOR = '.codexHomeVisualLayer';\n"
    assert nav.count(marker) == 1, f'expected one helper insertion marker, got {nav.count(marker)}'
    helper = """

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
"""
    nav = nav.replace(marker, marker + helper)

swap_marker = """        const applied = applyScreen(decision.to, Object.freeze({from: decision.from, to: decision.to, reason, revision: context.revision}));
        if (applied && typeof applied.then === 'function') throw new Error('applyScreen must be synchronous');
"""
if "decision.to === 'gacha'" not in nav:
    assert nav.count(swap_marker) == 1, f'expected one applySwap marker, got {nav.count(swap_marker)}'
    nav = nav.replace(swap_marker, swap_marker + "        if (decision.to === 'gacha') ensureGachaPreviewDisclosure(globalThis.document);\n")

NAV.write_text(nav, encoding='utf-8')

focused_marker = "test('successful Gacha navigation adds one truthful preview-only notice and never stacks it'"
test_text = TEST.read_text(encoding='utf-8')
if focused_marker not in test_text:
    test_text += r'''

test('successful Gacha navigation adds one truthful preview-only notice and never stacks it', async () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const byId = new Map();
  const controls = {
    children: [],
    insertBefore(node, before) {
      const index = this.children.indexOf(before);
      this.children.splice(index < 0 ? this.children.length : index, 0, node);
      node.parentNode = this;
      byId.set(node.id, node);
    }
  };
  const openButton = {id: 'openPack', parentNode: controls};
  controls.children.push(openButton);
  const gachaScreen = {
    id: 'gachaScreen', children: [],
    prepend(node) { this.children.unshift(node); byId.set(node.id, node); },
    appendChild(node) { this.children.push(node); byId.set(node.id, node); }
  };
  byId.set('openPack', openButton);
  byId.set('gachaScreen', gachaScreen);
  const fakeDocument = {
    getElementById(id) { return byId.get(id) || null; },
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(), style: {}, attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; }
      };
    }
  };
  Object.defineProperty(globalThis, 'document', {value: fakeDocument, configurable: true});

  let currentScreen = 'shop';
  const presentationDriver = {
    async runPhase() {},
    finishRevision() {},
    getState() { return Object.freeze({activeRevisions: Object.freeze([]), events: Object.freeze([])}); }
  };
  const runtime = createScreenTransitionRuntimeAdapter({
    getCurrentScreen: () => currentScreen,
    applyScreen: (next) => { currentScreen = next; },
    presentationDriver
  });

  try {
    const first = await runtime.navigate('gacha');
    assert.equal(first.status, 'completed');
    assert.equal(currentScreen, 'gacha');
    const note = byId.get('gachaPreviewAuthorityNotice');
    assert.ok(note);
    assert.equal(note.textContent, '※ 現在は演出プレビューです。表示されたカードは所持・保存には反映されません。');
    assert.equal(note.attributes.role, 'note');
    assert.equal(note.attributes['data-gacha-authority'], 'preview-only');
    assert.deepEqual(controls.children, [note, openButton]);

    currentScreen = 'shop';
    const second = await runtime.navigate('gacha');
    assert.equal(second.status, 'completed');
    assert.equal(controls.children.filter((node) => node.id === 'gachaPreviewAuthorityNotice').length, 1);
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  }
});

test('Gacha preview disclosure fails soft when the Gacha surface is absent', async () => {
  const {ensureGachaPreviewDisclosure} = await import('../browser/screen-navigation-core.mjs');
  assert.equal(ensureGachaPreviewDisclosure(undefined), null);
  assert.equal(ensureGachaPreviewDisclosure({}), null);
  assert.equal(ensureGachaPreviewDisclosure({getElementById: () => null, createElement: () => ({})}), null);
});
'''
    TEST.write_text(test_text, encoding='utf-8')

new_nav_blob = subprocess.check_output(['git', 'hash-object', str(NAV)], text=True).strip()
build_text = BUILD_TEST.read_text(encoding='utf-8')
pattern = re.compile(r"(\{ file: 'screen-navigation-core\.mjs'.*?currentBlob: ')[0-9a-f]{40}(' \},)")
matches = pattern.findall(build_text)
assert len(matches) == 1, f'expected one screen-navigation dependency pin, got {len(matches)}'
build_text, count = pattern.subn(r'\g<1>' + new_nav_blob + r'\2', build_text, count=1)
assert count == 1
BUILD_TEST.write_text(build_text, encoding='utf-8')

print(f'GACHA_PREVIEW_R4_PATCHED nav_blob={new_nav_blob}')
