import { createSetupQuickDeckPreview } from './cards-deck-presentation-core.mjs';

const STYLE_ID = 'gameroad-setup-quick-deck-live-style';
const OPEN_ID = 'gameroad-setup-quick-deck-open';
const ROOT_ID = 'gameroad-setup-quick-deck-root';

export const SETUP_QUICK_DECK_LIVE_CONTRACT = Object.freeze({
  schema: 'gameroad.setup-quick-deck-live.v1',
  source: 'caller-selected-saved-deck',
  readOnly: true,
  ownsDeck: false,
  mutatesDeck: false,
  mutatesSelection: false,
  validatesDeck: false,
  editRoute: 'existing-deck-editor-only',
  closeActions: Object.freeze(['CLOSE_BUTTON', 'OUTSIDE_POINTER', 'ESCAPE']),
});

function safeLabel(getCardLabel, cardId) {
  if (typeof getCardLabel !== 'function') return String(cardId);
  try {
    const value = getCardLabel(cardId);
    return String(value || cardId);
  } catch {
    return String(cardId);
  }
}

function groupIds(ids, getCardLabel) {
  const grouped = [];
  const byId = new Map();
  for (const rawId of ids) {
    const cardId = String(rawId);
    const prior = byId.get(cardId);
    if (prior) {
      prior.quantity += 1;
      continue;
    }
    const row = { cardId, label: safeLabel(getCardLabel, cardId), quantity: 1 };
    byId.set(cardId, row);
    grouped.push(row);
  }
  return Object.freeze(grouped.map((row) => Object.freeze({ ...row })));
}

export function createSetupQuickDeckLiveModel(source, getCardLabel) {
  const preview = createSetupQuickDeckPreview(source);
  return Object.freeze({
    schema: SETUP_QUICK_DECK_LIVE_CONTRACT.schema,
    selectedDeckNumber: preview.selectedDeckNumber,
    title: `デッキ${preview.selectedDeckNumber}の内容`,
    summary: `メイン${preview.deck.mainCount}・EX${preview.deck.exCount}`,
    rule: preview.deck.rule,
    main: groupIds(preview.deck.main, getCardLabel),
    ex: groupIds(preview.deck.ex, getCardLabel),
    readOnly: true,
  });
}

