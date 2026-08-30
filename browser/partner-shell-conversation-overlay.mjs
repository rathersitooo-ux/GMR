import { nextPartnerShellView } from './partner-shell-presentation-core.mjs';
import { mountPartnerShellRuntime } from './partner-shell-runtime-mount.mjs';

const STYLE_ID = 'gameroad-partner-shell-conversation-overlay-style';
const MOUNTED_ATTR = 'partnerHubOverlayMounted';
const ALLOWED_ACTIONS = new Set(['OPEN_ACTIVE_DETAIL', 'OPEN_CONVERSATION', 'BACK_HUB']);
const mounts = new WeakMap();

export const PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS = Object.freeze([...ALLOWED_ACTIONS]);

export function partnerConversationHubCanDispatch(action) {
  return ALLOWED_ACTIONS.has(String(action || ''));
}

export function createPartnerConversationHubInput(view = 'hub') {
  return Object.freeze({
    activePartnerId: 'partner.saasuna',
    roster: Object.freeze([
      Object.freeze({ partnerId: 'partner.saasuna', displayName: 'サースナー', portraitRef: null }),
    ]),
    view,
    detailPartnerId: 'partner.saasuna',
    formationPartnerIds: Object.freeze([]),
    strategyId: null,
  });
}

function ensureStyle(doc) {
  if (doc.getElementById?.(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[data-gr-partner-conversation="1"][data-partner-hub-overlay-mounted="1"]{position:relative}
.grPartnerHubTrigger{min-width:44px;min-height:44px;padding:7px 10px;border:1px solid rgba(158,188,255,.35);border-radius:11px;background:rgba(31,45,88,.72);color:inherit;font:inherit;font-size:10px;font-weight:900}
.grPartnerHubOverlay{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:14px;background:rgba(5,8,20,.72);backdrop-filter:blur(4px)}
.grPartnerHubOverlay[hidden]{display:none!important}
.grPartnerHubPanel{width:min(430px,94%);max-height:92%;overflow:auto;border:1px solid rgba(190,211,255,.3);border-radius:16px;background:linear-gradient(160deg,#111a36,#0b1024);box-shadow:0 18px 55px rgba(0,0,0,.45);padding:12px;color:#f7f8ff}
.grPartnerHubPanelHead{display:flex;align-items:center;justify-content:flex-end;min-height:44px}
.grPartnerHubClose,.grPartnerHubPanel .partner-shell-action{min-width:44px;min-height:44px;border:1px solid rgba(190,211,255,.25);border-radius:11px;background:rgba(34,48,90,.74);color:inherit;font:inherit;font-weight:900}
.grPartnerHubClose{padding:7px 11px}.grPartnerHubShell{padding:0 4px 6px}.grPartnerHubPanel .partner-shell-menu,.grPartnerHubPanel .partner-shell-navigation{display:grid;gap:8px}
`;
  doc.head?.append?.(style);
}

function isConversationRoot(root) {
  return Boolean(root && root.dataset?.grPartnerConversation === '1' && root.ownerDocument?.createElement);
}

export function mountPartnerConversationHubOverlay({ conversationRoot } = {}) {
  if (!isConversationRoot(conversationRoot)) {
    throw new TypeError('conversationRoot must be the mounted Partner conversation surface');
  }
  if (mounts.has(conversationRoot)) return mounts.get(conversationRoot);

  const doc = conversationRoot.ownerDocument;
  ensureStyle(doc);

  const header = conversationRoot.querySelector?.('.grPartnerConversationHead') || conversationRoot;
  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 'grPartnerHubTrigger';
  trigger.dataset.partnerHubTrigger = '1';
  trigger.textContent = 'パートナー';
  trigger.setAttribute?.('aria-haspopup', 'dialog');
  trigger.setAttribute?.('aria-expanded', 'false');
  trigger.setAttribute?.('aria-label', 'パートナーメニューを開く');

  const overlay = doc.createElement('section');
  overlay.className = 'grPartnerHubOverlay';
  overlay.dataset.partnerHubOverlay = '1';
  overlay.hidden = true;
  overlay.setAttribute?.('role', 'dialog');
  overlay.setAttribute?.('aria-modal', 'true');
  overlay.setAttribute?.('aria-label', 'パートナー');

  const panel = doc.createElement('div');
  panel.className = 'grPartnerHubPanel';
  const panelHead = doc.createElement('div');
  panelHead.className = 'grPartnerHubPanelHead';
  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'grPartnerHubClose';
  closeButton.dataset.partnerHubClose = '1';
  closeButton.textContent = '会話へ戻る';
  const shellRoot = doc.createElement('div');
  shellRoot.className = 'grPartnerHubShell';
  panelHead.append(closeButton);
  panel.append(panelHead, shellRoot);
  overlay.append(panel);
  header.append(trigger);
  conversationRoot.append(overlay);
  conversationRoot.dataset[MOUNTED_ATTR] = '1';

  let destroyed = false;
  let open = false;
  let view = 'hub';

  const shell = mountPartnerShellRuntime({
    root: shellRoot,
    getInput: () => createPartnerConversationHubInput(view),
    canDispatch: (action) => partnerConversationHubCanDispatch(action),
    onAction: ({ action }) => {
      if (action === 'OPEN_CONVERSATION') {
        close();
        return;
      }
      const next = nextPartnerShellView(view, action);
      if (next !== view) {
        view = next;
        shell.render();
      }
    },
  });

  function snapshot() {
    return Object.freeze({
      mounted: !destroyed,
      open,
      view,
      activePartnerId: 'partner.saasuna',
      directConversationDefault: true,
      conversationDomPreserved: true,
      allowedActions: PARTNER_CONVERSATION_HUB_ALLOWED_ACTIONS,
    });
  }

  function openHub() {
    if (destroyed) return snapshot();
    view = 'hub';
    const result = shell.render();
    if (!result.ok) return snapshot();
    open = true;
    overlay.hidden = false;
    trigger.setAttribute?.('aria-expanded', 'true');
    return snapshot();
  }

  function close() {
    if (destroyed) return snapshot();
    open = false;
    overlay.hidden = true;
    trigger.setAttribute?.('aria-expanded', 'false');
    return snapshot();
  }

  function onBackdropClick(event) {
    if (event?.target !== overlay) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    close();
  }

  function onPanelClick(event) {
    event?.stopPropagation?.();
  }

  function onKeyDown(event) {
    if (open && event?.key === 'Escape') {
      event.preventDefault?.();
      event.stopPropagation?.();
      close();
    }
  }

  trigger.addEventListener('click', openHub);
  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', onBackdropClick);
  panel.addEventListener('click', onPanelClick);
  doc.addEventListener?.('keydown', onKeyDown);

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    shell.destroy();
    doc.removeEventListener?.('keydown', onKeyDown);
    trigger.remove?.();
    overlay.remove?.();
    delete conversationRoot.dataset[MOUNTED_ATTR];
    mounts.delete(conversationRoot);
    return true;
  }

  const api = Object.freeze({ open: openHub, close, destroy, snapshot });
  mounts.set(conversationRoot, api);
  return api;
}
