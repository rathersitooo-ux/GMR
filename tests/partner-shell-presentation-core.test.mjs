import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerShellView,
  nextPartnerShellView,
} from '../browser/partner-shell-presentation-core.mjs';

const roster = [
  { partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: 'saasuna.current' },
  { partnerId: 'partner.other', displayName: 'Other' },
];

test('shell opens on current partner without auto-picking from roster', () => {
  const view = buildPartnerShellView({ activePartnerId: 'partner.saasuna', roster });
  assert.equal(view.view, 'hub');
  assert.equal(view.activePartnerId, 'partner.saasuna');
  assert.equal(view.activePartner.displayName, 'サースナー');
  assert.deepEqual(view.availableActions, ['OPEN_LIST', 'OPEN_FORMATION', 'OPEN_STRATEGY']);
  assert.equal(view.readOnlyProjection, true);
});

test('missing active partner fails instead of silently choosing first roster entry', () => {
  assert.throws(() => buildPartnerShellView({ roster }), /never auto-picks/);
});

test('list and detail are navigation surfaces, not partner selection side effects', () => {
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

test('invalid view and duplicate roster entries converge deterministically', () => {
  const view = buildPartnerShellView({
    activePartnerId: 'partner.saasuna',
    view: 'conversation',
    roster: [...roster, { partnerId: 'partner.saasuna', displayName: 'duplicate' }],
  });
  assert.equal(view.view, 'hub');
  assert.equal(view.roster.length, 2);
  assert.equal(view.roster[0].displayName, 'サースナー');
  assert.equal(Object.isFrozen(view), true);
});
