// 「あと何枚」の画面への取り付け。対戦画面の上に、4人全員の
// 「顔（名前の最初の1文字の丸）＋すぐ下に大きな『あと○枚』の印」を並べる。
// MTGアリーナの「顔の絵のすぐ下の大きな数字」と同じ考え方。
// 数字は公開情報（道の枚数）だけから数えるため、プレイヤーにも
// 見ている人（観戦者）にも同じ表示を出せる。
// 表示専用。対戦の状態・勝敗・門の判定は変えない。
// 残りが減った瞬間は印が1回だけ大きく膨らむ（動きを減らす設定では膨らまない）。
// 残り1枚は金色で「リーチ」、7枚そろったら「門が開いた！」と出す（勝ちとは言わない）。
import {
  BATTLE_REMAINING_TO_SEVEN_CORE,
  projectRemainingToSeven,
} from './battle-remaining-to-seven-core.mjs';

export const BATTLE_REMAINING_TO_SEVEN_RUNTIME_SCHEMA = 'gameroad.battle-remaining-to-seven-runtime.v1';

const ROOT_ATTR = 'data-battle-remaining-to-seven';
const STYLE_ID = 'gameroad-battle-remaining-to-seven-style';
const POLL_MS = 400;
const BUMP_MS = 900;

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function isElement(value) {
  return !!value && typeof value.appendChild === 'function' && typeof value.setAttribute === 'function';
}

