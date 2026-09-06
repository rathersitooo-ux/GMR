import { projectBattleBoardVisualExplanation } from './battle-board-visual-explanation-core.mjs';
import { projectPartnerAdviceBoardEmphasis } from './partner-advice-runtime-mount.mjs';

const NODE = '#board .node[data-pos]';
const ROLES = 'data-board-visual-roles';
const SUMMARY = 'battleBoardVisualExplanationSummary';
const PROVIDER = '__GAMEROAD_BOARD_PARTNER_ADVICE_AUTHORITY__';

function token(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v === value && v.length <= 160 ? v : null;
}

function partnerProjection(win, valid) {
  const p = win?.[PROVIDER];
  if (!p || typeof p.getAdviceResult !== 'function' || typeof p.isCurrent !== 'function' || typeof p.resolveTarget !== 'function') return null;
  try {
    return projectPartnerAdviceBoardEmphasis({
      adviceResult: p.getAdviceResult(),
      isCurrent: p.isCurrent,
      resolveTarget: (candidateId) => {
        const raw = p.resolveTarget(candidateId);
        const id = token(typeof raw === 'string' ? raw : raw?.targetId);
        return id && valid.has(id) ? { targetId: id } : null;
      },
    });
  } catch {
    return null;
  }
}

export function collectBattleBoardRuntimeAuthority(win = globalThis) {
  const doc = win?.document;
  if (!doc) return null;
  const nodes = [...(doc.querySelectorAll?.(NODE) || [])];
  const ids = [...new Set(nodes.map(n => token(n?.dataset?.pos)).filter(Boolean))];
  if (!ids.length) return null;
  const valid = new Set(ids);
  const reachable = [...new Set(nodes.filter(n => n?.classList?.contains?.('reachable')).map(n => token(n?.dataset?.pos)).filter(id => id && valid.has(id)))];
  const endpoint = token(doc.getElementById?.('endpointText')?.textContent || '');
  return Object.freeze({
    validPositionIds: Object.freeze(ids),
    reachablePositionIds: Object.freeze(reachable),
    selectedPositionId: endpoint && valid.has(endpoint) ? endpoint : null,
    partnerProjection: partnerProjection(win, valid),
  });
}

export function projectBattleBoardRuntimeExplanation(authority = {}) {
  return projectBattleBoardVisualExplanation(authority);
}

function installStyle(doc) {
  if (doc.getElementById?.('gameroad-board-visual-explanation-runtime-style')) return;
  const style = doc.createElement('style');
  style.id = 'gameroad-board-visual-explanation-runtime-style';
  style.textContent = `#${SUMMARY}{display:inline-flex;gap:5px;margin-inline-start:5px;padding:2px 5px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(3,16,15,.64);font-size:9px;font-weight:900;pointer-events:none}#${SUMMARY}[hidden],#${SUMMARY} [hidden]{display:none!important}${NODE}[${ROLES}~="selected"]{outline:2px solid rgba(255,255,255,.92);outline-offset:2px}${NODE}[${ROLES}~="partner-recommendation"]{box-shadow:0 0 0 2px rgba(255,222,130,.9)}@media(max-width:540px),(max-height:420px){#${SUMMARY}{font-size:8px;padding:2px 4px}}@media(prefers-reduced-motion:reduce){#${SUMMARY},${NODE}[${ROLES}]{transition:none!important;animation:none!important}}`;
  doc.head?.appendChild(style);
}

function installSummary(doc) {
  const current = doc.getElementById?.(SUMMARY);
  if (current) return current;
  const endpoint = doc.getElementById?.('endpointText');
  if (!endpoint?.parentNode?.insertBefore) return null;
  const root = doc.createElement('span');
  root.id = SUMMARY;
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = '<span data-r>移動可能 <b>0</b></span><span data-s hidden>選択 <b>—</b></span><span data-p hidden>おすすめ <b>—</b></span>';
  endpoint.parentNode.insertBefore(root, endpoint.nextSibling || null);
  return root;
}

function render(doc, root, projection) {
  for (const n of doc.querySelectorAll?.(`${NODE}[${ROLES}]`) || []) n.removeAttribute?.(ROLES);
  if (!projection?.ok) {
    if (root) root.hidden = true;
    return;
  }
  const byId = new Map([...(doc.querySelectorAll?.(NODE) || [])].map(n => [n?.dataset?.pos, n]));
  for (const [id, roles] of Object.entries(projection.rolesByPosition || {})) {
    if (roles?.length) byId.get(id)?.setAttribute?.(ROLES, roles.join(' '));
  }
  if (!root) return;
  const reachable = projection.channels.reachable.length;
  const selected = projection.channels.selected[0] || null;
  const partner = projection.recommendation.active ? projection.recommendation.targetId : null;
  root.querySelector?.('[data-r] b')?.replaceChildren?.(String(reachable));
  const s = root.querySelector?.('[data-s]');
  if (s) { s.hidden = !selected; if (selected) s.querySelector('b').textContent = selected; }
  const p = root.querySelector?.('[data-p]');
  if (p) { p.hidden = !partner; if (partner) p.querySelector('b').textContent = partner; }
  root.hidden = reachable === 0 && !selected && !partner;
  root.dataset.gameplayAuthority = 'false';
}

export function installBattleBoardVisualExplanationRuntime(win = globalThis) {
  const doc = win?.document;
  const board = doc?.querySelector?.('#board');
  if (!doc?.getElementById?.('battleMap') || !board || typeof doc.createElement !== 'function') return null;
  installStyle(doc);
  const root = installSummary(doc);
  let dead = false;
  const sync = () => {
    if (dead) return Object.freeze({ active: false, projection: null });
    const authority = collectBattleBoardRuntimeAuthority(win);
    const projection = authority ? projectBattleBoardRuntimeExplanation(authority) : null;
    render(doc, root, projection);
    return Object.freeze({ active: projection?.ok === true, projection });
  };
  const observer = typeof win.MutationObserver === 'function' ? new win.MutationObserver(() => queueMicrotask(sync)) : null;
  observer?.observe(board, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-pos'] });
  const endpoint = doc.getElementById?.('endpointText');
  if (observer && endpoint) observer.observe(endpoint, { childList: true, characterData: true, subtree: true });
  sync();
  const control = Object.freeze({ sync, snapshot: sync, destroy() { if (dead) return false; dead = true; observer?.disconnect?.(); render(doc, root, null); root?.remove?.(); return true; } });
  win.__GAMEROAD_BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME__ = control;
  return control;
}

function autoInstall(win = globalThis) {
  const doc = win?.document;
  if (!doc) return;
  const run = () => { if (!win.__GAMEROAD_BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME__) installBattleBoardVisualExplanationRuntime(win); };
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run, { once: true }); else run();
}
autoInstall();

export const BATTLE_BOARD_VISUAL_EXPLANATION_RUNTIME = Object.freeze({ actualPositionSelector: NODE, selectedAuthority: '#endpointText', reachableAuthority: `${NODE}.reachable`, partnerProvider: PROVIDER, summaryRoot: `#${SUMMARY}`, presentationOnly: true, gameplayAuthority: false, topologyInference: false, automaticExecution: false });
