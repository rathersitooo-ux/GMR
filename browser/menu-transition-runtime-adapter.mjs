import {createTransitionDirector} from './ui-state-feedback-core.mjs';
import {createScreenNavigationRuntimeBridge} from './screen-navigation-core.mjs';

export const MENU_TRANSITION_MOTION_PROFILE = Object.freeze({
  NORMAL: 'normal',
  REDUCED: 'reduced',
  NONE: 'none',
});

function requireFunction(value, label) {
  if (typeof value !== 'function') throw new Error(`${label} must be a function`);
  return value;
}

function readBoolean(source) {
  return Boolean(typeof source === 'function' ? source() : source);
}

function motionProfile({reducedMotion, lowPerf}) {
  if (reducedMotion) return MENU_TRANSITION_MOTION_PROFILE.NONE;
  if (lowPerf) return MENU_TRANSITION_MOTION_PROFILE.REDUCED;
  return MENU_TRANSITION_MOTION_PROFILE.NORMAL;
}

function freezeResult(result) {
  return Object.freeze(result);
}

/**
 * Connects the existing semantic screen-navigation bridge to the existing
 * TransitionDirector without letting animation timing own navigation state.
 *
 * Production DOM animation is supplied through runVisualPhase. The only
 * screen/business-state mutation is applyScreen, invoked synchronously at
 * the director SWAP boundary exactly once for the winning revision.
 */
export function createMenuTransitionRuntimeAdapter({
  getCurrentScreen,
  applyScreen,
  runVisualPhase = async () => {},
  navigationBridge = createScreenNavigationRuntimeBridge(),
  reducedMotion = false,
  lowPerf = false,
} = {}) {
  requireFunction(getCurrentScreen, 'getCurrentScreen');
  requireFunction(applyScreen, 'applyScreen');
  requireFunction(runVisualPhase, 'runVisualPhase');
  if (!navigationBridge || typeof navigationBridge.resolve !== 'function' || typeof navigationBridge.resolveBackTarget !== 'function') {
    throw new Error('navigationBridge must expose resolve and resolveBackTarget');
  }

  const director = createTransitionDirector({
    runPhase: async (phase, context) => {
      const profile = motionProfile(context);
      await runVisualPhase(phase, Object.freeze({...context, motionProfile: profile}));
    },
  });

  async function navigate(requestedTarget, {reason = 'navigation'} = {}) {
    const from = getCurrentScreen();
    const decision = navigationBridge.resolve(from, requestedTarget);
    if (!decision.ok) {
      return freezeResult({
        status: 'ignored',
        revision: director.getState().revision,
        from: decision.from,
        to: decision.to,
        swapped: false,
        reason: decision.reason,
      });
    }

    const result = await director.start({
      from: decision.from,
      to: decision.to,
      reason,
      reducedMotion: readBoolean(reducedMotion),
      lowPerf: readBoolean(lowPerf),
      applySwap: (context) => {
        const applied = applyScreen(decision.to, Object.freeze({
          from: decision.from,
          to: decision.to,
          reason,
          revision: context.revision,
        }));
        if (applied && typeof applied.then === 'function') {
          throw new Error('applyScreen must be synchronous');
        }
      },
    });

    return freezeResult({...result, navigationReason: decision.reason});
  }

  async function back(historyEntry, options = {}) {
    const current = getCurrentScreen();
    const target = navigationBridge.resolveBackTarget(current, historyEntry);
    return navigate(target, {reason: options.reason || 'back'});
  }

  return Object.freeze({
    navigate,
    back,
    cancel: director.cancel,
    getState: director.getState,
  });
}
