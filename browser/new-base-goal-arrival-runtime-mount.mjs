import { isNewBaseGoalArrivalPresentation } from './new-base-goal-arrival-presentation-core.mjs';

const STYLE_ID = 'gr-new-base-goal-arrival-r1-style';

const STYLE_TEXT = `
.gr-goal-arrival-r1{--gr-goal-x:50%;--gr-goal-y:50%;position:absolute;inset:0;z-index:34;pointer-events:none;overflow:hidden;opacity:0;color:var(--gr-goal-arrival-color,var(--gr-ui-strong,#fff));transition:opacity 100ms linear}
.gr-goal-arrival-r1[data-active="true"]{opacity:1}
.gr-goal-arrival-r1__wash{position:absolute;inset:0;opacity:0;background:radial-gradient(circle at var(--gr-goal-x) var(--gr-goal-y),color-mix(in srgb,currentColor 28%,transparent) 0,transparent 42%);transition:opacity 140ms ease-out}
.gr-goal-arrival-r1__goal{position:absolute;left:var(--gr-goal-x);top:var(--gr-goal-y);width:clamp(96px,17vw,190px);aspect-ratio:1;translate:-50% -50%;display:grid;place-items:center;opacity:.01;transform:scale(.62);transform-origin:center;transition:opacity 140ms ease-out,transform 180ms cubic-bezier(.2,.8,.2,1)}
.gr-goal-arrival-r1__ring,.gr-goal-arrival-r1__ring::before,.gr-goal-arrival-r1__ring::after{position:absolute;inset:0;border:2px solid currentColor;border-radius:50%;content:"";opacity:.74}
.gr-goal-arrival-r1__ring::before{inset:13%}.gr-goal-arrival-r1__ring::after{inset:27%;opacity:.48}
.gr-goal-arrival-r1__mark{position:relative;display:grid;place-items:center;min-width:4.2em;padding:.42em .72em;border:2px solid currentColor;border-radius:999px;background:color-mix(in srgb,#000 48%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,currentColor 35%,transparent),0 0 28px color-mix(in srgb,currentColor 52%,transparent);font:900 clamp(18px,3.4vw,34px)/1 system-ui,sans-serif;letter-spacing:.08em;text-shadow:0 2px 10px #000}
.gr-goal-arrival-r1__trace{position:absolute;height:3px;left:var(--gr-actor-x,50%);top:var(--gr-actor-y,50%);width:var(--gr-trace-length,0px);transform-origin:0 50%;transform:rotate(var(--gr-trace-angle,0rad)) scaleX(0);opacity:0;background:linear-gradient(90deg,transparent,currentColor);box-shadow:0 0 12px currentColor;transition:transform 180ms ease-out,opacity 120ms linear}
.gr-goal-arrival-r1__spark{position:absolute;left:var(--gr-goal-x);top:var(--gr-goal-y);width:7px;height:7px;border-radius:50%;translate:-50% -50%;opacity:0;box-shadow:0 -78px 0 -1px currentColor,55px -55px 0 -1px currentColor,78px 0 0 -1px currentColor,55px 55px 0 -1px currentColor,0 78px 0 -1px currentColor,-55px 55px 0 -1px currentColor,-78px 0 0 -1px currentColor,-55px -55px 0 -1px currentColor}
.gr-goal-arrival-r1[data-stage="ARRIVE"] .gr-goal-arrival-r1__goal{opacity:.72;transform:scale(.88)}
.gr-goal-arrival-r1[data-stage="ARRIVE"] .gr-goal-arrival-r1__trace{opacity:.9;transform:rotate(var(--gr-trace-angle,0rad)) scaleX(1)}
.gr-goal-arrival-r1[data-stage="CONFIRM"] .gr-goal-arrival-r1__goal{opacity:1;transform:scale(1.06)}
.gr-goal-arrival-r1[data-stage="CELEBRATE"] .gr-goal-arrival-r1__goal{opacity:1;transform:scale(1)}
.gr-goal-arrival-r1[data-stage="CELEBRATE"] .gr-goal-arrival-r1__wash{opacity:1}
.gr-goal-arrival-r1[data-stage="CELEBRATE"] .gr-goal-arrival-r1__ring{animation:gr-goal-ring-r1 560ms cubic-bezier(.15,.75,.2,1) both}
.gr-goal-arrival-r1[data-stage="CELEBRATE"] .gr-goal-arrival-r1__spark{opacity:.92;animation:gr-goal-spark-r1 620ms ease-out both}
.gr-goal-arrival-r1[data-stage="HANDOFF"] .gr-goal-arrival-r1__goal{opacity:.74;transform:scale(.94)}
.gr-goal-arrival-r1[data-stage="HANDOFF"] .gr-goal-arrival-r1__wash{opacity:0}
.gr-goal-arrival-r1[data-profile="REDUCED_MOTION"] *{animation:none!important;transition:none!important}
.gr-goal-arrival-r1[data-profile="REDUCED_MOTION"] .gr-goal-arrival-r1__trace,.gr-goal-arrival-r1[data-profile="REDUCED_MOTION"] .gr-goal-arrival-r1__spark{display:none}
.gr-goal-arrival-r1[data-profile="LOW_PERF"] .gr-goal-arrival-r1__spark{display:none}
.gr-goal-arrival-r1[data-profile="LOW_PERF"] .gr-goal-arrival-r1__mark{box-shadow:0 0 12px currentColor}
@keyframes gr-goal-ring-r1{0%{transform:scale(.72);opacity:0}36%{opacity:1}100%{transform:scale(1.28);opacity:.16}}
@keyframes gr-goal-spark-r1{0%{transform:scale(.58);opacity:0}28%{opacity:1}100%{transform:scale(1.34);opacity:0}}
`;

