import './home-boot-runtime-mount.mjs';

const STYLE_ID = 'gameroad-homecards-2p5d-style';
const STAGE_ID = 'gameroad-homecards-2p5d-stage';
const GLOBAL_KEY = 'GAMEROAD_HOMECARDS_2P5D';

const runtime = {
  active: null,
  startedCount: 0,
  completedCount: 0,
  abortedCount: 0,
  bypassedCount: 0,
  lastPhase: 'IDLE',
  lastProfile: null,
  lastRoute: null,
};

export function isHomeCardsForward(context = {}) {
  return context?.from === 'home' && context?.to === 'cards';
}

export function presentationDurations(profile = 'full') {
  if (profile === 'none') return Object.freeze({ exit: 0, enter: 0 });
  if (profile === 'reduced') return Object.freeze({ exit: 52, enter: 58 });
  return Object.freeze({ exit: 178, enter: 214 });
}

export function computeHeroGeometry(sourceRect, viewport) {
  const width = Math.max(1, Number(sourceRect?.width) || 1);
  const height = Math.max(1, Number(sourceRect?.height) || 1);
  const left = Number(sourceRect?.left) || 0;
  const top = Number(sourceRect?.top) || 0;
  const vw = Math.max(1, Number(viewport?.width) || 1);
  const vh = Math.max(1, Number(viewport?.height) || 1);
  const sourceCx = left + width / 2;
  const sourceCy = top + height / 2;
  const heroCx = vw * 0.52;
  const heroCy = vh * 0.49;
  const heroScale = Math.min(5.2, Math.max(1.35, Math.min(vw / width, vh / height) * 0.58));
  const settleCx = vw * 0.28;
  const settleCy = vh * 0.48;
  return Object.freeze({
    sourceCx,
    sourceCy,
    heroDx: heroCx - sourceCx,
    heroDy: heroCy - sourceCy,
    heroScale,
    settleDx: settleCx - sourceCx,
    settleDy: settleCy - sourceCy,
    settleScale: Math.max(0.72, heroScale * 0.48),
  });
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${STAGE_ID}{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;perspective:1200px;transform-style:preserve-3d;contain:layout paint style;isolation:isolate}
#${STAGE_ID} .gr2p5dAtmosphere{position:absolute;inset:-14%;opacity:0;background:radial-gradient(circle at 72% 28%,color-mix(in srgb,var(--accent,#77dffc) 26%,transparent),transparent 42%),linear-gradient(125deg,color-mix(in srgb,var(--bg,#071019) 94%,black),color-mix(in srgb,var(--accent,#77dffc) 10%,var(--bg,#071019)));will-change:transform,opacity;transform:translate3d(7%,3%,0) scale(1.08)}
#${STAGE_ID} .gr2p5dSlash{position:absolute;inset:-18% -26%;opacity:0;will-change:transform,opacity;transform:translate3d(0,0,0);clip-path:polygon(0 44%,100% 5%,100% 30%,0 69%)}
#${STAGE_ID} .gr2p5dSlashA{background:linear-gradient(90deg,color-mix(in srgb,var(--accent,#77dffc) 82%,white),color-mix(in srgb,var(--accent,#77dffc) 28%,transparent));transform:translate3d(-34%,10%,80px) rotate(-4deg)}
#${STAGE_ID} .gr2p5dSlashB{background:linear-gradient(90deg,color-mix(in srgb,var(--accent2,#ffd46a) 70%,white),color-mix(in srgb,var(--accent2,#ffd46a) 18%,transparent));transform:translate3d(34%,-12%,35px) rotate(7deg);clip-path:polygon(0 66%,100% 34%,100% 49%,0 82%)}
#${STAGE_ID} .gr2p5dLines{position:absolute;inset:0;opacity:0;background:repeating-linear-gradient(112deg,transparent 0 18px,color-mix(in srgb,var(--accent,#77dffc) 22%,transparent) 19px 21px,transparent 22px 39px);transform:translate3d(9%,0,120px) scale(1.18);will-change:transform,opacity}
#${STAGE_ID} .gr2p5dHeroWrap{position:fixed;left:0;top:0;transform-style:preserve-3d;will-change:transform,opacity;backface-visibility:hidden}
#${STAGE_ID} .gr2p5dHero{display:block;width:100%;height:100%;object-fit:contain;transform:translateZ(0);filter:none;backface-visibility:hidden}
#${STAGE_ID}[data-profile="reduced"] .gr2p5dSlashB,#${STAGE_ID}[data-profile="reduced"] .gr2p5dLines{display:none}
@media (prefers-reduced-motion:reduce){#${STAGE_ID} .gr2p5dSlashB,#${STAGE_ID} .gr2p5dLines{display:none}}
`;
  document.head.append(style);
}

function motionProfile(context = {}) {
  const profile = String(context.motionProfile || 'full');
  return profile === 'none' || profile === 'reduced' ? profile : 'full';
}

function findSourceVisual() {
  const button = document.querySelector('.homePadChoice[data-home-target="cards"]');
  if (!(button instanceof HTMLElement)) return null;
  const visual = button.querySelector('.codexPadArt, img, svg, canvas') || button;
  if (!(visual instanceof HTMLElement || visual instanceof SVGElement)) return null;
  const rect = visual.getBoundingClientRect();
  if (!(rect.width > 1 && rect.height > 1)) return null;
  return { button, visual, rect };
}

function cloneVisual(visual) {
  if (visual instanceof HTMLCanvasElement) {
    const image = new Image();
    image.src = visual.toDataURL();
    image.alt = '';
    return image;
  }
  const clone = visual.cloneNode(true);
  if (clone instanceof HTMLElement) {
    clone.removeAttribute('id');
    clone.removeAttribute('tabindex');
    clone.setAttribute('aria-hidden', 'true');
  }
  return clone;
}

function cleanupActive({ aborted = false } = {}) {
  const active = runtime.active;
  if (!active) return;
  for (const animation of active.animations) {
    try { animation.cancel(); } catch {}
  }
  active.signal?.removeEventListener?.('abort', active.onAbort);
  if (active.visual instanceof HTMLElement) active.visual.style.opacity = active.previousOpacity;
  active.stage.remove();
  runtime.active = null;
  if (aborted) runtime.abortedCount += 1;
}

function makeStage(context) {
  cleanupActive();
  ensureStyle();
  const source = findSourceVisual();
  if (!source) return null;
  const profile = motionProfile(context);
  const stage = document.createElement('div');
  stage.id = STAGE_ID;
  stage.dataset.profile = profile;
  stage.dataset.route = 'home-cards';
  stage.setAttribute('aria-hidden', 'true');
  stage.innerHTML = '<div class="gr2p5dAtmosphere"></div><div class="gr2p5dSlash gr2p5dSlashA"></div><div class="gr2p5dSlash gr2p5dSlashB"></div><div class="gr2p5dLines"></div>';
  const heroWrap = document.createElement('div');
  heroWrap.className = 'gr2p5dHeroWrap';
  heroWrap.style.left = `${source.rect.left}px`;
  heroWrap.style.top = `${source.rect.top}px`;
  heroWrap.style.width = `${source.rect.width}px`;
  heroWrap.style.height = `${source.rect.height}px`;
  const hero = cloneVisual(source.visual);
  if (hero instanceof HTMLElement || hero instanceof SVGElement) hero.classList.add('gr2p5dHero');
  heroWrap.append(hero);
  stage.append(heroWrap);
  document.body.append(stage);

  const active = {
    stage,
    heroWrap,
    visual: source.visual,
    previousOpacity: source.visual instanceof HTMLElement ? source.visual.style.opacity : '',
    rect: source.rect,
    geometry: computeHeroGeometry(source.rect, { width: innerWidth, height: innerHeight }),
    animations: new Set(),
    signal: context.signal || null,
    onAbort: null,
  };
  active.onAbort = () => cleanupActive({ aborted: true });
  context.signal?.addEventListener?.('abort', active.onAbort, { once: true });
  if (source.visual instanceof HTMLElement) source.visual.style.opacity = '0';
  runtime.active = active;
  runtime.startedCount += 1;
  return active;
}

function animate(active, element, frames, options) {
  if (!element || !active) return Promise.resolve();
  const { clearAfter = false, ...animationOptions } = options || {};
  const duration = Math.max(0, Number(animationOptions.duration) || 0);
  if (!element.animate || duration === 0) {
    if (clearAfter) return Promise.resolve();
    const finalFrame = frames.at(-1) || {};
    for (const [key, value] of Object.entries(finalFrame)) {
      if (key !== 'offset' && key !== 'easing') element.style[key] = value;
    }
    return Promise.resolve();
  }
  const animation = element.animate(frames, { ...animationOptions, fill: 'forwards' });
  active.animations.add(animation);
  return animation.finished.catch(() => undefined).finally(() => {
    active.animations.delete(animation);
    if (clearAfter) {
      try { animation.cancel(); } catch {}
    }
  });
}

async function runExit(context) {
  const active = runtime.active || makeStage(context);
  if (!active) return;
  const profile = motionProfile(context);
  const { exit } = presentationDurations(profile);
  const g = active.geometry;
  const heroEnd = profile === 'reduced'
    ? `translate3d(${g.heroDx * 0.28}px,${g.heroDy * 0.28}px,0) scale(${Math.min(1.28, g.heroScale)})`
    : `translate3d(${g.heroDx}px,${g.heroDy}px,190px) rotateX(4deg) rotateY(-13deg) rotateZ(-7deg) scale(${g.heroScale})`;
  await Promise.all([
    animate(active, active.heroWrap, [
      { transform: 'translate3d(0,0,0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1)', opacity: '1', offset: 0 },
      { transform: profile === 'reduced' ? heroEnd : `translate3d(${g.heroDx * 0.34}px,${g.heroDy * 0.28}px,70px) rotateY(-5deg) rotateZ(2deg) scale(${1 + (g.heroScale - 1) * 0.26})`, opacity: '1', offset: 0.42 },
      { transform: heroEnd, opacity: '1', offset: 1 },
    ], { duration: exit, easing: profile === 'reduced' ? 'ease-out' : 'cubic-bezier(.16,.82,.18,1)' }),
    animate(active, active.stage.querySelector('.gr2p5dAtmosphere'), [
      { opacity: '0', transform: 'translate3d(7%,3%,0) scale(1.08)' },
      { opacity: profile === 'reduced' ? '.36' : '.82', transform: 'translate3d(0,0,0) scale(1)' },
    ], { duration: exit, easing: 'ease-out' }),
    animate(active, active.stage.querySelector('.gr2p5dSlashA'), [
      { opacity: '0', transform: 'translate3d(-34%,10%,80px) rotate(-4deg)' },
      { opacity: profile === 'reduced' ? '.45' : '.92', transform: 'translate3d(-2%,0,80px) rotate(-4deg)' },
    ], { duration: exit, easing: 'cubic-bezier(.2,.75,.2,1)' }),
    animate(active, active.stage.querySelector('.gr2p5dSlashB'), [
      { opacity: '0', transform: 'translate3d(34%,-12%,35px) rotate(7deg)' },
      { opacity: '.68', transform: 'translate3d(2%,0,35px) rotate(7deg)' },
    ], { duration: exit, easing: 'cubic-bezier(.2,.75,.2,1)' }),
    animate(active, active.stage.querySelector('.gr2p5dLines'), [
      { opacity: '0', transform: 'translate3d(9%,0,120px) scale(1.18)' },
      { opacity: '.52', transform: 'translate3d(-3%,0,120px) scale(1.06)' },
    ], { duration: exit, easing: 'linear' }),
  ]);
}

async function runEnter(context) {
  const active = runtime.active;
  if (!active) return;
  const profile = motionProfile(context);
  const { enter } = presentationDurations(profile);
  const g = active.geometry;
  const heroStart = profile === 'reduced'
    ? `translate3d(${g.heroDx * 0.28}px,${g.heroDy * 0.28}px,0) scale(${Math.min(1.28, g.heroScale)})`
    : `translate3d(${g.heroDx}px,${g.heroDy}px,190px) rotateX(4deg) rotateY(-13deg) rotateZ(-7deg) scale(${g.heroScale})`;
  const heroEnd = profile === 'reduced'
    ? `translate3d(${g.settleDx * 0.3}px,${g.settleDy * 0.3}px,0) scale(.94)`
    : `translate3d(${g.settleDx}px,${g.settleDy}px,-40px) rotateX(-2deg) rotateY(7deg) rotateZ(4deg) scale(${g.settleScale})`;
  const cardsScreen = document.querySelector('.screen[data-screen="cards"].active');
  await Promise.all([
    animate(active, active.heroWrap, [
      { transform: heroStart, opacity: '1', offset: 0 },
      { transform: profile === 'reduced' ? heroEnd : `translate3d(${g.settleDx + 26}px,${g.settleDy - 16}px,25px) rotateY(5deg) rotateZ(7deg) scale(${g.settleScale * 1.08})`, opacity: '.92', offset: 0.72 },
      { transform: heroEnd, opacity: '0', offset: 1 },
    ], { duration: enter, easing: profile === 'reduced' ? 'ease-out' : 'cubic-bezier(.22,.72,.16,1)' }),
    animate(active, cardsScreen, [
      { transform: profile === 'reduced' ? 'translate3d(0,6px,0)' : 'translate3d(3.5vw,1.4vh,0) scale(.982)', opacity: profile === 'reduced' ? '.88' : '.58' },
      { transform: 'translate3d(0,0,0) scale(1)', opacity: '1' },
    ], { duration: enter, easing: 'cubic-bezier(.16,.82,.18,1)', clearAfter: true }),
    animate(active, active.stage.querySelector('.gr2p5dSlashA'), [
      { opacity: profile === 'reduced' ? '.45' : '.92', transform: 'translate3d(-2%,0,80px) rotate(-4deg)' },
      { opacity: '0', transform: 'translate3d(24%,-7%,80px) rotate(-4deg)' },
    ], { duration: enter, easing: 'ease-in' }),
    animate(active, active.stage.querySelector('.gr2p5dSlashB'), [
      { opacity: '.68', transform: 'translate3d(2%,0,35px) rotate(7deg)' },
      { opacity: '0', transform: 'translate3d(-26%,9%,35px) rotate(7deg)' },
    ], { duration: enter, easing: 'ease-in' }),
    animate(active, active.stage.querySelector('.gr2p5dAtmosphere'), [
      { opacity: profile === 'reduced' ? '.36' : '.82' },
      { opacity: '0' },
    ], { duration: enter, easing: 'ease-out' }),
  ]);
}

export async function runHomeCardsPresentationPhase(phase, context = {}) {
  if (!isHomeCardsForward(context)) return;
  const profile = motionProfile(context);
  runtime.lastPhase = String(phase || 'UNKNOWN');
  runtime.lastProfile = profile === 'none' && context.reducedMotion ? 'reduced' : profile;
  runtime.lastRoute = `${context.from}->${context.to}`;
  if (profile === 'none') {
    if (phase === 'PREPARE') runtime.bypassedCount += 1;
    if (phase === 'SETTLE') {
      cleanupActive();
      runtime.completedCount += 1;
      runtime.lastPhase = 'IDLE';
    }
    return;
  }
  if (phase === 'PREPARE') {
    makeStage(context);
    return;
  }
  if (phase === 'EXIT') {
    await runExit(context);
    return;
  }
  if (phase === 'ENTER') {
    await runEnter(context);
    return;
  }
  if (phase === 'SETTLE') {
    cleanupActive();
    runtime.completedCount += 1;
    runtime.lastPhase = 'IDLE';
  }
}

function snapshot() {
  return Object.freeze({
    mounted: true,
    active: Boolean(runtime.active),
    stagePresent: Boolean(document.getElementById(STAGE_ID)),
    startedCount: runtime.startedCount,
    completedCount: runtime.completedCount,
    abortedCount: runtime.abortedCount,
    bypassedCount: runtime.bypassedCount,
    lastPhase: runtime.lastPhase,
    lastProfile: runtime.lastProfile,
    lastRoute: runtime.lastRoute,
  });
}

function mount() {
  if (globalThis[GLOBAL_KEY]) return globalThis[GLOBAL_KEY];
  const previousVisualPhase = globalThis.GAMEROAD_RUN_SCREEN_TRANSITION_PHASE;
  if (typeof previousVisualPhase !== 'function') {
    throw new Error('GAMEROAD Home-Cards 2.5D presentation requires the current screen visual-phase owner');
  }
  ensureStyle();
  const api = Object.freeze({
    snapshot,
    matches: isHomeCardsForward,
    cleanup: () => cleanupActive(),
  });
  Object.defineProperty(globalThis, GLOBAL_KEY, {
    value: api,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  globalThis.GAMEROAD_RUN_SCREEN_TRANSITION_PHASE = async (phase, context) => {
    const base = Promise.resolve(previousVisualPhase(phase, context));
    if (!isHomeCardsForward(context)) return base;
    const presentation = runHomeCardsPresentationPhase(phase, context);
    await Promise.all([base, presentation]);
  };
  return api;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') mount();

const QUICK_DECK_BUTTON_ID = 'gameroad-quick-deck-open';
const QUICK_DECK_ROOT_ID = 'gameroad-quick-deck-overlay-root';
const QUICK_DECK_STYLE_ID = 'gameroad-quick-deck-live-style';
const quickDeckRuntime = { root: null, cardsScreen: null, open: false, observer: null, keyBound: false };

function quickDeckLabel(cardId) {
  const card = Array.isArray(globalThis.__CARD_DATA__)
    ? globalThis.__CARD_DATA__.find((entry) => String(entry?.id || '') === cardId)
    : null;
  return String(card?.displayName ?? card?.name ?? card?.title ?? card?.label ?? cardId);
}

function readRenderedQuickDeck() {
  const grouped = new Map();
  for (const selector of ['#deckSlots [data-id]', '#exDeckSlots [data-id]']) {
    for (const node of document.querySelectorAll(selector)) {
      const cardId = String(node?.dataset?.id || '').trim();
      if (!cardId) continue;
      const current = grouped.get(cardId);
      if (current) current.quantity += 1;
      else grouped.set(cardId, { cardId, label: quickDeckLabel(cardId), quantity: 1 });
    }
  }
  return [...grouped.values()];
}

function ensureQuickDeckStyle() {
  if (document.getElementById(QUICK_DECK_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = QUICK_DECK_STYLE_ID;
  style.textContent = `
#${QUICK_DECK_BUTTON_ID}{min-width:44px;min-height:44px;margin:0 0 8px auto;padding:8px 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent,#77dffc) 44%,rgba(255,255,255,.18));background:color-mix(in srgb,var(--bg,#071019) 86%,var(--accent,#77dffc) 14%);color:var(--text,#f5f7fb);font:700 13px/1 system-ui;touch-action:manipulation}
#${QUICK_DECK_ROOT_ID}[hidden]{display:none!important}#${QUICK_DECK_ROOT_ID}{position:fixed;inset:0;z-index:2147482500}
#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckBackdrop{position:fixed;inset:0;display:grid;place-items:center;padding:clamp(12px,3vw,28px);background:rgba(3,8,15,.56);backdrop-filter:blur(5px)}
#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckPanel{width:min(860px,94vw);max-height:min(78vh,720px);overflow:auto;border:1px solid color-mix(in srgb,var(--accent,#77dffc) 34%,rgba(255,255,255,.18));border-radius:18px;background:color-mix(in srgb,var(--bg,#071019) 94%,#111827);box-shadow:0 24px 60px rgba(0,0,0,.4);padding:16px;color:var(--text,#f5f7fb)}
#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckHead{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:12px}#${QUICK_DECK_ROOT_ID} h2{margin:0;font:700 clamp(18px,2.5vw,26px)/1.2 system-ui}#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckSummary{font-size:13px;opacity:.82}
#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckClose{min-width:44px;min-height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.07);color:inherit;font-size:22px}#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:10px}
#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckCard{min-height:86px;border-radius:12px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.05);padding:10px;display:grid;align-content:space-between;gap:8px}#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckCount{justify-self:end;font-weight:800}#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckEmpty{padding:24px 8px;text-align:center;opacity:.72}
@media (prefers-reduced-motion:reduce){#${QUICK_DECK_ROOT_ID} .gameroadQuickDeckBackdrop{backdrop-filter:none}}
`;
  document.head.append(style);
}

function closeQuickDeck() {
  if (!quickDeckRuntime.root || !quickDeckRuntime.open) return false;
  quickDeckRuntime.root.replaceChildren();
  quickDeckRuntime.root.hidden = true;
  quickDeckRuntime.open = false;
  return true;
}

function openQuickDeck() {
  const surface = mountQuickDeckLiveOverlay();
  if (!surface) return false;
  const entries = readRenderedQuickDeck();
  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const backdrop = document.createElement('div');
  backdrop.className = 'gameroadQuickDeckBackdrop';
  backdrop.dataset.quickDeckOverlay = 'open';
  const panel = document.createElement('section');
  panel.className = 'gameroadQuickDeckPanel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'デッキ確認');
  const head = document.createElement('div');
  head.className = 'gameroadQuickDeckHead';
  const title = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = 'デッキ確認';
  const summary = document.createElement('div');
  summary.className = 'gameroadQuickDeckSummary';
  summary.textContent = `${total}枚`;
  summary.setAttribute('aria-live', 'polite');
  title.append(heading, summary);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'gameroadQuickDeckClose';
  closeButton.setAttribute('aria-label', '閉じる');
  closeButton.textContent = '×';
  closeButton.addEventListener('click', closeQuickDeck);
  head.append(title, closeButton);
  panel.append(head);
  if (entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gameroadQuickDeckEmpty';
    empty.textContent = 'デッキにカードがありません';
    panel.append(empty);
  } else {
    const grid = document.createElement('div');
    grid.className = 'gameroadQuickDeckGrid';
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'gameroadQuickDeckCard';
      card.dataset.cardId = entry.cardId;
      const name = document.createElement('span');
      name.textContent = entry.label;
      const count = document.createElement('span');
      count.className = 'gameroadQuickDeckCount';
      count.dataset.quantity = String(entry.quantity);
      count.textContent = `×${entry.quantity}`;
      card.append(name, count);
      grid.append(card);
    }
    panel.append(grid);
  }
  backdrop.append(panel);
  backdrop.addEventListener('pointerdown', (event) => {
    if (event.target === backdrop) closeQuickDeck();
  });
  quickDeckRuntime.root.replaceChildren(backdrop);
  quickDeckRuntime.root.hidden = false;
  quickDeckRuntime.open = true;
  return true;
}

function mountQuickDeckLiveOverlay() {
  const cardsScreen = document.querySelector('.screen[data-screen="cards"]');
  const deckSlots = document.getElementById('deckSlots');
  if (!(cardsScreen instanceof HTMLElement) || !(deckSlots instanceof HTMLElement)) return null;
  ensureQuickDeckStyle();
  let button = document.getElementById(QUICK_DECK_BUTTON_ID);
  if (!(button instanceof HTMLButtonElement)) {
    button = document.createElement('button');
    button.id = QUICK_DECK_BUTTON_ID;
    button.type = 'button';
    button.textContent = 'デッキ確認';
    button.setAttribute('aria-haspopup', 'dialog');
    button.addEventListener('click', openQuickDeck);
    deckSlots.insertAdjacentElement('beforebegin', button);
  }
  let root = document.getElementById(QUICK_DECK_ROOT_ID);
  if (!(root instanceof HTMLElement)) {
    root = document.createElement('div');
    root.id = QUICK_DECK_ROOT_ID;
    root.hidden = true;
    cardsScreen.append(root);
  }
  quickDeckRuntime.root = root;
  quickDeckRuntime.cardsScreen = cardsScreen;
  if (!quickDeckRuntime.observer && typeof MutationObserver !== 'undefined') {
    quickDeckRuntime.observer = new MutationObserver(() => {
      if (!cardsScreen.classList.contains('active')) closeQuickDeck();
    });
    quickDeckRuntime.observer.observe(cardsScreen, { attributes: true, attributeFilter: ['class'] });
  }
  if (!quickDeckRuntime.keyBound) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeQuickDeck();
    });
    quickDeckRuntime.keyBound = true;
  }
  return { button, root };
}

function scheduleQuickDeckLiveOverlay() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountQuickDeckLiveOverlay, { once: true });
  } else {
    mountQuickDeckLiveOverlay();
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') scheduleQuickDeckLiveOverlay();
