// サイキックリンクの試作の見せ方。DOM だけ。ゲーム本体にはつながない。
// 演出はデュエプレ研究所#38の 19:35〜19:44 で見た流れ：
// 3枚＋間の稲妻 → 合体後カードの全画面 → 白い縦の光の柱 → 盤面に合体後1体。
// 途中のタップで飛ばして、すぐ合体後の盤面へ行く。

import {
  PSYCHIC_LINK_COMPONENTS,
  PSYCHIC_LINK_IMAGE_BASE,
  PSYCHIC_LINK_SUPER,
  PSYCHIC_LINK_TIMELINE,
  applyLink,
  applyUnlink,
  canLink,
  canUnlink,
  createPsychicLinkState,
  describeBoard,
} from './psychic-link-core.mjs';

const STYLE_ID = 'psychic-link-demo-style';
const STYLE_TEXT = `
.psychic-link { font-family: sans-serif; color: #fff; max-width: 960px; margin: 0 auto; padding: 16px; }
.psychic-link h1 { font-size: 20px; margin: 0 0 4px; }
.psychic-link .notice { font-size: 12px; color: #ffd75e; margin: 0 0 16px; }
.psychic-link-board {
  position: relative; min-height: 340px; border-radius: 12px; padding: 20px;
  background:
    linear-gradient(rgba(70, 130, 255, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(70, 130, 255, 0.12) 1px, transparent 1px),
    #0a1030;
  background-size: 48px 48px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.psychic-link-cards { display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap; }
.psychic-link-card { width: 150px; text-align: center; }
.psychic-link-card.super { width: 190px; }
.psychic-link-card img {
  width: 100%; aspect-ratio: 5 / 7; object-fit: cover; display: block;
  border-radius: 8px; border: 2px solid #35507a; background: #111;
}
.psychic-link-card.super img { border-color: #37d67a; box-shadow: 0 0 24px rgba(55, 214, 122, 0.8); }
.psychic-link-card .name { font-size: 13px; margin-top: 6px; min-height: 2.4em; }
.psychic-link-card .spec { font-size: 12px; color: #bcd; }
.psychic-link-card .spec b { color: #fff; }
.psychic-link-lightning { font-size: 28px; color: #cfe6ff; text-shadow: 0 0 12px #7db4ff, 0 0 24px #fff; animation: psychic-link-zap 0.35s infinite alternate; }
@keyframes psychic-link-zap { from { opacity: 0.6; } to { opacity: 1; } }
.psychic-link-actions { margin-top: 16px; display: flex; gap: 12px; }
.psychic-link-actions button {
  font-size: 16px; padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
  background: #f5a623; color: #201400; font-weight: bold;
}
.psychic-link-actions button:disabled { background: #555; color: #aaa; cursor: default; }
.psychic-link-actions button.ghost { background: #2a3350; color: #cfe0ff; }
.psychic-link-fullscreen {
  position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 50%, #0d2b18 0%, #04120a 55%, #000 100%);
  cursor: pointer;
}
.psychic-link-fullscreen img {
  height: min(78vh, 640px); aspect-ratio: 5 / 7; object-fit: cover; border-radius: 10px;
  border: 3px solid #37d67a; box-shadow: 0 0 48px rgba(55, 214, 122, 0.9), 0 0 120px rgba(255, 255, 255, 0.35);
}
.psychic-link-fullscreen .caption { position: absolute; bottom: 6vh; left: 0; right: 0; text-align: center; font-size: 18px; color: #d9ffe6; text-shadow: 0 0 12px #37d67a; }
.psychic-link-flash {
  position: fixed; inset: 0; z-index: 50; pointer-events: none;
  background: linear-gradient(90deg, transparent 30%, rgba(255, 255, 255, 0.95) 46%, #fff 50%, rgba(255, 255, 255, 0.95) 54%, transparent 70%);
  opacity: 0;
}
.psychic-link-flash.on { opacity: 1; transition: opacity 0.12s ease-in; }
.psychic-link-flash.off { opacity: 0; transition: opacity 0.7s ease-out; }
`;

