import { buildPartnerShellView } from './partner-shell-presentation-core.mjs';

const NAV_LABELS = Object.freeze({
  OPEN_DETAIL: '詳細',
  BACK_LIST: '一覧へ',
  BACK_HUB: '戻る',
});

function dispatchAllowed(canDispatch, action, context) {
  if (typeof canDispatch !== 'function') return false;
  try {
    return canDispatch(action, context) === true;
  } catch {
    return false;
  }
}

function frozenAction(action, label, context = {}) {
  return Object.freeze({
    action,
    label,
    targetView: context.targetView ?? null,
    partnerId: context.partnerId ?? null,
  });
}

export function buildPartnerShellRuntimeModel(input = {}, { canDispatch } = {}) {
  const view = buildPartnerShellView(input);
  const context = Object.freeze({ view: view.view, activePartnerId: view.activePartnerId });

  const menuActions = Object.freeze(view.hubMenuItems
    .filter((item) => dispatchAllowed(canDispatch, item.action, Object.freeze({ ...context, targetView: item.targetView })))
    .map((item) => frozenAction(item.action, item.label, { targetView: item.targetView })));

  const navigationActions = Object.freeze(view.availableActions
    .filter((action) => view.view !== 'hub' && action !== 'OPEN_DETAIL')
    .filter((action) => dispatchAllowed(canDispatch, action, context))
    .map((action) => frozenAction(action, NAV_LABELS[action] ?? action)));

  const roster = Object.freeze(view.roster.map((partner) => Object.freeze({
    ...partner,
    detailAction: view.view === 'list' && dispatchAllowed(
      canDispatch,
      'OPEN_DETAIL',
      Object.freeze({ ...context, partnerId: partner.partnerId, targetView: 'detail' }),
    ) ? frozenAction('OPEN_DETAIL', '詳細', { targetView: 'detail', partnerId: partner.partnerId }) : null,
  })));

  return Object.freeze({
    view: view.view,
    title: view.viewTitle,
    surfaceKind: view.surfaceKind,
    activePartnerId: view.activePartnerId,
    activePartner: view.activePartner,
    roster,
    detailPartner: view.detailPartner,
    formationPartnerIds: view.formationPartnerIds,
    strategyId: view.strategyId,
    menuActions,
    navigationActions,
    readOnlyProjection: true,
    deadButtonAllowed: false,
  });
}

function element(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function actionButton(doc, spec, emit) {
  const button = element(doc, 'button', 'partner-shell-action', spec.label);
  button.type = 'button';
  button.dataset.partnerShellAction = spec.action;
  if (spec.targetView) button.dataset.partnerShellTarget = spec.targetView;
  if (spec.partnerId) button.dataset.partnerId = spec.partnerId;
  button.addEventListener('click', () => emit(spec));
  return button;
}

function renderBody(doc, section, model, emit) {
  if (model.activePartner) {
    const active = element(doc, 'p', 'partner-shell-active');
    active.dataset.partnerId = model.activePartner.partnerId;
    active.textContent = model.activePartner.displayName ?? model.activePartner.partnerId;
    section.append(active);
  }

  if (model.view === 'hub') {
    const menu = element(doc, 'div', 'partner-shell-menu');
    for (const spec of model.menuActions) menu.append(actionButton(doc, spec, emit));
    section.append(menu);
    return;
  }

  if (model.view === 'list') {
    const list = element(doc, 'div', 'partner-shell-roster');
    for (const partner of model.roster) {
      const row = element(doc, 'div', 'partner-shell-roster-row');
      row.dataset.partnerId = partner.partnerId;
      row.append(element(doc, 'span', 'partner-shell-roster-name', partner.displayName ?? partner.partnerId));
      if (partner.detailAction) row.append(actionButton(doc, partner.detailAction, emit));
      list.append(row);
    }
    section.append(list);
  } else if (model.view === 'detail' && model.detailPartner) {
    const detail = element(doc, 'div', 'partner-shell-detail');
    detail.dataset.partnerId = model.detailPartner.partnerId;
    detail.append(element(doc, 'strong', 'partner-shell-detail-name', model.detailPartner.displayName ?? model.detailPartner.partnerId));
    section.append(detail);
  } else if (model.view === 'formation') {
    const formation = element(doc, 'div', 'partner-shell-formation');
    for (const partnerId of model.formationPartnerIds) {
      const row = element(doc, 'div', 'partner-shell-formation-row', partnerId);
      row.dataset.partnerId = partnerId;
      formation.append(row);
    }
    section.append(formation);
  } else if (model.view === 'strategy' && model.strategyId) {
    const strategy = element(doc, 'div', 'partner-shell-strategy', model.strategyId);
    strategy.dataset.strategyId = model.strategyId;
    section.append(strategy);
  }

  if (model.navigationActions.length) {
    const nav = element(doc, 'div', 'partner-shell-navigation');
    for (const spec of model.navigationActions) nav.append(actionButton(doc, spec, emit));
    section.append(nav);
  }
}

export function mountPartnerShellRuntime({
  root,
  getInput,
  canDispatch,
  onAction,
} = {}) {
  if (!root || typeof root.replaceChildren !== 'function' || !root.ownerDocument?.createElement) {
    throw new TypeError('root must be a DOM element with ownerDocument');
  }
  if (typeof getInput !== 'function') throw new TypeError('getInput must be a function');
  if (onAction !== undefined && typeof onAction !== 'function') throw new TypeError('onAction must be a function');

  let destroyed = false;
  let lastModel = null;

  const emit = (spec) => {
    if (destroyed || typeof onAction !== 'function') return;
    onAction(Object.freeze({
      action: spec.action,
      targetView: spec.targetView,
      partnerId: spec.partnerId,
      sourceView: lastModel?.view ?? null,
    }));
  };

  function render() {
    if (destroyed) return Object.freeze({ ok: false, reason: 'DESTROYED', model: null });
    let model;
    try {
      model = buildPartnerShellRuntimeModel(getInput(), { canDispatch });
    } catch {
      lastModel = null;
      root.replaceChildren();
      return Object.freeze({ ok: false, reason: 'INVALID_INPUT', model: null });
    }

    const doc = root.ownerDocument;
    const section = element(doc, 'section', 'partner-shell-runtime');
    section.dataset.partnerShellView = model.view;
    section.dataset.partnerShellSurfaceKind = model.surfaceKind;
    section.append(element(doc, 'h2', 'partner-shell-title', model.title));
    renderBody(doc, section, model, emit);
    root.replaceChildren(section);
    lastModel = model;
    return Object.freeze({ ok: true, reason: null, model });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    lastModel = null;
    root.replaceChildren();
    return true;
  }

  return Object.freeze({ render, destroy, getLastModel: () => lastModel });
}
