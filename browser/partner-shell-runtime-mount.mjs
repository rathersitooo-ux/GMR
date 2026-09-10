import { buildPartnerShellView } from './partner-shell-presentation-core.mjs';
import {
  normalizePartnerVoiceTuning,
  submitPartnerDialogueFeedback,
} from './partner-dialogue-feedback-core.mjs';
import {
  listSaasunaSystemVoices,
  previewSaasunaVoice,
} from './partner-saasuna-voice-runtime.mjs';
import { createPartnerCostumeBrowserSessionRuntime } from './partner-costume-browser-session-runtime.mjs';
import { mountPartnerCostumeScreen } from './partner-costume-screen-runtime-mount.mjs';
import { selectApprovedPartnerIdleUtterance } from './partner-dialogue-source-registry.mjs';

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

  const idleReadableLine = view.view === 'hub' && view.activePartnerId
    ? selectApprovedPartnerIdleUtterance({
        partnerId: view.activePartnerId,
        seed: `partner-shell:${view.activePartnerId}`,
      })
    : null;

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
    postBattleLine: view.postBattleLine,
    idleReadableLine,
    voiceTuning: normalizePartnerVoiceTuning(input.partnerVoiceTuning),
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

function rangeControl(doc, labelText, key, value, min, max, step) {
  const wrap = element(doc, 'label', 'partner-dialogue-control');
  wrap.dataset.partnerVoiceControl = key;
  wrap.append(element(doc, 'span', 'partner-dialogue-control-label', labelText));
  const input = element(doc, 'input', 'partner-dialogue-range');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.dataset.partnerVoiceValue = key;
  const valueLabel = element(doc, 'output', 'partner-dialogue-control-value', input.value);
  input.addEventListener('input', () => { valueLabel.textContent = input.value; });
  wrap.append(input, valueLabel);
  return { wrap, input };
}

function renderDialogueFeedback(doc, section, model, services) {
  const panel = element(doc, 'div', 'partner-dialogue-feedback');
  panel.dataset.partnerId = model.activePartnerId;
  panel.append(element(doc, 'p', 'partner-dialogue-feedback-note', 'バトル後のセリフを編集し、正式採用ではなく改善要望として蓄積します。'));

  const line = model.postBattleLine;
  if (!line) {
    panel.append(element(doc, 'p', 'partner-dialogue-empty', '編集できるバトル後セリフがまだありません。'));
    section.append(panel);
    return;
  }

  panel.dataset.sourceLineId = line.sourceLineId;
  panel.append(element(doc, 'p', 'partner-dialogue-original', line.text));
  const textarea = element(doc, 'textarea', 'partner-dialogue-editor');
  textarea.value = line.text;
  textarea.maxLength = 600;
  textarea.dataset.partnerDialogueEditor = 'proposedText';
  panel.append(textarea);

  let rate = null;
  let pitch = null;
  let volume = null;
  let pauseMs = null;
  let voiceSelect = null;

  if (model.activePartnerId === 'partner.saasuna') {
    const voice = element(doc, 'fieldset', 'partner-voice-tuning');
    voice.append(element(doc, 'legend', 'partner-voice-title', 'サースナー 仮音声調整'));
    voice.append(element(doc, 'p', 'partner-voice-provisional', '端末の日本語音声で試聴します。正式音声アセットではありません。'));

    const controls = [
      rangeControl(doc, '速さ', 'rate', model.voiceTuning.rate, 0.5, 2, 0.05),
      rangeControl(doc, '声の高さ', 'pitch', model.voiceTuning.pitch, 0, 2, 0.05),
      rangeControl(doc, '音量', 'volume', model.voiceTuning.volume, 0, 1, 0.05),
      rangeControl(doc, '文間', 'pauseMs', model.voiceTuning.pauseMs, 0, 1000, 20),
    ];
    [rate, pitch, volume, pauseMs] = controls.map((entry) => entry.input);
    for (const entry of controls) voice.append(entry.wrap);

    voiceSelect = element(doc, 'select', 'partner-voice-select');
    voiceSelect.dataset.partnerVoiceValue = 'voiceURI';
    const auto = element(doc, 'option', '', '端末の自動選択');
    auto.value = '';
    voiceSelect.append(auto);
    for (const item of services.listVoices()) {
      const option = element(doc, 'option', '', `${item.name} (${item.lang})`);
      option.value = item.voiceURI;
      option.selected = item.voiceURI === model.voiceTuning.voiceURI;
      voiceSelect.append(option);
    }
    voice.append(voiceSelect);
    panel.append(voice);
  }

  const status = element(doc, 'p', 'partner-dialogue-status');
  status.dataset.partnerDialogueStatus = 'true';

  const readTuning = () => normalizePartnerVoiceTuning({
    rate: rate?.value ?? model.voiceTuning.rate,
    pitch: pitch?.value ?? model.voiceTuning.pitch,
    volume: volume?.value ?? model.voiceTuning.volume,
    pauseMs: pauseMs?.value ?? model.voiceTuning.pauseMs,
    voiceURI: voiceSelect?.value ?? model.voiceTuning.voiceURI,
  });

  if (model.activePartnerId === 'partner.saasuna') {
    const preview = element(doc, 'button', 'partner-voice-preview', 'この声で試聴');
    preview.type = 'button';
    preview.dataset.partnerDialogueAction = 'preview';
    preview.addEventListener('click', () => {
      const result = services.previewVoice({ text: textarea.value, tuning: readTuning() });
      status.textContent = result?.ok ? '試聴中' : 'この端末では音声試聴を使えません';
    });
    panel.append(preview);
  }

  const submit = element(doc, 'button', 'partner-dialogue-submit', 'この変更を改善要望として送る');
  submit.type = 'button';
  submit.dataset.partnerDialogueAction = 'submit';
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    status.textContent = '送信中';
    try {
      let result;
      try {
        result = await services.submitFeedback({
          partnerId: model.activePartnerId,
          sourceLineId: line.sourceLineId,
          sourceStateIdentity: line.sourceStateIdentity,
          versions: line.versions,
          originalText: line.text,
          proposedText: textarea.value,
          voiceTuning: readTuning(),
        });
      } catch {
        status.textContent = '送信できませんでした';
        return;
      }
      if (result?.ok) {
        status.textContent = result.disposition === 'duplicate' ? '同じ要望は蓄積済みです' : '改善要望として蓄積しました';
        services.onFeedbackResult?.(Object.freeze({ ...result, sourceLineId: line.sourceLineId, partnerId: model.activePartnerId }));
      } else {
        status.textContent = result?.reason === 'dialogue_feedback_invalid' ? 'セリフを変更してから送ってください' : '送信できませんでした';
      }
    } finally {
      submit.disabled = false;
    }
  });
  panel.append(submit, status);
  section.append(panel);
}

