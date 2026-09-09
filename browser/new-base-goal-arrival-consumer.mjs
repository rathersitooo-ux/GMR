import {
  applyAuthoritativeNewBaseGoalArrival,
  createNewBaseGoalResultPresentation
} from './new-base-goal-result-core.mjs';
import { createNewBaseGoalArrivalPresentation } from './new-base-goal-arrival-presentation-core.mjs';

/**
 * Presentation-side consumer for the existing New Base GOAL authority.
 * The imported authority core remains the only code allowed to accept GOAL_REACHED.
 */
export function consumeAuthoritativeNewBaseGoalArrival(state, event, options = {}) {
  const transition = applyAuthoritativeNewBaseGoalArrival(state, event);
  const firstAcceptance = transition.accepted === true && transition.duplicate !== true;

  if (!firstAcceptance) {
    return Object.freeze({
      ...transition,
      arrivalPresentation: null,
      resultPresentation: null,
      presentationReason: transition.duplicate === true
        ? 'DUPLICATE_PRESENTATION_SUPPRESSED'
        : 'UNACCEPTED_PRESENTATION_SUPPRESSED'
    });
  }

  const arrivalPresentation = createNewBaseGoalArrivalPresentation(
    transition,
    options?.arrivalPresentation
  );
  if (!arrivalPresentation) {
    return Object.freeze({
      ...transition,
      arrivalPresentation: null,
      resultPresentation: null,
      presentationReason: 'GOAL_ARRIVAL_PLAN_UNAVAILABLE'
    });
  }

  const resultPresentation = createNewBaseGoalResultPresentation(
    transition.state,
    options?.resultPresentation
  );

  return Object.freeze({
    ...transition,
    arrivalPresentation,
    resultPresentation,
    presentationReason: 'GOAL_ARRIVAL_THEN_RESULT'
  });
}

export const NEW_BASE_GOAL_ARRIVAL_CONSUMER = Object.freeze({
  gameplayAuthority: false,
  gameStateWrite: false,
  terminalAuthority: 'new-base-goal-result-core.mjs',
  order: Object.freeze(['GOAL_ARRIVAL', 'RESULT'])
});
