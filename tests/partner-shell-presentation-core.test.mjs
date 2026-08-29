import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerShellView,
  nextPartnerShellView,
  PARTNER_HUB_MENU_ITEMS,
} from '../browser/partner-shell-presentation-core.mjs';

const roster = [
  { partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: 'saasuna.current' },
  { partnerId: 'partner.other', displayName: 'Other' },
];

const expectedHubIds = ['detail', 'list', 'formation', 'strategy', 'conversation', 'tea'];

test('hub exposes concrete current Partner entries only', () => {
  const view = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster });
  assert.equal(view.view, 'hub');
  assert.equal(view.activePartner.displayName, 'サースナー');
  assert.deepEqual(view.hubMenuItems.map((item) => item.id), expectedHubIds);
  assert.equal(view.deadButtonAllowed, false);
  assert.equal(view.readOnlyProjection, true);
  assert.equal('minimumPanel' in view, false);
});

test('every visible Partner hub button routes to its concrete surface', () => {
  for (const item of PARTNER_HUB_MENU_ITEMS) {
    const target = nextPartnerShellView('hub', item.action);
    assert.equal(target, item.targetView, `${item.id} did not route to its declared target`);
    assert.notEqual(target, 'hub', `${item.id} is a dead button`);
    const targetView = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster, view: target });
    assert.equal(targetView.view, target);
    assert.equal(targetView.availableActions.includes('BACK_HUB') || target === 'detail', true);
  }
});

test('placeholder-only concepts are not advertised as usable surfaces', () => {
  for (const id of ['intimacy', 'reward', 'solo', 'wardrobe', 'advice_history', 'tension', 'vtuber']) {
    assert.equal(PARTNER_HUB_MENU_ITEMS.some((item) => item.id === id), false);
  }
  const unknown = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster, view: 'reward' });
  assert.equal(unknown.view, 'hub');
});

test('active Partner detail is directly reachable without opening the roster first', () => {
  assert.equal(nextPartnerShellView('hub', 'OPEN_ACTIVE_DETAIL'), 'detail');
  const view = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster, view: 'detail' });
  assert.equal(view.detailPartner.partnerId, 'partner.saasuna');
});

test('missing active partner fails instead of silently choosing first roster entry', () => {
  assert.throws(() => buildPartnerShellView({ roster }), /never auto-picks/);
});

test('list and detail navigation never selects or mutates a Partner', () => {
  assert.equal(nextPartnerShellView('hub', 'OPEN_LIST'), 'list');
  assert.equal(nextPartnerShellView('list', 'OPEN_DETAIL'), 'detail');
  assert.equal(nextPartnerShellView('detail', 'BACK_LIST'), 'list');
  assert.equal(nextPartnerShellView('detail', 'BACK_HUB'), 'hub');
});

test('formation and strategy project caller authority without mutating or inventing values', () => {
  const input = {
    activePartnerId: 'partner.saasuna',
    roster,
    view: 'strategy',
    formationPartnerIds: ['partner.saasuna', 'partner.other'],
    strategyId: 'strategy.current',
    relationship: { intimacy: 999 },
    save: { write: true },
    reward: { coins: 999 },
  };
  const before = structuredClone(input);
  const view = buildPartnerShellView(input);
  assert.deepEqual(input, before);
  assert.deepEqual(view.formationPartnerIds, ['partner.saasuna', 'partner.other']);
  assert.equal(view.strategyId, 'strategy.current');
  assert.equal('relationship' in view, false);
  assert.equal('save' in view, false);
  assert.equal('reward' in view, false);
});

test('menu contract and outputs are frozen and deterministic', () => {
  const first = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster });
  const second = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster });
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(PARTNER_HUB_MENU_ITEMS), true);
  assert.equal(Object.isFrozen(PARTNER_HUB_MENU_ITEMS[0]), true);
});
