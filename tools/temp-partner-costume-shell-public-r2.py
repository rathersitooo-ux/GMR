from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 anchor, found {count}: {old[:80]!r}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')

runtime = ROOT / 'browser/partner-shell-runtime-mount.mjs'
imports = """import {
  listSaasunaSystemVoices,
  previewSaasunaVoice,
} from './partner-saasuna-voice-runtime.mjs';
"""
replace_once(runtime, imports, imports + """import { createPartnerCostumeBrowserSessionRuntime } from './partner-costume-browser-session-runtime.mjs';
import { mountPartnerCostumeScreen } from './partner-costume-screen-runtime-mount.mjs';
""")

marker = "\nexport function buildPartnerShellRuntimeModel(input = {}, { canDispatch } = {}) {\n"
helper = r'''
function normalizePartnerCostumeServices(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('costume must be an object');
  if (!value.catalog || typeof value.catalog !== 'object' || Array.isArray(value.catalog)) throw new TypeError('costume.catalog must be an object');
  for (const name of ['loadAuthoritativeSnapshot', 'saveAuthoritativeSelection', 'createSaveRequestId']) {
    if (typeof value[name] !== 'function') throw new TypeError(`costume.${name} must be a function`);
  }
  if (value.getRecommendedSet !== undefined && typeof value.getRecommendedSet !== 'function') throw new TypeError('costume.getRecommendedSet must be a function');
  if (value.renderPreview !== undefined && typeof value.renderPreview !== 'function') throw new TypeError('costume.renderPreview must be a function');
  return Object.freeze({
    catalog: value.catalog,
    loadAuthoritativeSnapshot: value.loadAuthoritativeSnapshot,
    saveAuthoritativeSelection: value.saveAuthoritativeSelection,
    createSaveRequestId: value.createSaveRequestId,
    getRecommendedSet: value.getRecommendedSet ?? (() => null),
    renderPreview: value.renderPreview ?? (() => false),
  });
}
'''
replace_once(runtime, marker, helper + marker)

replace_once(runtime,
"""  listVoices = listSaasunaSystemVoices,
  onFeedbackResult,
} = {}) {""",
"""  listVoices = listSaasunaSystemVoices,
  onFeedbackResult,
  costume = null,
} = {}) {""")

replace_once(runtime,
"""  if (typeof listVoices !== 'function') throw new TypeError('listVoices must be a function');

  let destroyed = false;
  let lastModel = null;
""",
"""  if (typeof listVoices !== 'function') throw new TypeError('listVoices must be a function');
  const costumeServices = normalizePartnerCostumeServices(costume);

  let destroyed = false;
  let lastModel = null;
  let activeCostumeScreen = null;
  let costumeRenderVersion = 0;
""")

replace_once(runtime,
"""  const services = Object.freeze({ submitFeedback, previewVoice, listVoices, onFeedbackResult });

  function render() {""",
"""  const services = Object.freeze({ submitFeedback, previewVoice, listVoices, onFeedbackResult });
  const runtimeCanDispatch = (action, context) => {
    if (action === 'OPEN_COSTUME') {
      if (!costumeServices) return false;
      const backContext = Object.freeze({ view: 'costume', activePartnerId: context?.activePartnerId ?? null });
      if (!dispatchAllowed(canDispatch, 'BACK_HUB', backContext)) return false;
    }
    return dispatchAllowed(canDispatch, action, context);
  };

  function clearCostumeScreen() {
    costumeRenderVersion += 1;
    const current = activeCostumeScreen;
    activeCostumeScreen = null;
    try { current?.destroy?.(); } catch {}
  }

  async function mountCostumeView(host, model, doc, version) {
    if (!costumeServices || destroyed || version !== costumeRenderVersion) return false;
    let latestSnapshot = null;
    const sessionRuntime = createPartnerCostumeBrowserSessionRuntime({
      catalog: costumeServices.catalog,
      loadAuthoritativeSnapshot: async () => {
        const snapshot = await costumeServices.loadAuthoritativeSnapshot();
        latestSnapshot = snapshot;
        return snapshot;
      },
      saveAuthoritativeSelection: async (request) => {
        const snapshot = await costumeServices.saveAuthoritativeSelection(request);
        latestSnapshot = snapshot;
        return snapshot;
      },
    });
    const backSpec = model.navigationActions.find((item) => item.action === 'BACK_HUB') ?? null;
    const screen = mountPartnerCostumeScreen({
      root: host,
      document: doc,
      sessionRuntime,
      catalog: costumeServices.catalog,
      getOwnedItemIds: (partnerId) => {
        const ids = latestSnapshot?.partners?.[partnerId]?.ownedItemIds;
        return Array.isArray(ids) ? [...ids] : [];
      },
      getRecommendedSet: costumeServices.getRecommendedSet,
      renderPreview: costumeServices.renderPreview,
      createSaveRequestId: costumeServices.createSaveRequestId,
      onClose: () => { if (backSpec) emit(backSpec); },
    });
    activeCostumeScreen = screen;
    try {
      const view = await screen.start();
      if (destroyed || version !== costumeRenderVersion || activeCostumeScreen !== screen) return false;
      if (view?.partnerId !== model.activePartnerId) throw new Error('COSTUME_ACTIVE_PARTNER_MISMATCH');
      return true;
    } catch {
      if (activeCostumeScreen === screen) activeCostumeScreen = null;
      try { screen.destroy(); } catch {}
      if (destroyed || version !== costumeRenderVersion) return false;
      host.replaceChildren(element(doc, 'p', 'partner-costume-unavailable', '着せ替えを開けませんでした'));
      if (backSpec) host.append(actionButton(doc, backSpec, emit));
      return false;
    }
  }

  function render() {""")

