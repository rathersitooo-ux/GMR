import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerShellRuntimeModel,
  mountPartnerShellRuntime,
} from '../browser/partner-shell-runtime-mount.mjs';

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.type = '';
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
}

class FakeDocument {
  createElement(tagName) { return new FakeElement(tagName, this); }
}

function allNodes(root) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return out;
}

const roster = [
  { partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: 'saasuna.current' },
  { partnerId: 'partner.other', displayName: 'Other' },
];

function makeRoot() {
  const doc = new FakeDocument();
  return new FakeElement('div', doc);
}

test('runtime model fail-closes hub actions that have no concrete dispatcher', () => {
  const model = buildPartnerShellRuntimeModel({ activePartnerId: 'partner.saasuna', roster });
  assert.equal(model.view, 'hub');
  assert.equal(model.activePartner.displayName, 'サースナー');
  assert.deepEqual(model.menuActions, []);
  assert.equal(model.deadButtonAllowed, false);
  assert.equal(model.readOnlyProjection, true);
  assert.equal(model.idleReadableLine?.partnerId, 'partner.saasuna');
  assert.equal(model.idleReadableLine?.sourceState, 'approved_current');
  assert.equal(model.idleReadableLine?.presentationOnly, true);
  assert.equal(model.idleReadableLine?.automaticGameMutationAllowed, false);
});

test('hub idle readable content stays silent for Partner without approved source', () => {
  const model = buildPartnerShellRuntimeModel({ activePartnerId: 'partner.other', roster });
  assert.equal(model.idleReadableLine, null);
});

test('runtime model exposes only explicitly connected hub actions', () => {
  const allowed = new Set(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  const model = buildPartnerShellRuntimeModel(
    { activePartnerId: 'partner.saasuna', roster },
    { canDispatch: (action) => allowed.has(action) },
  );
  assert.deepEqual(model.menuActions.map((item) => item.action), ['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION']);
  assert.deepEqual(model.menuActions.map((item) => item.label), ['人物詳細', '話す']);
  assert.equal(model.menuActions.some((item) => item.action === 'OPEN_TEA'), false);
});

test('list detail buttons carry partner identity but never change active partner', () => {
  const input = { activePartnerId: 'partner.saasuna', roster, view: 'list' };
  const before = structuredClone(input);
  const model = buildPartnerShellRuntimeModel(input, {
    canDispatch: (action, context) => action === 'OPEN_DETAIL' && context.partnerId === 'partner.other',
  });
  assert.deepEqual(input, before);
  assert.equal(model.roster[0].detailAction, null);
  assert.equal(model.roster[1].detailAction.partnerId, 'partner.other');
  assert.equal(model.activePartnerId, 'partner.saasuna');
});

test('list and detail render partner identity once instead of duplicating active-partner copy', () => {
  for (const view of ['list', 'detail']) {
    const root = makeRoot();
    const runtime = mountPartnerShellRuntime({
      root,
      getInput: () => ({
        activePartnerId: 'partner.saasuna',
        detailPartnerId: 'partner.saasuna',
        roster,
        view,
      }),
      canDispatch: () => true,
    });
    assert.equal(runtime.render().ok, true);
    const activeLabels = allNodes(root).filter((node) => node.className === 'partner-shell-active');
    assert.equal(activeLabels.length, 0);
    const identityLabels = allNodes(root).filter((node) => node.textContent === 'サースナー');
    assert.equal(identityLabels.length, 1);
  }
});

test('mount renders connected actions and dispatches intent without local navigation', () => {
  const root = makeRoot();
  const events = [];
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster, view: 'hub' }),
    canDispatch: (action) => action === 'OPEN_ACTIVE_DETAIL',
    onAction: (event) => events.push(event),
  });

  const result = runtime.render();
  assert.equal(result.ok, true);
  assert.equal(root.children[0].dataset.partnerShellView, 'hub');
  const idleLines = allNodes(root).filter((node) => node.className === 'partner-shell-idle-readable');
  assert.equal(idleLines.length, 1);
  assert.equal(idleLines[0].dataset.partnerId, 'partner.saasuna');
  assert.equal(idleLines[0].dataset.sourceState, 'approved_current');
  assert.equal(idleLines[0].dataset.presentationOnly, 'true');
  const buttons = allNodes(root).filter((node) => node.tagName === 'BUTTON');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].textContent, '人物詳細');
  buttons[0].click();
  assert.deepEqual(events, [{
    action: 'OPEN_ACTIVE_DETAIL',
    targetView: 'detail',
    partnerId: null,
    sourceView: 'hub',
  }]);
  assert.equal(runtime.getLastModel().view, 'hub');
});

