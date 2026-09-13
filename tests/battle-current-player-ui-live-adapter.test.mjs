import assert from 'node:assert/strict';
import {
  BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA,
  mountBattleCurrentPlayerUiLiveAdapter,
  projectBattleCurrentActionLiveDom,
  readBattleCurrentActionPublicDomFacts,
} from '../browser/battle-current-player-ui-live-adapter.mjs';

function makeClassList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (name) => values.has(name),
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    toggle(name, force) {
      const on = force == null ? !values.has(name) : Boolean(force);
      if (on) values.add(name); else values.delete(name);
      return on;
    },
  };
}

function makeElement({ dataset = {}, classes = [], textContent = '', disabled = false } = {}) {
  const attrs = new Map();
  const children = [];
  const node = {
    dataset: { ...dataset },
    classList: makeClassList(classes),
    className: classes.join(' '),
    textContent,
    disabled,
    hidden: false,
    parentNode: null,
    children,
    setAttribute(name, value) { attrs.set(name, String(value)); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    removeAttribute(name) { attrs.delete(name); },
    appendChild(child) { children.push(child); child.parentNode = node; return child; },
    removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); child.parentNode = null; return child; },
  };
  return node;
}

function makeBattleHarness() {
  const phaseTitle = makeElement({ textContent: '攻撃先を選択' });
  const phase = makeElement({ dataset: { ph: 'target' }, classes: ['on'] });
  const readyPlan = makeElement({ disabled: true });
  const targetBox = makeElement();
  const boardPlayers = makeElement();
  const publicPlayerStrip = makeElement();
  const tokens = [
    makeElement({ dataset: { player: 'P1' }, classes: ['boardPlayerToken', 'human'] }),
    makeElement({ dataset: { player: 'P2' }, classes: ['boardPlayerToken', 'active'] }),
    makeElement({ dataset: { player: 'P3' }, classes: ['boardPlayerToken'] }),
    makeElement({ dataset: { player: 'P4' }, classes: ['boardPlayerToken'] }),
  ];
  const chips = [
    makeElement({ dataset: { playerId: 'P2', publicState: '攻撃先を決定' }, classes: ['publicPlayerChip'] }),
    makeElement({ dataset: { playerId: 'P3', publicState: '待機' }, classes: ['publicPlayerChip'] }),
    makeElement({ dataset: { playerId: 'P4', publicState: '待機' }, classes: ['publicPlayerChip'] }),
  ];
  let currentActionSurface = null;
  const root = makeElement();
  root.querySelector = (selector) => {
    if (selector === '[data-battle-current-action="1"]') return currentActionSurface;
    if (selector === '#phaseTitle') return phaseTitle;
    if (selector === '#phaseBar [data-ph].on') return phase;
    if (selector === '#phaseBar') return phase;
    if (selector === '#readyPlan') return readyPlan;
    if (selector === '#targetBox') return targetBox;
    if (selector === '#boardPlayers') return boardPlayers;
    if (selector === '#publicPlayerStrip') return publicPlayerStrip;
    return null;
  };
  root.querySelectorAll = (selector) => {
    if (selector === '#boardPlayers .boardPlayerToken') return tokens;
    if (selector === '#publicPlayerStrip .publicPlayerChip') return chips;
    return [];
  };
  const baseAppend = root.appendChild.bind(root);
  root.appendChild = (child) => {
    if (child.getAttribute?.('data-battle-current-action') === '1') currentActionSurface = child;
    return baseAppend(child);
  };
  const baseRemove = root.removeChild.bind(root);
  root.removeChild = (child) => {
    if (child === currentActionSurface) currentActionSurface = null;
    return baseRemove(child);
  };

  const head = makeElement();
  const documentRef = {
    readyState: 'complete',
    head,
    createElement: () => makeElement(),
    getElementById(id) { return head.children.find((node) => node.id === id) ?? null; },
    querySelector(selector) { return selector.includes('battle') ? root : null; },
  };
  return { root, documentRef, phaseTitle, phase, readyPlan, targetBox, tokens, chips, getCurrentActionSurface: () => currentActionSurface };
}