function cardNode(card, { superCard = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'psychic-link-card' + (superCard ? ' super' : '');
  wrap.dataset.cardId = card.id;
  const img = document.createElement('img');
  img.src = PSYCHIC_LINK_IMAGE_BASE + card.image;
  img.alt = card.name;
  const name = document.createElement('div');
  name.className = 'name';
  name.textContent = card.name;
  const spec = document.createElement('div');
  spec.className = 'spec';
  spec.innerHTML = '';
  const cost = document.createElement('span');
  cost.innerHTML = 'コスト <b></b>';
  cost.querySelector('b').textContent = String(card.cost);
  const power = document.createElement('span');
  power.innerHTML = ' / パワー <b></b>';
  power.querySelector('b').textContent = card.powerLabel;
  spec.append(cost, power);
  wrap.append(img, name, spec);
  return wrap;
}

export function createPsychicLinkMount({ getHost, timers = null } = {}) {
  const clock = timers || {
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };
  let state = createPsychicLinkState();
  let host = null;
  let board = null;
  let linkButton = null;
  let unlinkButton = null;
  let timerIds = [];
  let fullscreen = null;
  let flash = null;
  let destroyed = false;

  function clearTimers() {
    timerIds.forEach((id) => clock.clearTimeout(id));
    timerIds = [];
  }

  function hideOverlays() {
    if (fullscreen) { fullscreen.remove(); fullscreen = null; }
    if (flash) { flash.remove(); flash = null; }
  }

  function renderBoard() {
    board.innerHTML = '';
    const { shown } = describeBoard(state);
    const row = document.createElement('div');
    row.className = 'psychic-link-cards';
    if (state.status === 'linked') {
      row.append(cardNode(shown[0], { superCard: true }));
    } else {
      shown.forEach((card, index) => {
        if (index > 0) {
          const bolt = document.createElement('span');
          bolt.className = 'psychic-link-lightning';
          bolt.textContent = '⚡';
          bolt.hidden = state.status !== 'linking';
          bolt.dataset.role = 'lightning';
          row.append(bolt);
        }
        row.append(cardNode(card));
      });
    }
    board.append(row);
    linkButton.disabled = !canLink(state);
    unlinkButton.disabled = !canUnlink(state);
  }

  function showFullscreen() {
    hideOverlays();
    fullscreen = document.createElement('div');
    fullscreen.className = 'psychic-link-fullscreen';
    const img = document.createElement('img');
    img.src = PSYCHIC_LINK_IMAGE_BASE + PSYCHIC_LINK_SUPER.image;
    img.alt = PSYCHIC_LINK_SUPER.name;
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = PSYCHIC_LINK_SUPER.name;
    fullscreen.append(img, caption);
    fullscreen.addEventListener('click', skipToLinked);
    document.body.append(fullscreen);
  }

  function showFlash() {
    if (fullscreen) { fullscreen.remove(); fullscreen = null; }
    flash = document.createElement('div');
    flash.className = 'psychic-link-flash on';
    document.body.append(flash);
    timerIds.push(clock.setTimeout(() => {
      if (flash) flash.className = 'psychic-link-flash off';
    }, 150));
  }

  function finishLink() {
    clearTimers();
    hideOverlays();
    state = applyLink(state);
    renderBoard();
  }

  function skipToLinked() {
    if (state.status !== 'linking') return;
    finishLink();
  }

  function startLink() {
    if (!canLink(state)) return;
    state = { ...state, status: 'linking' };
    renderBoard();
    board.querySelectorAll('[data-role="lightning"]').forEach((el) => { el.hidden = false; });
    PSYCHIC_LINK_TIMELINE.forEach((step) => {
      if (step.phase === 'components-lightning') return;
      timerIds.push(clock.setTimeout(() => {
        if (destroyed || state.status !== 'linking') return;
        if (step.phase === 'super-fullscreen') showFullscreen();
        if (step.phase === 'white-flash') showFlash();
        if (step.phase === 'linked') finishLink();
      }, step.atMs));
    });
  }

  function startUnlink() {
    if (!canUnlink(state)) return;
    hideOverlays();
    state = applyUnlink(state);
    renderBoard();
  }

  function present() {
    host = getHost();
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE_TEXT;
      document.head.append(style);
    }
    host.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'psychic-link';
    const title = document.createElement('h1');
    title.textContent = 'サイキックリンクの試作';
    const notice = document.createElement('p');
    notice.className = 'notice';
    notice.textContent = '仮の絵です。デュエマのカード画像を使っています。あとで差し替えます。';
    board = document.createElement('div');
    board.className = 'psychic-link-board';
    const actions = document.createElement('div');
    actions.className = 'psychic-link-actions';
    linkButton = document.createElement('button');
    linkButton.type = 'button';
    linkButton.textContent = 'リンクする';
    linkButton.addEventListener('click', startLink);
    unlinkButton = document.createElement('button');
    unlinkButton.type = 'button';
    unlinkButton.className = 'ghost';
    unlinkButton.textContent = 'リンク解除';
    unlinkButton.addEventListener('click', startUnlink);
    actions.append(linkButton, unlinkButton);
    const hint = document.createElement('p');
    hint.className = 'notice';
    hint.style.color = '#9fb2d8';
    hint.textContent = '3枚がそろうと1体になります。中の3枚は残したまま、表示だけ1枚へ切り替えます。途中のタップで飛ばせます。';
    root.append(title, notice, board, actions, hint);
    host.append(root);
    board.addEventListener('click', skipToLinked);
    renderBoard();
    return { getState: () => state };
  }

  function destroy() {
    destroyed = true;
    clearTimers();
    hideOverlays();
    if (host) host.innerHTML = '';
  }

  return { present, destroy, getState: () => state };
}

export { PSYCHIC_LINK_COMPONENTS, PSYCHIC_LINK_SUPER };