function renderBody(doc, section, model, emit, services) {
  if (model.activePartner && model.view !== 'list' && model.view !== 'detail') {
    const active = element(doc, 'p', 'partner-shell-active');
    active.dataset.partnerId = model.activePartner.partnerId;
    active.textContent = model.activePartner.displayName ?? model.activePartner.partnerId;
    section.append(active);
  }

  if (model.view === 'hub') {
    if (model.idleReadableLine?.text) {
      const idle = element(doc, 'p', 'partner-shell-idle-readable', model.idleReadableLine.text);
      idle.dataset.partnerId = model.idleReadableLine.partnerId;
      idle.dataset.sourceState = model.idleReadableLine.sourceState;
      idle.dataset.presentationOnly = 'true';
      section.append(idle);
    }
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
  } else if (model.view === 'dialogue_feedback') {
    renderDialogueFeedback(doc, section, model, services);
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
  submitFeedback = submitPartnerDialogueFeedback,
  previewVoice = previewSaasunaVoice,
  listVoices = listSaasunaSystemVoices,
  onFeedbackResult,
  costume = null,
} = {}) {
  if (!root || typeof root.replaceChildren !== 'function' || !root.ownerDocument?.createElement) {
    throw new TypeError('root must be a DOM element with ownerDocument');
  }
  if (typeof getInput !== 'function') throw new TypeError('getInput must be a function');
  if (onAction !== undefined && typeof onAction !== 'function') throw new TypeError('onAction must be a function');
  if (typeof submitFeedback !== 'function') throw new TypeError('submitFeedback must be a function');
  if (typeof previewVoice !== 'function') throw new TypeError('previewVoice must be a function');
  if (typeof listVoices !== 'function') throw new TypeError('listVoices must be a function');
  const costumeServices = normalizePartnerCostumeServices(costume);

  let destroyed = false;
  let lastModel = null;
  let activeCostumeScreen = null;
  let costumeRenderVersion = 0;

  const emit = (spec) => {
    if (destroyed || typeof onAction !== 'function') return;
    onAction(Object.freeze({
      action: spec.action,
      targetView: spec.targetView,
      partnerId: spec.partnerId,
      sourceView: lastModel?.view ?? null,
    }));
  };

  const services = Object.freeze({ submitFeedback, previewVoice, listVoices, onFeedbackResult });
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

  function render() {
    if (destroyed) return Object.freeze({ ok: false, reason: 'DESTROYED', model: null });
    let model;
    try {
      model = buildPartnerShellRuntimeModel(getInput(), { canDispatch: runtimeCanDispatch });
    } catch {
      lastModel = null;
      root.replaceChildren();
      return Object.freeze({ ok: false, reason: 'INVALID_INPUT', model: null });
    }

    clearCostumeScreen();
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
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    clearCostumeScreen();
    lastModel = null;
    root.replaceChildren();
    return true;
  }

  return Object.freeze({ render, destroy, getLastModel: () => lastModel });
}