function makeScheduler(source = globalThis) {
  return {
    setTimeout: typeof source?.setTimeout === 'function' ? source.setTimeout.bind(source) : (() => 0),
    clearTimeout: typeof source?.clearTimeout === 'function' ? source.clearTimeout.bind(source) : (() => {})
  };
}

function ensureStyle(documentLike) {
  if (!documentLike?.createElement) return;
  if (typeof documentLike.getElementById === 'function' && documentLike.getElementById(STYLE_ID)) return;
  const style = documentLike.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  const parent = documentLike.head || documentLike.documentElement;
  parent?.appendChild?.(style);
}

function append(parent, tag, className, text = '') {
  const node = parent.ownerDocument.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function finiteRect(node) {
  if (!node || typeof node.getBoundingClientRect !== 'function') return null;
  const rect = node.getBoundingClientRect();
  if (![rect?.left, rect?.top, rect?.width, rect?.height].every(Number.isFinite)) return null;
  return rect;
}

function setVar(style, key, value) {
  style?.setProperty?.(key, value);
}

function dispatchComplete(host, documentLike, detail) {
  if (typeof host?.dispatchEvent !== 'function') return;
  const CustomEventCtor = documentLike?.defaultView?.CustomEvent || globalThis.CustomEvent;
  if (typeof CustomEventCtor !== 'function') return;
  host.dispatchEvent(new CustomEventCtor('gameroad:goal-arrival-complete', { detail }));
}

/**
 * Fail-soft DOM renderer for the already-authorized GOAL-arrival presentation plan.
 * It never mutates gameplay state. Goal/actor resolvers point the effect at existing runtime elements.
 */
export function mountNewBaseGoalArrivalRuntime({
  host,
  documentLike = host?.ownerDocument,
  resolveGoalElement = () => null,
  resolveActorElement = () => null,
  schedulerSource = globalThis
} = {}) {
  if (!host?.appendChild || !documentLike?.createElement) {
    return Object.freeze({
      mounted: false,
      play: () => ({ started: false, reason: 'DOM_UNAVAILABLE' }),
      settle: () => false,
      destroy: () => false
    });
  }

  ensureStyle(documentLike);
  const overlay = documentLike.createElement('div');
  overlay.className = 'gr-goal-arrival-r1';
  overlay.dataset.active = 'false';
  overlay.dataset.stage = 'IDLE';
  overlay.setAttribute?.('aria-hidden', 'true');
  host.appendChild(overlay);

  append(overlay, 'div', 'gr-goal-arrival-r1__wash');
  const trace = append(overlay, 'div', 'gr-goal-arrival-r1__trace');
  const goal = append(overlay, 'div', 'gr-goal-arrival-r1__goal');
  append(goal, 'div', 'gr-goal-arrival-r1__ring');
  append(goal, 'div', 'gr-goal-arrival-r1__mark', 'GOAL');
  append(overlay, 'div', 'gr-goal-arrival-r1__spark');

  const scheduler = makeScheduler(schedulerSource);
  const seenEventIds = new Set();
  let timers = [];
  let currentPlan = null;
  let destroyed = false;

  function clearTimers() {
    for (const timer of timers) scheduler.clearTimeout(timer);
    timers = [];
  }

  function place(plan) {
    const hostRect = finiteRect(host);
    const goalRect = finiteRect(resolveGoalElement(plan.goalId));
    const actorRect = finiteRect(resolveActorElement(plan.actorId));
    if (!hostRect) return;

    const goalX = goalRect ? goalRect.left - hostRect.left + goalRect.width / 2 : hostRect.width / 2;
    const goalY = goalRect ? goalRect.top - hostRect.top + goalRect.height / 2 : hostRect.height / 2;
    setVar(overlay.style, '--gr-goal-x', `${goalX}px`);
    setVar(overlay.style, '--gr-goal-y', `${goalY}px`);

    if (!actorRect || !plan.profile.travel) {
      trace.style.display = 'none';
      return;
    }
    trace.style.display = '';
    const actorX = actorRect.left - hostRect.left + actorRect.width / 2;
    const actorY = actorRect.top - hostRect.top + actorRect.height / 2;
    const dx = goalX - actorX;
    const dy = goalY - actorY;
    setVar(overlay.style, '--gr-actor-x', `${actorX}px`);
    setVar(overlay.style, '--gr-actor-y', `${actorY}px`);
    setVar(overlay.style, '--gr-trace-length', `${Math.hypot(dx, dy)}px`);
    setVar(overlay.style, '--gr-trace-angle', `${Math.atan2(dy, dx)}rad`);
  }

  function setStage(stage) {
    overlay.dataset.stage = stage.id;
  }

  function settle() {
    if (destroyed || !currentPlan) return false;
    clearTimers();
    const completed = currentPlan;
    currentPlan = null;
    overlay.dataset.active = 'false';
    overlay.dataset.stage = 'IDLE';
    dispatchComplete(host, documentLike, {
      schema: completed.schema,
      eventId: completed.eventId,
      resultId: completed.resultId,
      matchId: completed.matchId,
      goalId: completed.goalId,
      resultHandoff: completed.resultHandoff === true
    });
    return true;
  }

  function play(plan) {
    if (destroyed) return { started: false, reason: 'DESTROYED' };
    if (!isNewBaseGoalArrivalPresentation(plan)) return { started: false, reason: 'PLAN_INVALID' };
    if (seenEventIds.has(plan.eventId)) return { started: false, reason: 'DUPLICATE_EVENT_SUPPRESSED' };

    clearTimers();
    seenEventIds.add(plan.eventId);
    currentPlan = plan;
    overlay.dataset.profile = plan.profile?.id || 'NORMAL';
    overlay.dataset.active = 'true';
    overlay.dataset.eventId = plan.eventId;
    place(plan);

    let elapsed = 0;
    plan.stages.forEach((stage, index) => {
      if (index === 0) {
        setStage(stage);
      } else {
        timers.push(scheduler.setTimeout(() => {
          if (!destroyed && currentPlan?.eventId === plan.eventId) setStage(stage);
        }, elapsed));
      }
      elapsed += Math.max(0, Number(stage.durationMs) || 0);
    });
    timers.push(scheduler.setTimeout(() => {
      if (!destroyed && currentPlan?.eventId === plan.eventId) settle();
    }, elapsed));

    return { started: true, eventId: plan.eventId, profile: overlay.dataset.profile };
  }

  function destroy() {
    if (destroyed) return false;
    clearTimers();
    destroyed = true;
    currentPlan = null;
    overlay.remove?.();
    return true;
  }

  return Object.freeze({ mounted: true, overlay, play, settle, destroy });
}

export const NEW_BASE_GOAL_ARRIVAL_RUNTIME_MOUNT = Object.freeze({
  styleId: STYLE_ID,
  gameplayAuthority: false,
  gameStateWrite: false
});
