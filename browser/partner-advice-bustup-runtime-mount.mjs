import { createPartnerAdviceBustupMotionController } from './partner-advice-bustup-motion-core.mjs';
import {
  SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE,
  saasunaAdviceMotionStateForTrigger,
} from './partner-saasuna-advice-bustup-motion-profile.mjs';

const STYLE_ID = 'gameroad-partner-advice-bustup-motion-r1';
const ROOT_ID = 'partnerAdviceChatPresentation';
const BUSTUP_ROLE = 'advice-partner-bustup';

function ensureStyle(doc) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID} .partnerAdviceBustup{grid-column:1/-1;position:relative;display:grid;place-items:end center;height:clamp(92px,15vh,136px);margin:-2px -2px 0;overflow:hidden;pointer-events:none;isolation:isolate}
#${ROOT_ID} .partnerAdviceBustup[hidden]{display:none!important}
#${ROOT_ID} .partnerAdviceBustup::after{content:"";position:absolute;inset:auto 8% 0;height:34%;background:linear-gradient(180deg,transparent,rgba(3,18,22,.74));z-index:2;pointer-events:none}
#${ROOT_ID} .partnerAdviceBustup img{display:block;position:relative;z-index:1;width:auto;height:100%;max-width:100%;object-fit:contain;object-position:50% 100%;transform-origin:50% 78%;will-change:transform,filter,opacity}
#${ROOT_ID} .partnerAdviceBustup[data-motion-side="鬱"] img{animation:saasunaUtsuIdle 5.8s cubic-bezier(.4,0,.2,1) infinite}
#${ROOT_ID} .partnerAdviceBustup[data-motion-side="躁"] img{animation:saasunaSouBurst .95s cubic-bezier(.18,.82,.22,1) 1}
#${ROOT_ID} .partnerAdviceBustup[data-motion-side="鬱→躁→鬱"] img{animation:saasunaUtsuSouUtsu 2.45s cubic-bezier(.2,.78,.28,1) 1}
#${ROOT_ID} .partnerAdviceBustup[data-motion-side="躁→鬱"] img{animation:saasunaSouUtsu 2.8s cubic-bezier(.2,.78,.3,1) 1}
#${ROOT_ID} .partnerAdviceBustup[data-motion-state="GUIDE_PRESENT"] img{animation-name:saasunaUtsuGuide;animation-duration:3.8s}
#${ROOT_ID} .partnerAdviceBustup[data-motion-state="SHH"] img,#${ROOT_ID} .partnerAdviceBustup[data-motion-state="SAD_DOWNCAST"] img{animation-name:saasunaUtsuHold;animation-duration:1.8s;animation-iteration-count:1}
@keyframes saasunaUtsuIdle{0%,18%,100%{transform:translate3d(0,0,0) rotate(0deg)}36%{transform:translate3d(0,1.2%,0) rotate(-.25deg)}58%{transform:translate3d(0,.4%,0) rotate(.18deg)}76%{transform:translate3d(0,1%,0) rotate(0deg)}}
@keyframes saasunaUtsuGuide{0%,100%{transform:translate3d(0,.7%,0) rotate(-.12deg)}34%{transform:translate3d(1.2%,0,0) rotate(.35deg)}48%{transform:translate3d(2.7%,-1.4%,0) rotate(.7deg)}66%{transform:translate3d(.5%,.4%,0) rotate(0deg)}}
@keyframes saasunaSouBurst{0%{transform:translate3d(0,3%,0) scale(.97);filter:saturate(.92)}18%{transform:translate3d(-2.8%,-6%,0) scale(1.055) rotate(-2.6deg);filter:saturate(1.12)}46%{transform:translate3d(3.4%,-8%,0) scale(1.075) rotate(2.8deg)}72%{transform:translate3d(-1.3%,-3%,0) scale(1.035) rotate(-1deg)}100%{transform:translate3d(0,.7%,0) scale(1);filter:saturate(1)}}
@keyframes saasunaUtsuSouUtsu{0%,12%{transform:translate3d(0,1%,0) scale(1)}24%{transform:translate3d(-2%,-5%,0) scale(1.05) rotate(-2deg)}38%{transform:translate3d(3%,-7%,0) scale(1.07) rotate(2.5deg)}54%{transform:translate3d(-1%,-2%,0) scale(1.025)}72%,100%{transform:translate3d(0,1.5%,0) scale(.995) rotate(-.2deg)}}
@keyframes saasunaSouUtsu{0%{transform:translate3d(0,2%,0) scale(.98)}14%{transform:translate3d(-3%,-6%,0) scale(1.06) rotate(-2.4deg)}34%{transform:translate3d(2%,-4%,0) scale(1.04) rotate(1.5deg)}56%{transform:translate3d(0,1%,0) scale(1)}78%,100%{transform:translate3d(0,2%,0) scale(.99) rotate(-.35deg);filter:saturate(.94)}}
@keyframes saasunaUtsuHold{0%{transform:translate3d(0,.2%,0)}38%{transform:translate3d(0,1.5%,0) rotate(-.3deg)}100%{transform:translate3d(0,1%,0)}}
@media(max-height:430px) and (orientation:landscape){#${ROOT_ID} .partnerAdviceBustup{height:82px;margin:-3px -2px 0}}
@media(prefers-reduced-motion:reduce){#${ROOT_ID} .partnerAdviceBustup img{animation:none!important;transform:none!important;filter:none!important}}
`;
  doc.head?.append(style);
}

function exactText(value, max = 256) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  return token && token.length <= max ? token : null;
}

function createBustupNode(doc) {
  const figure = doc.createElement('figure');
  figure.className = 'partnerAdviceBustup';
  figure.dataset.role = BUSTUP_ROLE;
  figure.dataset.presentationOnly = 'true';
  figure.setAttribute('aria-label', 'アドバイスパートナー');
  const image = doc.createElement('img');
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  figure.append(image);
  return figure;
}

export function installPartnerAdviceBustupRuntime({
  windowRef = globalThis.window,
  getPartnerId = () => null,
  profile = SAASUNA_ADVICE_BUSTUP_MOTION_PROFILE,
} = {}) {
  const win = windowRef;
  const doc = win?.document;
  if (!doc || typeof getPartnerId !== 'function') return null;
  ensureStyle(doc);

  const controller = createPartnerAdviceBustupMotionController({
    profile,
    now: () => win.performance?.now?.() ?? Date.now(),
  });
  let root = null;
  let figure = null;
  let timer = null;
  let lastReactionFingerprint = null;
  let rootObserver = null;
  let mountObserver = null;

  const clearTimer = () => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  };

  const ensureNode = () => {
    const nextRoot = doc.getElementById(ROOT_ID);
    if (!nextRoot) return false;
    if (root !== nextRoot) {
      rootObserver?.disconnect?.();
      root = nextRoot;
      figure = root.querySelector(`[data-role="${BUSTUP_ROLE}"]`);
      if (!figure) {
        figure = createBustupNode(doc);
        const roleControl = root.querySelector('.partnerAdviceRoleControl');
        if (roleControl?.nextSibling) root.insertBefore(figure, roleControl.nextSibling);
        else if (roleControl) root.append(figure);
        else root.prepend(figure);
      }
      rootObserver = new win.MutationObserver(() => queueMicrotask(render));
      rootObserver.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    return true;
  };

  const scheduleExpiry = (remainingMs) => {
    clearTimer();
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return;
    timer = win.setTimeout(() => {
      timer = null;
      controller.tick();
      render();
    }, Math.ceil(remainingMs) + 16);
  };

  function render() {
    if (!ensureNode()) return null;
    const partnerId = exactText(getPartnerId());
    const isSaasuna = partnerId === profile.partnerId;
    figure.hidden = !isSaasuna;
    if (!isSaasuna) {
      clearTimer();
      controller.clearReaction();
      controller.setGuideActive(false);
      return Object.freeze({ active: false, partnerId, reason: 'PROFILE_NOT_ACTIVE' });
    }

    const reaction = root.querySelector('[data-role="character-reaction"]');
    const reactionActive = reaction?.classList?.contains('on') === true && Boolean(exactText(reaction.textContent));
    const reactionFingerprint = reactionActive ? exactText(reaction.textContent) : null;
    if (reactionFingerprint && reactionFingerprint !== lastReactionFingerprint) {
      lastReactionFingerprint = reactionFingerprint;
      const stateId = saasunaAdviceMotionStateForTrigger('battle_card_submit');
      if (stateId) controller.trigger(stateId, { eventId: `battle-card:${reactionFingerprint}` });
    }
    if (!reactionActive) lastReactionFingerprint = null;

    const partnerSpeech = root.querySelector('.partnerAdviceSpeech.partner:not(.characterReaction)');
    const tutorial = root.querySelector('[data-role="tutorial-experience-conversation"]');
    const guideActive = (partnerSpeech?.classList?.contains('on') === true) || (tutorial && tutorial.hidden === false);
    controller.setGuideActive(guideActive);
    const status = controller.tick();
    const image = figure.querySelector('img');
    if (image && image.getAttribute('src') !== status.assetPath) image.setAttribute('src', status.assetPath);
    figure.dataset.motionPersonality = status.motionPersonality;
    figure.dataset.motionState = status.stateId;
    figure.dataset.motionSide = status.side;
    figure.dataset.animationKey = status.animationKey;
    figure.dataset.partnerId = status.partnerId;
    scheduleExpiry(status.remainingMs);
    return status;
  }

  const requestState = (stateId, eventId = null) => {
    const accepted = controller.trigger(stateId, { eventId: eventId || `${stateId}:${Date.now()}` });
    if (accepted) render();
    return accepted;
  };

  if (!ensureNode() && doc.documentElement) {
    mountObserver = new win.MutationObserver(() => {
      if (!ensureNode()) return;
      mountObserver?.disconnect?.();
      mountObserver = null;
      render();
    });
    mountObserver.observe(doc.documentElement, { childList: true, subtree: true });
  } else {
    render();
  }

  return Object.freeze({
    profile,
    render,
    requestState,
    status: () => controller.status(),
    disconnect() {
      clearTimer();
      rootObserver?.disconnect?.();
      mountObserver?.disconnect?.();
      rootObserver = null;
      mountObserver = null;
    },
  });
}
