import {
  projectBattleCardZoneInformation,
  requestBattleCardZoneDetail,
} from './battle-card-zone-information-core.mjs';

function requireDocument(doc) {
  if (!doc || typeof doc.createElement !== 'function') {
    throw new TypeError('document with createElement is required');
  }
  return doc;
}

function requireHost(host) {
  if (!host || typeof host.appendChild !== 'function') {
    throw new TypeError('host with appendChild is required');
  }
  return host;
}

function clearChildren(node) {
  if (typeof node.replaceChildren === 'function') {
    node.replaceChildren();
    return;
  }
  while (node.firstChild && typeof node.removeChild === 'function') {
    node.removeChild(node.firstChild);
  }
}

function setExpanded(button, expanded) {
  if (typeof button.setAttribute === 'function') {
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
}

/**
 * Presentation-only graveyard/card-zone information surface.
 *
 * The caller owns the snapshot and all visibility permissions. This mount only:
 * - projects the caller-supplied viewer-safe snapshot through the existing core;
 * - renders the permitted count/recent/list fields;
 * - validates a visible cardId again before handing a detail request back to the
 *   caller's already-existing card-detail seam.
 *
 * It never owns card-zone storage, ordering, transitions, card metadata,
 * gameplay rules, or game-state writes.
 */
export function mountBattleCardZoneInformationRuntimeSurface({
  document: documentInput = globalThis.document,
  host,
  label = '墓地',
  onCardDetailRequest = null,
} = {}) {
  const doc = requireDocument(documentInput);
  const mountHost = requireHost(host);
  if (onCardDetailRequest !== null && typeof onCardDetailRequest !== 'function') {
    throw new TypeError('onCardDetailRequest must be a function or null');
  }

  const root = doc.createElement('section');
  root.className = 'grBattleCardZoneInfo';
  root.hidden = true;
  root.dataset.presentationOnly = 'true';
  root.dataset.gameplayAuthority = 'false';
  root.dataset.gameStateWrite = 'false';
  root.dataset.viewerSafeBoundary = 'required';

  const entryButton = doc.createElement('button');
  entryButton.type = 'button';
  entryButton.className = 'grBattleCardZoneInfoEntry';
  entryButton.textContent = label;
  entryButton.dataset.action = 'open-card-zone-info';
  setExpanded(entryButton, false);

  const panel = doc.createElement('section');
  panel.className = 'grBattleCardZoneInfoPanel';
  panel.hidden = true;
  panel.dataset.role = 'card-zone-info-panel';

  const recent = doc.createElement('p');
  recent.className = 'grBattleCardZoneInfoRecent';
  recent.hidden = true;

  const list = doc.createElement('div');
  list.className = 'grBattleCardZoneInfoList';
  list.hidden = true;

  panel.appendChild(recent);
  panel.appendChild(list);
  root.appendChild(entryButton);
  root.appendChild(panel);
  mountHost.appendChild(root);

  let model = null;
  let open = false;
  let destroyed = false;

  function setOpen(next) {
    const hasExpandableContent = model?.visible === true
      && (model.recentVisible === true || model.listVisible === true);
    open = Boolean(next) && hasExpandableContent;
    panel.hidden = !open;
    setExpanded(entryButton, open);
    return open;
  }

  function resetVisibleContent() {
    recent.textContent = '';
    recent.hidden = true;
    list.hidden = true;
    clearChildren(list);
    setOpen(false);
  }

  function render(snapshot) {
    if (destroyed) return null;

    model = projectBattleCardZoneInformation(snapshot);
    resetVisibleContent();

    if (model.visible !== true || model.entryVisible !== true) {
      root.hidden = true;
      entryButton.textContent = label;
      return model;
    }

    root.hidden = false;
    entryButton.textContent = model.countVisible
      ? `${label} ${model.count}`
      : label;

    if (model.recentVisible === true) {
      recent.hidden = false;
      recent.textContent = model.recentCardId == null
        ? '直近 なし'
        : `直近 ${model.recentCardId}`;
    }

    if (model.listVisible === true) {
      list.hidden = false;
      for (const cardId of model.cardIds) {
        const cardButton = doc.createElement('button');
        cardButton.type = 'button';
        cardButton.className = 'grBattleCardZoneInfoCard';
        cardButton.textContent = cardId;
        cardButton.dataset.cardId = cardId;
        cardButton.disabled = model.detailEnabled !== true;
        cardButton.onclick = () => {
          const authorizedCardId = requestBattleCardZoneDetail(model, cardId);
          if (authorizedCardId === null || onCardDetailRequest === null) return false;
          onCardDetailRequest(authorizedCardId);
          return true;
        };
        list.appendChild(cardButton);
      }
    }

    return model;
  }

  entryButton.onclick = () => setOpen(!open);
  render(null);

  return Object.freeze({
    root,
    entryButton,
    panel,
    recent,
    list,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    render,
    close() {
      return setOpen(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      model = null;
      resetVisibleContent();
      root.hidden = true;
      if (typeof root.remove === 'function') root.remove();
    },
  });
}