replace_once(runtime,
"""      model = buildPartnerShellRuntimeModel(getInput(), { canDispatch });""",
"""      model = buildPartnerShellRuntimeModel(getInput(), { canDispatch: runtimeCanDispatch });""")

replace_once(runtime,
"""    const doc = root.ownerDocument;
    const section = element(doc, 'section', 'partner-shell-runtime');
    section.dataset.partnerShellView = model.view;
    section.dataset.partnerShellSurfaceKind = model.surfaceKind;
    section.append(element(doc, 'h2', 'partner-shell-title', model.title));
    renderBody(doc, section, model, emit, services);
    root.replaceChildren(section);
    lastModel = model;
    return Object.freeze({ ok: true, reason: null, model });
""",
"""    clearCostumeScreen();
    const doc = root.ownerDocument;
    const section = element(doc, 'section', 'partner-shell-runtime');
    section.dataset.partnerShellView = model.view;
    section.dataset.partnerShellSurfaceKind = model.surfaceKind;
    section.append(element(doc, 'h2', 'partner-shell-title', model.title));
    if (model.view === 'costume') {
      if (model.activePartner) {
        const active = element(doc, 'p', 'partner-shell-active');
        active.dataset.partnerId = model.activePartner.partnerId;
        active.textContent = model.activePartner.displayName ?? model.activePartner.partnerId;
        section.append(active);
      }
      const host = element(doc, 'div', 'partner-costume-shell-host');
      host.dataset.partnerCostumeShellHost = 'true';
      section.append(host);
      root.replaceChildren(section);
      lastModel = model;
      const version = costumeRenderVersion;
      void mountCostumeView(host, model, doc, version);
      return Object.freeze({ ok: true, reason: null, model });
    }
    renderBody(doc, section, model, emit, services);
    root.replaceChildren(section);
    lastModel = model;
    return Object.freeze({ ok: true, reason: null, model });
""")

replace_once(runtime,
"""    destroyed = true;
    lastModel = null;
    root.replaceChildren();
""",
"""    destroyed = true;
    clearCostumeScreen();
    lastModel = null;
    root.replaceChildren();
""")

# Strengthen the existing shell test harness, then append focused live-costume tests.
test_path = ROOT / 'tests/partner-shell-runtime-mount.test.mjs'
replace_once(test_path,
"""    this.type = '';
    this.listeners = new Map();
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { this.listeners.get('click')?.(); }
""",
"""    this.type = '';
    this.listeners = new Map();
    this.parentNode = null;
    this.hidden = false;
    this.disabled = false;
    this.open = false;
  }
  append(...children) { for (const child of children) { child.parentNode = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  click() { return this.listeners.get('click')?.({ target: this }); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
""")