function addStyle(document) {
  if (typeof document.getElementById === 'function' && document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
[${ROOT_ATTR}="1"]{position:absolute;top:46px;left:50%;transform:translateX(-50%);z-index:26;display:flex;gap:10px;align-items:flex-start;pointer-events:none;font-family:inherit}
[${ROOT_ATTR}="1"] .grRemainPlayer{display:flex;flex-direction:column;align-items:center;min-width:86px;padding:6px 8px 7px;border-radius:14px;background:rgba(3,20,17,.72);border:1px solid rgba(225,244,215,.16);color:#eef7ea;box-shadow:0 6px 18px rgba(0,0,0,.28)}
[${ROOT_ATTR}="1"] .grRemainAvatar{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:linear-gradient(145deg,#31594c,#16281f);border:2px solid rgba(238,247,234,.55);font-size:19px;font-weight:1000;line-height:1}
[${ROOT_ATTR}="1"] .grRemainName{margin-top:3px;max-width:86px;font-size:10px;font-weight:900;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[${ROOT_ATTR}="1"] .grRemainSeat{font-size:8px;font-weight:800;opacity:.66;letter-spacing:.08em}
[${ROOT_ATTR}="1"] .grRemainBadge{margin-top:4px;display:flex;align-items:baseline;gap:2px;padding:2px 10px 3px;border-radius:999px;background:#eef7ea;color:#0d2a20;box-shadow:0 3px 10px rgba(0,0,0,.35)}
[${ROOT_ATTR}="1"] .grRemainBadge small{font-size:11px;font-weight:1000}
[${ROOT_ATTR}="1"] .grRemainBadge b{font-size:30px;font-weight:1000;line-height:1}
[${ROOT_ATTR}="1"] .grRemainBadge em{font-size:11px;font-weight:1000;font-style:normal}
[${ROOT_ATTR}="1"] .grRemainDetail{margin-top:4px;font-size:8.5px;font-weight:800;opacity:.78;white-space:nowrap}
[${ROOT_ATTR}="1"] .grRemainDots{display:flex;gap:3px;margin-top:4px}
[${ROOT_ATTR}="1"] .grRemainDots i{width:9px;height:9px;border-radius:50%;background:rgba(238,247,234,.22);border:1px solid rgba(238,247,234,.35)}
[${ROOT_ATTR}="1"] .grRemainDots i.on{background:#ffd94d;border-color:#ffe98a;box-shadow:0 0 6px rgba(255,217,77,.75)}
[${ROOT_ATTR}="1"] [data-state="reach"]{border-color:rgba(255,217,77,.85);box-shadow:0 0 0 1px rgba(255,217,77,.45),0 6px 18px rgba(0,0,0,.28)}
[${ROOT_ATTR}="1"] [data-state="reach"] .grRemainBadge{background:#ffd94d;color:#3a2a00}
[${ROOT_ATTR}="1"] [data-state="gate_open"]{border-color:rgba(126,255,178,.9);box-shadow:0 0 0 1px rgba(126,255,178,.5),0 6px 18px rgba(0,0,0,.28)}
[${ROOT_ATTR}="1"] [data-state="gate_open"] .grRemainBadge{background:#7effb2;color:#06351a;font-size:15px;font-weight:1000;padding:6px 12px}
[${ROOT_ATTR}="1"] [data-leader="true"] .grRemainAvatar{border-color:#ffd94d;box-shadow:0 0 10px rgba(255,217,77,.65)}
[${ROOT_ATTR}="1"] .grRemainBadge.bump{animation:grRemainBump .9s ease-out}
@keyframes grRemainBump{0%{transform:scale(1)}25%{transform:scale(1.38)}55%{transform:scale(1.12)}100%{transform:scale(1)}}
@media(max-width:720px){[${ROOT_ATTR}="1"]{gap:5px;top:40px}[${ROOT_ATTR}="1"] .grRemainPlayer{min-width:64px;padding:4px 5px 5px}[${ROOT_ATTR}="1"] .grRemainAvatar{width:30px;height:30px;font-size:14px}[${ROOT_ATTR}="1"] .grRemainBadge b{font-size:22px}[${ROOT_ATTR}="1"] .grRemainName{max-width:64px;font-size:8.5px}[${ROOT_ATTR}="1"] .grRemainDetail{display:none}}
@media(prefers-reduced-motion:reduce){[${ROOT_ATTR}="1"] .grRemainBadge.bump{animation:none}}
`;
  document.head?.appendChild?.(style);
  if (!document.head && document.body) document.body.appendChild(style);
}

function createNode(document, tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function createBattleRemainingToSevenMount({
  getMatch,
  getHost,
  getSettings = () => ({}),
  timers = null,
} = {}) {
  if (typeof getMatch !== 'function') throw new TypeError('REMAINING_GET_MATCH_REQUIRED');
  if (typeof getHost !== 'function') throw new TypeError('REMAINING_GET_HOST_REQUIRED');

  const setTimeoutFn = timers?.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearTimeoutFn = timers?.clearTimeout ?? ((id) => globalThis.clearTimeout(id));
  const setIntervalFn = timers?.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const clearIntervalFn = timers?.clearInterval ?? ((id) => globalThis.clearInterval(id));

  let root = null;
  let chips = new Map();
  let previousRemaining = new Map();
  let lastModel = null;
  let intervalId = null;
  let destroyed = false;
  const bumpTimers = new Map();

  function buildChip(document, row) {
    const chip = createNode(document, 'div', 'grRemainPlayer');
    chip.setAttribute('data-player', row.playerId);
    const avatar = createNode(document, 'span', 'grRemainAvatar', row.name.slice(0, 1));
    avatar.setAttribute('aria-hidden', 'true');
    chip.appendChild(avatar);
    const name = createNode(document, 'span', 'grRemainName', row.name);
    chip.appendChild(name);
    const seat = createNode(document, 'span', 'grRemainSeat', row.team ? `${row.seat}・${row.team}組` : row.seat);
    chip.appendChild(seat);
    const badge = createNode(document, 'div', 'grRemainBadge');
    badge.setAttribute('data-role', 'badge');
    chip.appendChild(badge);
    const detail = createNode(document, 'span', 'grRemainDetail');
    detail.setAttribute('data-role', 'detail');
    chip.appendChild(detail);
    const dots = createNode(document, 'div', 'grRemainDots');
    dots.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < row.target; index += 1) {
      dots.appendChild(createNode(document, 'i'));
    }
    chip.appendChild(dots);
    return { chip, badge, detail, dots };
  }

  function fillBadge(document, parts, row) {
    while (parts.badge.children.length) parts.badge.removeChild(parts.badge.children[0]);
    if (row.state === 'gate_open') {
      parts.badge.textContent = '門が開いた！';
      return;
    }
    parts.badge.textContent = '';
    parts.badge.appendChild(createNode(document, 'small', '', 'あと'));
    parts.badge.appendChild(createNode(document, 'b', '', String(row.remaining)));
    parts.badge.appendChild(createNode(document, 'em', '', '枚'));
  }

  function sync() {
    if (destroyed) return null;
    let match = null;
    try { match = getMatch(); } catch { match = null; }
    let host = null;
    try { host = getHost(); } catch { host = null; }
    if (!match || !Array.isArray(match.players) || match.players.length < 2 || !isElement(host)) {
      if (root) root.hidden = true;
      lastModel = null;
      return null;
    }
    const document = host.ownerDocument ?? globalThis.document;
    if (!document || typeof document.createElement !== 'function') return null;

    let settings = {};
    try { settings = getSettings() || {}; } catch { settings = {}; }
    const reducedMotion = settings.reducedMotion === true;

    if (!root) {
      addStyle(document);
      root = createNode(document, 'div', 'grBattleRemainingToSeven');
      root.setAttribute(ROOT_ATTR, '1');
      root.dataset.presentationOnly = 'true';
      root.setAttribute('aria-label', '7枚まであと何枚');
      root.setAttribute('aria-live', 'polite');
      host.appendChild(root);
    }
    root.hidden = false;

    const model = projectRemainingToSeven({ players: match.players });
    lastModel = model;

    const seen = new Set();
    for (const row of model.players) {
      seen.add(row.playerId);
      let parts = chips.get(row.playerId);
      if (!parts) {
        parts = buildChip(document, row);
        chips.set(row.playerId, parts);
        root.appendChild(parts.chip);
        previousRemaining.set(row.playerId, row.remaining);
      }
      parts.chip.setAttribute('data-state', row.state);
      parts.chip.setAttribute('data-leader', row.isLeader ? 'true' : 'false');
      parts.chip.setAttribute('aria-label', row.ariaText);
      fillBadge(document, parts, row);
      parts.detail.textContent = row.detailText;
      const dotNodes = parts.dots.children;
      for (let index = 0; index < dotNodes.length; index += 1) {
        dotNodes[index].className = index < row.completed ? 'on' : '';
      }
      const before = previousRemaining.get(row.playerId);
      if (before !== undefined && row.remaining < before && !reducedMotion) {
        parts.badge.classList?.add?.('bump');
        if (bumpTimers.has(row.playerId)) {
          try { clearTimeoutFn(bumpTimers.get(row.playerId)); } catch { /* なし */ }
        }
        const id = setTimeoutFn(() => {
          parts.badge.classList?.remove?.('bump');
          bumpTimers.delete(row.playerId);
        }, BUMP_MS);
        bumpTimers.set(row.playerId, id);
      }
      previousRemaining.set(row.playerId, row.remaining);
    }
    for (const [playerId, parts] of chips.entries()) {
      if (seen.has(playerId)) continue;
      if (parts.chip.parentNode?.removeChild) parts.chip.parentNode.removeChild(parts.chip);
      chips.delete(playerId);
      previousRemaining.delete(playerId);
    }
    root.setAttribute('aria-label', `7枚まであと何枚。${model.players.map((row) => row.ariaText).join('。')}`);
    return model;
  }

  function start() {
    if (intervalId !== null || destroyed) return false;
    sync();
    intervalId = setIntervalFn(() => { sync(); }, POLL_MS);
    return true;
  }

  function destroy() {
    if (destroyed) return false;
    destroyed = true;
    if (intervalId !== null) {
      try { clearIntervalFn(intervalId); } catch { /* なし */ }
      intervalId = null;
    }
    for (const id of bumpTimers.values()) {
      try { clearTimeoutFn(id); } catch { /* なし */ }
    }
    bumpTimers.clear();
    if (root?.parentNode?.removeChild) root.parentNode.removeChild(root);
    root = null;
    chips = new Map();
    return true;
  }

  function snapshot() {
    return freeze({
      schema: BATTLE_REMAINING_TO_SEVEN_RUNTIME_SCHEMA,
      mounted: root !== null,
      hidden: root ? root.hidden === true : true,
      polling: intervalId !== null,
      model: lastModel,
    });
  }

  return freeze({
    schema: BATTLE_REMAINING_TO_SEVEN_RUNTIME_SCHEMA,
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    sync,
    start,
    destroy,
    snapshot,
    get root() { return root; },
  });
}

export const BATTLE_REMAINING_TO_SEVEN_RUNTIME = freeze({
  schema: BATTLE_REMAINING_TO_SEVEN_RUNTIME_SCHEMA,
  coreSchema: BATTLE_REMAINING_TO_SEVEN_CORE.schema,
  presentationOnly: true,
  gameplayAuthority: false,
  gameStateWrite: false,
  pollMs: POLL_MS,
  bumpMs: BUMP_MS,
});