function ensureStyles(doc) {
  const existing = doc.getElementById?.(STYLE_ID);
  if (existing) return existing;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${OPEN_ID}{min-height:44px;min-width:88px;padding:8px 10px}
.setupDeckRecovery[data-quick-deck-live="1"]{grid-template-columns:minmax(0,1fr) auto auto}
#${ROOT_ID}[hidden]{display:none!important}
#${ROOT_ID}{position:fixed;inset:0;z-index:2147482600}
.setupQuickDeckBackdrop{position:fixed;inset:0;display:grid;place-items:center;padding:clamp(10px,3vw,28px);background:rgba(2,7,13,.68);backdrop-filter:blur(6px)}
.setupQuickDeckPanel{box-sizing:border-box;width:min(900px,94vw);max-height:min(82vh,760px);overflow:auto;border:1px solid rgba(182,207,255,.34);border-radius:18px;background:linear-gradient(155deg,rgba(21,29,49,.98),rgba(8,15,25,.98));box-shadow:0 24px 70px rgba(0,0,0,.48);padding:14px;color:#f4f6ff}
.setupQuickDeckHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;position:sticky;top:-14px;z-index:2;margin:-14px -14px 10px;padding:14px;background:linear-gradient(180deg,rgba(15,23,39,.99),rgba(15,23,39,.95))}
.setupQuickDeckHead h2{margin:0;font-size:clamp(18px,2.5vw,25px);line-height:1.2}.setupQuickDeckSummary{margin-top:4px;color:rgba(231,237,255,.72);font-size:12px}
.setupQuickDeckClose{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:inherit;font-size:22px}
.setupQuickDeckSections{display:grid;gap:12px}.setupQuickDeckSection{display:grid;gap:7px}.setupQuickDeckSectionHead{display:flex;justify-content:space-between;align-items:center;gap:8px}.setupQuickDeckSectionHead b{font-size:13px}.setupQuickDeckSectionHead span{font-size:11px;color:rgba(231,237,255,.66)}
.setupQuickDeckGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:7px}.setupQuickDeckCard{min-width:0;min-height:58px;border:1px solid rgba(255,255,255,.13);border-radius:10px;background:rgba(255,255,255,.045);padding:8px;display:grid;gap:3px;align-content:center}.setupQuickDeckCard b{font-size:11px;overflow-wrap:anywhere}.setupQuickDeckCard small{font-size:9px;color:rgba(231,237,255,.58);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.setupQuickDeckCard em{font-style:normal;font-size:10px;color:#ffe68e}
.setupQuickDeckEmpty{padding:12px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;color:rgba(231,237,255,.58);font-size:11px}
.setupQuickDeckActions{display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:-14px;margin:12px -14px -14px;padding:12px 14px 14px;background:linear-gradient(0deg,rgba(15,23,39,.99),rgba(15,23,39,.95))}.setupQuickDeckActions button{min-height:44px;min-width:92px}
@media(max-width:480px){.setupDeckRecovery[data-quick-deck-live="1"]{grid-template-columns:minmax(0,1fr) auto}.setupDeckRecovery[data-quick-deck-live="1"] #${OPEN_ID}{grid-column:2}.setupDeckRecovery[data-quick-deck-live="1"] #fixDeckFromSetup:not([hidden]){grid-column:1/-1}.setupQuickDeckBackdrop{padding:6px}.setupQuickDeckPanel{width:calc(100vw - 12px);max-height:calc(100dvh - 12px);border-radius:14px}.setupQuickDeckGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-height:470px) and (orientation:landscape){.setupQuickDeckBackdrop{padding:5px}.setupQuickDeckPanel{width:min(94vw,980px);max-height:calc(100dvh - 10px);padding:10px}.setupQuickDeckHead{top:-10px;margin:-10px -10px 8px;padding:10px}.setupQuickDeckSections{grid-template-columns:3fr 1fr;gap:8px}.setupQuickDeckGrid{grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:5px}.setupQuickDeckCard{min-height:50px;padding:6px}.setupQuickDeckActions{bottom:-10px;margin:8px -10px -10px;padding:8px 10px 10px}}
@media(prefers-reduced-motion:reduce){.setupQuickDeckBackdrop{backdrop-filter:none}}
`;
  (doc.head || doc.documentElement)?.appendChild?.(style);
  return style;
}

function appendDeckSection(doc, host, title, rows, count) {
  const section = doc.createElement('section');
  section.className = 'setupQuickDeckSection';
  const head = doc.createElement('div');
  head.className = 'setupQuickDeckSectionHead';
  const heading = doc.createElement('b');
  heading.textContent = title;
  const counter = doc.createElement('span');
  counter.textContent = `${count}枚`;
  head.append(heading, counter);
  section.append(head);
  if (!rows.length) {
    const empty = doc.createElement('div');
    empty.className = 'setupQuickDeckEmpty';
    empty.textContent = 'カードなし';
    section.append(empty);
    host.append(section);
    return;
  }
  const grid = doc.createElement('div');
  grid.className = 'setupQuickDeckGrid';
  for (const row of rows) {
    const card = doc.createElement('article');
    card.className = 'setupQuickDeckCard';
    card.dataset.cardId = row.cardId;
    const label = doc.createElement('b');
    label.textContent = row.label;
    const id = doc.createElement('small');
    id.textContent = row.cardId;
    card.append(label, id);
    if (row.quantity > 1) {
      const quantity = doc.createElement('em');
      quantity.textContent = `×${row.quantity}`;
      quantity.dataset.quantity = String(row.quantity);
      card.append(quantity);
    }
    grid.append(card);
  }
  section.append(grid);
  host.append(section);
}

function renderOverlay(doc, model, actions) {
  const backdrop = doc.createElement('div');
  backdrop.className = 'setupQuickDeckBackdrop';
  backdrop.dataset.role = 'setup-quick-deck-backdrop';
  const panel = doc.createElement('section');
  panel.className = 'setupQuickDeckPanel';
  panel.setAttribute?.('role', 'dialog');
  panel.setAttribute?.('aria-modal', 'true');
  panel.setAttribute?.('aria-label', model.title);

  const head = doc.createElement('div');
  head.className = 'setupQuickDeckHead';
  const titleBox = doc.createElement('div');
  const title = doc.createElement('h2');
  title.textContent = model.title;
  const summary = doc.createElement('div');
  summary.className = 'setupQuickDeckSummary';
  summary.textContent = model.summary;
  titleBox.append(title, summary);
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'setupQuickDeckClose';
  close.dataset.role = 'setup-quick-deck-close';
  close.textContent = '×';
  close.setAttribute?.('aria-label', 'デッキ内容を閉じる');
  close.addEventListener?.('click', () => actions.close('CLOSE_BUTTON'));
  head.append(titleBox, close);
  panel.append(head);

  const sections = doc.createElement('div');
  sections.className = 'setupQuickDeckSections';
  appendDeckSection(doc, sections, 'メイン', model.main, model.main.reduce((n, row) => n + row.quantity, 0));
  appendDeckSection(doc, sections, 'EX', model.ex, model.ex.reduce((n, row) => n + row.quantity, 0));
  panel.append(sections);

  const footer = doc.createElement('div');
  footer.className = 'setupQuickDeckActions';
  const edit = doc.createElement('button');
  edit.type = 'button';
  edit.className = 'btn';
  edit.dataset.role = 'setup-quick-deck-edit';
  edit.textContent = '編集へ';
  edit.addEventListener?.('click', actions.edit);
  const done = doc.createElement('button');
  done.type = 'button';
  done.className = 'btn primary';
  done.dataset.role = 'setup-quick-deck-done';
  done.textContent = '閉じる';
  done.addEventListener?.('click', () => actions.close('CLOSE_BUTTON'));
  footer.append(edit, done);
  panel.append(footer);
  backdrop.append(panel);
  backdrop.addEventListener?.('pointerdown', (event) => {
    if (event?.target === backdrop) actions.close('OUTSIDE_POINTER');
  });
  return { backdrop, closeButton: close };
}

export function installSetupQuickDeckRuntime({
  document: doc = globalThis.document,
  window: win = globalThis.window,
  getSource,
  getCardLabel,
  onEdit,
} = {}) {
  if (!doc?.querySelector || !doc?.createElement || typeof getSource !== 'function') {
    return Object.freeze({ installed: false, open: () => ({ ok: false, reason: 'UNAVAILABLE' }), close: () => false, destroy: () => false });
  }
  const setup = doc.querySelector('section[data-screen="setup"]');
  const recovery = doc.querySelector('.setupDeckRecovery');
  if (!setup || !recovery) {
    return Object.freeze({ installed: false, open: () => ({ ok: false, reason: 'SETUP_SURFACE_MISSING' }), close: () => false, destroy: () => false });
  }

  ensureStyles(doc);
  recovery.dataset.quickDeckLive = '1';
  let trigger = doc.getElementById?.(OPEN_ID);
  let ownsTrigger = false;
  if (!trigger) {
    trigger = doc.createElement('button');
    trigger.id = OPEN_ID;
    trigger.type = 'button';
    trigger.className = 'btn';
    trigger.textContent = '内容を見る';
    trigger.setAttribute?.('aria-haspopup', 'dialog');
    trigger.setAttribute?.('aria-expanded', 'false');
    recovery.append(trigger);
    ownsTrigger = true;
  }
  let root = doc.getElementById?.(ROOT_ID);
  let ownsRoot = false;
  if (!root) {
    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.hidden = true;
    setup.append(root);
    ownsRoot = true;
  }

  let opened = false;
  let destroyed = false;
  let lastModel = null;
  let returnFocus = null;

  const onKeydown = (event) => {
    if (!opened || event?.key !== 'Escape') return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close('ESCAPE');
  };

  function close(reason = 'PROGRAMMATIC', { restoreFocus = true } = {}) {
    if (!opened) return false;
    opened = false;
    doc.removeEventListener?.('keydown', onKeydown);
    root.replaceChildren?.();
    root.hidden = true;
    trigger.setAttribute?.('aria-expanded', 'false');
    const focus = returnFocus;
    returnFocus = null;
    if (restoreFocus) focus?.focus?.();
    return true;
  }

  function edit() {
    if (!opened) return false;
    const model = lastModel;
    close('EDIT', { restoreFocus: false });
    if (typeof onEdit === 'function') onEdit(model);
    return true;
  }

  function open() {
    if (destroyed) return Object.freeze({ ok: false, reason: 'DESTROYED', model: null });
    let model;
    try {
      model = createSetupQuickDeckLiveModel(getSource(), getCardLabel);
    } catch {
      return Object.freeze({ ok: false, reason: 'INVALID_SOURCE', model: null });
    }
    if (opened) close('REFRESH', { restoreFocus: false });
    lastModel = model;
    returnFocus = doc.activeElement || trigger;
    const rendered = renderOverlay(doc, model, { close, edit });
    root.replaceChildren?.(rendered.backdrop);
    root.hidden = false;
    opened = true;
    trigger.setAttribute?.('aria-expanded', 'true');
    doc.addEventListener?.('keydown', onKeydown);
    rendered.closeButton.focus?.();
    return Object.freeze({ ok: true, reason: null, model });
  }

  const onTrigger = () => open();
  trigger.addEventListener?.('click', onTrigger);
  const Observer = win?.MutationObserver;
  const observer = typeof Observer === 'function'
    ? new Observer(() => {
      if (opened && !setup.classList?.contains?.('active')) close('SCREEN_CHANGE', { restoreFocus: false });
    })
    : null;
  observer?.observe?.(setup, { attributes: true, attributeFilter: ['class'] });

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    close('DESTROY', { restoreFocus: false });
    doc.removeEventListener?.('keydown', onKeydown);
    trigger.removeEventListener?.('click', onTrigger);
    observer?.disconnect?.();
    if (ownsTrigger) trigger.remove?.();
    if (ownsRoot) root.remove?.();
    delete recovery.dataset.quickDeckLive;
    lastModel = null;
    return true;
  }

  return Object.freeze({
    installed: true,
    contract: SETUP_QUICK_DECK_LIVE_CONTRACT,
    open,
    close,
    edit,
    isOpen: () => opened,
    getLastModel: () => lastModel,
    destroy,
  });
}


const setupQuickDeckCurrentRuntimeInstallations = new WeakMap();

export function installSetupQuickDeckFromCurrentRuntime({
  global: runtimeGlobal = globalThis,
  document: doc = runtimeGlobal?.document,
  window: win = runtimeGlobal?.window,
} = {}) {
  if (!doc || !win) {
    return Object.freeze({ installed: false, open: () => ({ ok: false, reason: 'UNAVAILABLE' }), close: () => false, destroy: () => false });
  }
  const prior = setupQuickDeckCurrentRuntimeInstallations.get(doc);
  if (prior) return prior;
  const cardLabel = (cardId) => {
    const id = String(cardId ?? '');
    const card = Array.isArray(runtimeGlobal.__CARD_DATA__)
      ? runtimeGlobal.__CARD_DATA__.find((entry) => String(entry?.id ?? '') === id)
      : null;
    return String(card?.display_name ?? card?.displayName ?? card?.name ?? card?.label ?? id);
  };
  const installation = installSetupQuickDeckRuntime({
    document: doc,
    window: win,
    getSource: () => {
      const state = runtimeGlobal.__GAMEROAD_TEST__?.state;
      return {
        selectedDeckNumber: Number(state?.selectedDeckIndex) + 1,
        savedDeck: state?.savedDeck,
        savedDeckRule: state?.savedDeckRule,
      };
    },
    getCardLabel: cardLabel,
    onEdit: () => runtimeGlobal.GAMEROAD_SCREEN_TRANSITION?.navigate?.('cards', { reason: 'detail' }),
  });
  if (installation.installed) setupQuickDeckCurrentRuntimeInstallations.set(doc, installation);
  return installation;
}