with test_path.open('a', encoding='utf-8') as handle:
    handle.write(r'''

test('runtime hides costume entry when no canonical costume services are connected', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'hub' }),
    canDispatch: () => true,
  });
  assert.equal(runtime.render().ok, true);
  const actions = allNodes(root).filter((node) => node.dataset?.partnerShellAction).map((node) => node.dataset.partnerShellAction);
  assert.equal(actions.includes('OPEN_COSTUME'), false);
});

test('costume view composes current session and three-category screen without changing active partner', async () => {
  const root = makeRoot();
  const events = [];
  const saves = [];
  const catalog = {
    shoe_a: { id: 'shoe_a', category: 'shoes', label: '靴A', layers: [] },
    coord_a: { id: 'coord_a', category: 'coord', label: 'コーデA', layers: [] },
    acc_a: { id: 'acc_a', category: 'accessory', label: 'アクセA', layers: [] },
  };
  const snapshot = (selection = { shoes: null, coord: null, accessory: null }) => ({
    selectedPartnerId: 'partner.saasuna',
    partners: {
      'partner.saasuna': {
        ownedItemIds: ['shoe_a', 'coord_a', 'acc_a'],
        savedSelection: selection,
      },
    },
  });
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'costume' }),
    canDispatch: (action) => action === 'BACK_HUB' || action === 'OPEN_COSTUME',
    onAction: (event) => events.push(event),
    costume: {
      catalog,
      loadAuthoritativeSnapshot: async () => snapshot(),
      saveAuthoritativeSelection: async (request) => {
        saves.push(request);
        return snapshot(request.selection);
      },
      createSaveRequestId: () => 'save-shell-1',
    },
  });
  const rendered = runtime.render();
  assert.equal(rendered.ok, true);
  assert.equal(rendered.model.activePartnerId, 'partner.saasuna');
  await new Promise((resolve) => setImmediate(resolve));
  const categories = allNodes(root).filter((node) => node.dataset?.costumeCategory).map((node) => node.dataset.costumeCategory);
  assert.deepEqual(categories, ['shoes', 'coord', 'accessory']);
  assert.ok(allNodes(root).some((node) => node.textContent === '基本の姿を表示中'));
  const coord = allNodes(root).find((node) => node.dataset?.costumeItemId === 'coord_a');
  coord.click();
  const save = allNodes(root).find((node) => node.textContent === '保存');
  await save.click();
  assert.equal(saves.length, 1);
  assert.equal(saves[0].partnerId, 'partner.saasuna');
  assert.equal(saves[0].selection.coord, 'coord_a');
  assert.equal(saves[0].requestId, 'save-shell-1');
  const back = allNodes(root).find((node) => node.textContent === '戻る');
  back.click();
  assert.equal(events.at(-1).action, 'BACK_HUB');
  assert.equal(events.at(-1).sourceView, 'costume');
});

test('costume provider selecting another partner fails closed without rendering fake inventory', async () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'costume' }),
    canDispatch: () => true,
    costume: {
      catalog: {},
      loadAuthoritativeSnapshot: async () => ({ selectedPartnerId: 'partner.other', partners: { 'partner.other': { ownedItemIds: [], savedSelection: {} } } }),
      saveAuthoritativeSelection: async () => { throw new Error('must not save'); },
      createSaveRequestId: () => 'unused',
    },
  });
  assert.equal(runtime.render().ok, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(allNodes(root).some((node) => node.textContent === '着せ替えを開けませんでした'));
  assert.equal(allNodes(root).some((node) => node.dataset?.costumeItemId), false);
});
''')

# Package the complete import closure used by the Partner costume shell.
build = ROOT / 'deploy/cloudflare/scripts/build.mjs'
anchor = "  { source: 'browser/partner-tea-runtime-mount.mjs', output: 'partner-tea-runtime-mount.mjs', artifact: 'partner_tea_runtime_mount', label: 'Partner Tea quick-choice runtime mount' },\n"
entries = """  { source: 'browser/partner-shell-presentation-core.mjs', output: 'partner-shell-presentation-core.mjs', artifact: 'partner_shell_presentation_core', label: 'Partner shell presentation core' },
  { source: 'browser/partner-dialogue-feedback-core.mjs', output: 'partner-dialogue-feedback-core.mjs', artifact: 'partner_dialogue_feedback_core', label: 'Partner dialogue feedback core' },
  { source: 'browser/partner-saasuna-voice-runtime.mjs', output: 'partner-saasuna-voice-runtime.mjs', artifact: 'partner_saasuna_voice_runtime', label: 'Partner Saasuna voice runtime' },
  { source: 'browser/partner-costume-core.mjs', output: 'partner-costume-core.mjs', artifact: 'partner_costume_core', label: 'Partner costume core' },
  { source: 'browser/partner-costume-browser-session-runtime.mjs', output: 'partner-costume-browser-session-runtime.mjs', artifact: 'partner_costume_browser_session_runtime', label: 'Partner costume browser session runtime' },
  { source: 'browser/partner-costume-screen-runtime-mount.mjs', output: 'partner-costume-screen-runtime-mount.mjs', artifact: 'partner_costume_screen_runtime_mount', label: 'Partner costume screen runtime mount' },
  { source: 'browser/partner-shell-runtime-mount.mjs', output: 'partner-shell-runtime-mount.mjs', artifact: 'partner_shell_runtime_mount', label: 'Partner shell runtime mount' },
"""
text = build.read_text(encoding='utf-8')
if "partner_costume_screen_runtime_mount" in text or "partner_shell_runtime_mount" in text:
    raise SystemExit('costume shell artifacts already present; refuse duplicate insertion')
if text.count(anchor) != 1:
    raise SystemExit(f'build anchor count={text.count(anchor)}')
build.write_text(text.replace(anchor, anchor + entries, 1), encoding='utf-8')

print('partner costume shell/public patch applied')