test('invalid caller state clears the mount instead of auto-picking or inventing Partner state', () => {
  const root = makeRoot();
  root.append(root.ownerDocument.createElement('div'));
  const runtime = mountPartnerShellRuntime({ root, getInput: () => ({ roster }) });
  const result = runtime.render();
  assert.deepEqual(result, { ok: false, reason: 'INVALID_INPUT', model: null });
  assert.equal(root.children.length, 0);
});

test('relationship, reward and private save payloads never leak into runtime model', () => {
  const model = buildPartnerShellRuntimeModel({
    activePartnerId: 'partner.saasuna',
    roster,
    view: 'strategy',
    strategyId: 'strategy.current',
    relationship: { intimacy: 999 },
    reward: { coins: 999 },
    save: { write: true },
  }, { canDispatch: () => true });
  const serialized = JSON.stringify(model);
  assert.equal(serialized.includes('intimacy'), false);
  assert.equal(serialized.includes('coins'), false);
  assert.equal(serialized.includes('write'), false);
  assert.equal(model.strategyId, 'strategy.current');
});

test('destroy removes rendered shell and makes later renders inert', () => {
  const root = makeRoot();
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({ activePartnerId: 'partner.saasuna', roster }),
    canDispatch: () => true,
  });
  assert.equal(runtime.render().ok, true);
  assert.equal(runtime.destroy(), true);
  assert.equal(root.children.length, 0);
  assert.deepEqual(runtime.render(), { ok: false, reason: 'DESTROYED', model: null });
});


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

test('dialogue feedback rejection settles UI and allows retry without changing provider authority', async () => {
  const root = makeRoot();
  let calls = 0;
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({
      activePartnerId: 'partner.saasuna',
      roster,
      view: 'dialogue_feedback',
      postBattleLine: {
        sourceLineId: 'battle.line.1',
        text: '元のセリフ',
        sourceStateIdentity: 'battle.state.1',
        versions: { rules: 'rules.1', content: 'content.1', state: 'state.1' },
      },
    }),
    canDispatch: (action) => action === 'BACK_HUB',
    listVoices: () => [],
    submitFeedback: async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider unavailable');
      return { ok: true, disposition: 'stored' };
    },
  });

  assert.equal(runtime.render().ok, true);
  const editor = allNodes(root).find((node) => node.dataset?.partnerDialogueEditor === 'proposedText');
  const submit = allNodes(root).find((node) => node.dataset?.partnerDialogueAction === 'submit');
  const status = allNodes(root).find((node) => node.dataset?.partnerDialogueStatus === 'true');
  editor.value = '変更したセリフ';

  const first = submit.click();
  assert.equal(submit.disabled, true);
  await first;
  assert.equal(calls, 1);
  assert.equal(submit.disabled, false);
  assert.equal(status.textContent, '送信できませんでした');

  await submit.click();
  assert.equal(calls, 2);
  assert.equal(submit.disabled, false);
  assert.equal(status.textContent, '改善要望として蓄積しました');
});


test('voice preview settles completion and ignores cancelled stale runs', async () => {
  const root = makeRoot();
  const previews = [];
  const previewVoice = () => {
    let resolveDone;
    let settled = false;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const handle = {
      ok: true,
      done,
      cancelled: 0,
      finish(status) {
        if (settled) return;
        settled = true;
        resolveDone({ status, reason: status === 'error' ? 'test_error' : null });
      },
      cancel() {
        this.cancelled += 1;
        if (settled) return;
        settled = true;
        resolveDone({ status: 'cancelled', reason: 'test_cancelled' });
      },
    };
    previews.push(handle);
    return handle;
  };
  const runtime = mountPartnerShellRuntime({
    root,
    getInput: () => ({
      activePartnerId: 'partner.saasuna',
      roster,
      view: 'dialogue_feedback',
      postBattleLine: {
        sourceLineId: 'battle.voice.1',
        text: '試聴セリフ',
        sourceStateIdentity: 'battle.voice.state.1',
        versions: { rules: 'rules.1', content: 'content.1', state: 'state.1' },
      },
    }),
    canDispatch: (action) => action === 'BACK_HUB',
    listVoices: () => [],
    previewVoice,
  });

  assert.equal(runtime.render().ok, true);
  const preview = allNodes(root).find((node) => node.dataset?.partnerDialogueAction === 'preview');
  const status = allNodes(root).find((node) => node.dataset?.partnerDialogueStatus === 'true');

  preview.click();
  assert.equal(status.textContent, '試聴中');
  preview.click();
  assert.equal(previews[0].cancelled, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status.textContent, '試聴中');

  previews[1].finish('completed');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status.textContent, '試聴完了');

  preview.click();
  previews[2].finish('error');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(status.textContent, '音声試聴に失敗しました');

  preview.click();
  assert.equal(runtime.destroy(), true);
  assert.equal(previews[3].cancelled, 1);
});