{
  const h = makeBattleHarness();
  const facts = readBattleCurrentActionPublicDomFacts(h.root);
  assert.equal(facts.viewerParticipantId, 'P1');
  assert.equal(facts.inputOwnerParticipantId, 'P2');
  assert.equal(facts.currentAction, '攻撃先を選択');
  assert.equal(facts.waitReason, '攻撃先を決定');
  const projected = projectBattleCurrentActionLiveDom(h.root);
  assert.equal(projected.ownerRelation, 'OTHER');
  assert.equal(projected.text, '今：攻撃先を選択 / 待ち：P2 / 理由：攻撃先を決定');

  h.phase.dataset.ph = 'plan';
  h.phaseTitle.textContent = '行動を計画';
  h.readyPlan.disabled = false;
  const selfPlan = projectBattleCurrentActionLiveDom(h.root);
  assert.equal(selfPlan.ownerRelation, 'SELF');
  assert.equal(selfPlan.viewerOwnsInput, true);
  assert.equal(selfPlan.waitingFor, null);
  assert.equal(selfPlan.waitReason, null);
  assert.equal(selfPlan.text, '今：行動を計画');

  h.phase.dataset.ph = 'move';
  h.phaseTitle.textContent = '移動を解決';
  h.readyPlan.disabled = true;
  const resolving = projectBattleCurrentActionLiveDom(h.root);
  assert.equal(resolving.ownerRelation, 'UNRESOLVED');
  assert.equal(resolving.inputOwner, null);
  assert.equal(resolving.waitReason, null);
  assert.equal(resolving.text, '今：移動を解決');

  h.tokens.push(makeElement({ dataset: { player: 'P5' }, classes: ['boardPlayerToken', 'human'] }));
  assert.equal(readBattleCurrentActionPublicDomFacts(h.root), null, 'ambiguous viewer identity must fail closed');
}

{
  const h = makeBattleHarness();
  const globalRef = { document: h.documentRef, queueMicrotask: (fn) => fn() };
  const mounts = [];
  let destroyCount = 0;
  const fakeMount = (receivedGlobal, options) => {
    mounts.push({ receivedGlobal, root: options.root, currentActionAtMount: h.getCurrentActionSurface() });
    return {
      inspect: () => ({ rootDecorated: true, presentationOnly: true }),
      sync: (snapshot) => ({ snapshot }),
      destroy: () => { destroyCount += 1; return true; },
    };
  };

  const first = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: fakeMount });
  assert.ok(first);
  assert.equal(first.schema, BATTLE_CURRENT_PLAYER_UI_LIVE_ADAPTER_SCHEMA);
  assert.equal(first.presentationOnly, true);
  assert.equal(first.gameplayAuthority, false);
  assert.equal(first.gameStateWrite, false);
  assert.equal(first.mounted(), true);
  assert.equal(mounts.length, 1);
  assert.equal(mounts[0].receivedGlobal, globalRef);
  assert.equal(mounts[0].root, h.root);
  assert.equal(mounts[0].currentActionAtMount, first.currentActionSurface, 'surface must exist before compositor resolves selectors');
  assert.deepEqual(first.inspect(), { rootDecorated: true, presentationOnly: true });
  assert.equal(first.currentAction().text, '今：攻撃先を選択 / 待ち：P2 / 理由：攻撃先を決定');
  assert.equal(first.currentActionSurface.hidden, false);
  assert.equal(first.currentActionSurface.textContent, first.currentAction().text);
  assert.equal(first.currentActionSurface.dataset.ownerRelation, 'OTHER');
  assert.equal(first.currentActionSurface.dataset.waitingForParticipantId, 'P2');

  assert.deepEqual(first.sync({ reducedMotion: true }), { snapshot: { reducedMotion: true } });
  assert.equal(first.currentAction().text, '今：攻撃先を選択 / 待ち：P2 / 理由：攻撃先を決定');

  const explicit = first.syncCurrentActionContext({
    authorityBoundary: 'caller_authoritative_public_state',
    participants: [{ id: 'P1', label: '自分' }, { id: 'P4', label: '相手4' }],
    viewerParticipantId: 'P1',
    inputOwnerParticipantId: 'P4',
    currentAction: '防御結果を確認',
    waitReason: '公開結果を確認中',
  });
  assert.equal(explicit.text, '今：防御結果を確認 / 待ち：相手4 / 理由：公開結果を確認中');
  assert.equal(first.currentActionSurface.dataset.currentActionSource, 'explicit-caller');

  first.syncCurrentActionContext(null);
  assert.equal(first.currentAction().text, '今：攻撃先を選択 / 待ち：P2 / 理由：攻撃先を決定');
  assert.equal(first.currentActionSurface.dataset.currentActionSource, 'existing-public-live-dom');

  const duplicate = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: () => { throw new Error('must not remount'); } });
  assert.equal(duplicate, first);
  assert.equal(mounts.length, 1);
  assert.equal(first.destroy(), true);
  assert.equal(first.destroy(), false);
  assert.equal(first.mounted(), false);
  assert.equal(destroyCount, 1);
  assert.equal(h.getCurrentActionSurface(), null);

  const second = mountBattleCurrentPlayerUiLiveAdapter(globalRef, { mountUi: fakeMount });
  assert.ok(second);
  assert.notEqual(second, first);
  assert.equal(mounts.length, 2);
  assert.equal(second.destroy(), true);
  assert.equal(destroyCount, 2);
}

assert.equal(mountBattleCurrentPlayerUiLiveAdapter({ document: { querySelector: () => null } }, { mountUi: () => ({}) }), null);
assert.equal(mountBattleCurrentPlayerUiLiveAdapter({}, { mountUi: () => ({}) }), null);
console.log('battle-current-player-ui-live-adapter: lifecycle + current-action public DOM projection tests passed');
