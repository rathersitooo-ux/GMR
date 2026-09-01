import { buildPartnerShellView } from './partner-shell-presentation-core.mjs';
import { createSaasunaConversationEntry } from './partner-conversation-core.mjs';
import { SAASUNA_PARTNER_ID } from './partner-saasuna-conversation-source.mjs';

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

function conversationFailure(reason) {
  return Object.freeze({ ok: false, reason });
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

function renderConversation(doc, section, model, conversation) {
  const panel = element(doc, 'div', 'partner-shell-conversation');
  panel.dataset.partnerId = model.activePartnerId;

  if (!conversation?.available) {
    panel.dataset.partnerConversationState = 'unavailable';
    panel.append(element(doc, 'p', 'partner-shell-conversation-unavailable', '会話はまだ利用できません。'));
    section.append(panel);
    return;
  }

  panel.dataset.partnerConversationState = conversation.pending ? 'pending' : 'ready';
  const log = element(doc, 'div', 'partner-shell-conversation-log');
  for (const turn of conversation.turns) {
    const row = element(doc, 'p', 'partner-shell-conversation-utterance', turn.utterance);
    if (turn.turnId) row.dataset.turnId = turn.turnId;
    if (turn.responseOrigin) row.dataset.responseOrigin = turn.responseOrigin;
    log.append(row);
  }
  panel.append(log);

  const controls = element(doc, 'div', 'partner-shell-conversation-controls');
  const input = element(doc, 'input', 'partner-shell-conversation-input');
  input.type = 'text';
  input.maxLength = 4000;
  input.autocomplete = 'off';
  input.dataset.partnerConversationInput = 'message';
  const send = element(doc, 'button', 'partner-shell-conversation-send', conversation.pending ? '送信中' : '送る');
  send.type = 'button';
  send.disabled = conversation.pending;
  send.dataset.partnerConversationAction = 'send';
  send.addEventListener('click', () => conversation.send(input.value));
  input.addEventListener('keydown', (event) => {
    if (event?.key !== 'Enter' || event?.isComposing) return;
    event.preventDefault?.();
    void conversation.send(input.value);
  });
  controls.append(input, send);
  panel.append(controls);

  if (conversation.reason) {
    panel.append(element(doc, 'p', 'partner-shell-conversation-status', '会話を開始できません。'));
  }
  section.append(panel);
}

function renderBody(doc, section, model, emit, conversation) {
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
  } else if (model.view === 'conversation') {
    renderConversation(doc, section, model, conversation);
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
  conversationProvider,
  createConversationSessionId,
} = {}) {
  if (!root || typeof root.replaceChildren !== 'function' || !root.ownerDocument?.createElement) {
    throw new TypeError('root must be a DOM element with ownerDocument');
  }
  if (typeof getInput !== 'function') throw new TypeError('getInput must be a function');
  if (onAction !== undefined && typeof onAction !== 'function') throw new TypeError('onAction must be a function');
  if (conversationProvider !== undefined && conversationProvider !== null && typeof conversationProvider?.sendMessage !== 'function') {
    throw new TypeError('conversationProvider must expose sendMessage');
  }
  if (createConversationSessionId !== undefined && typeof createConversationSessionId !== 'function') {
    throw new TypeError('createConversationSessionId must be a function');
  }

  let destroyed = false;
  let lastModel = null;
  let conversationEntry = null;
  let conversationTurns = [];
  let conversationPending = false;
  let conversationReason = null;

  const emit = (spec) => {
    if (destroyed || typeof onAction !== 'function') return;
    onAction(Object.freeze({
      action: spec.action,
      targetView: spec.targetView,
      partnerId: spec.partnerId,
      sourceView: lastModel?.view ?? null,
    }));
  };

  const getConversationEntry = () => {
    if (!conversationEntry) {
      conversationEntry = createSaasunaConversationEntry({
        provider: conversationProvider ?? null,
        ...(createConversationSessionId ? { createSessionId: createConversationSessionId } : {}),
      });
    }
    return conversationEntry;
  };

  async function sendConversationMessage(message) {
    if (destroyed) return conversationFailure('DESTROYED');
    if (!lastModel || lastModel.view !== 'conversation') return conversationFailure('CONVERSATION_VIEW_REQUIRED');
    if (lastModel.activePartnerId !== SAASUNA_PARTNER_ID) return conversationFailure('CONVERSATION_SOURCE_UNAVAILABLE');
    if (conversationPending) return conversationFailure('CONVERSATION_PENDING');
    const text = typeof message === 'string' ? message.trim() : '';
    if (!text || text.length > 4000) return conversationFailure('MESSAGE_INVALID');

    conversationPending = true;
    conversationReason = null;
    try {
      const output = await getConversationEntry().send(text);
      if (destroyed) return conversationFailure('DESTROYED');
      if (!output?.turn?.ok) {
        conversationReason = 'CONVERSATION_FAILED';
        return conversationFailure(output?.turn?.reason ?? 'CONVERSATION_FAILED');
      }
      conversationTurns = Object.freeze([
        ...conversationTurns,
        Object.freeze({
          turnId: output.turn.evidence?.turnId ?? null,
          utterance: output.turn.utterance,
          responseOrigin: output.turn.responseOrigin,
        }),
      ].slice(-4));
      return output;
    } catch {
      conversationReason = 'CONVERSATION_FAILED';
      return conversationFailure('CONVERSATION_FAILED');
    } finally {
      conversationPending = false;
      if (!destroyed && lastModel?.view === 'conversation') render();
    }
  }

  function getConversationState() {
    const available = lastModel?.view === 'conversation' && lastModel.activePartnerId === SAASUNA_PARTNER_ID;
    return Object.freeze({
      available,
      pending: conversationPending,
      reason: available ? conversationReason : 'CONVERSATION_SOURCE_UNAVAILABLE',
      turns: Object.freeze([...conversationTurns]),
    });
  }

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
    const conversation = model.view === 'conversation' ? Object.freeze({
      available: model.activePartnerId === SAASUNA_PARTNER_ID,
      pending: conversationPending,
      reason: conversationReason,
      turns: Object.freeze([...conversationTurns]),
      send: sendConversationMessage,
    }) : null;
    renderBody(doc, section, model, emit, conversation);
    root.replaceChildren(section);
    lastModel = model;
    return Object.freeze({ ok: true, reason: null, model });
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    lastModel = null;
    conversationEntry = null;
    conversationTurns = [];
    conversationPending = false;
    conversationReason = null;
    root.replaceChildren();
    return true;
  }

  return Object.freeze({
    render,
    destroy,
    sendConversationMessage,
    getConversationState,
    getLastModel: () => lastModel,
  });
}
