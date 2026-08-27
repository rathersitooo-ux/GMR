const SCHEMA = 'gameroad.boot-loading-presentation.v1';

export const BOOT_LOADING_PHASES = Object.freeze({
  SPLASH: 'SPLASH',
  LOADING: 'LOADING',
  READY: 'READY',
  RECOVERY: 'RECOVERY',
  UPDATE_REQUIRED: 'UPDATE_REQUIRED',
  ERROR: 'ERROR',
});

const PHASES = new Set(Object.values(BOOT_LOADING_PHASES));

function optionalString(value, label) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be null or a non-empty string`);
  return value;
}

function optionalProgress(value) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error('progress must be null or a finite number between 0 and 1');
  }
  return value;
}

export function createBootLoadingState({
  phase,
  progress = null,
  canContinue = false,
  canRetry = false,
  canGoBack = false,
  statusCode = null,
  errorCode = null,
} = {}) {
  if (!PHASES.has(phase)) throw new Error('phase is invalid');
  if (phase === BOOT_LOADING_PHASES.READY && canContinue !== true) {
    throw new Error('READY phase requires canContinue=true');
  }
  return Object.freeze({
    schema: SCHEMA,
    phase,
    progress: optionalProgress(progress),
    canContinue: Boolean(canContinue),
    canRetry: Boolean(canRetry),
    canGoBack: Boolean(canGoBack),
    statusCode: optionalString(statusCode, 'statusCode'),
    errorCode: optionalString(errorCode, 'errorCode'),
  });
}

function actionIds(state) {
  const ids = [];
  if (state.canContinue) ids.push('CONTINUE');
  if (state.canRetry) ids.push('RETRY');
  if (state.canGoBack) ids.push('BACK');
  return Object.freeze(ids);
}

export function projectBootLoadingPresentation({ state, reducedMotion = false, lowPerf = false } = {}) {
  if (!state || state.schema !== SCHEMA) throw new Error('valid boot/loading state is required');
  const profile = lowPerf ? 'lowperf-static' : reducedMotion ? 'reduced' : 'full';
  return Object.freeze({
    schema: SCHEMA,
    phase: state.phase,
    progress: state.progress,
    statusCode: state.statusCode,
    errorCode: state.errorCode,
    actionIds: actionIds(state),
    presentationProfile: profile,
    liveSlots: Object.freeze(['progress', 'statusCode', 'errorCode']),
    semanticKey: `${state.phase}|${state.progress ?? 'none'}|${state.statusCode ?? 'none'}|${state.errorCode ?? 'none'}|${state.canContinue ? 1 : 0}${state.canRetry ? 1 : 0}${state.canGoBack ? 1 : 0}`,
  });
}

export const BOOT_LOADING_PRESENTATION_SCHEMA = SCHEMA;
