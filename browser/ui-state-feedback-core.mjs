const SCHEMA = 'gameroad.ui-state-feedback.v1';
const FEEDBACK = new Set(['normal','focus','pressed','detail','selected','pending','confirmed','disabled','failed']);
const INTENTS = new Set(['primary','detail','swipe_right']);

function finiteNonNegative(v, label) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${label} must be a finite non-negative number`);
  return v;
}
function nonEmpty(v, label) {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return v;
}
function freeze(v) { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const x of Object.values(v)) freeze(x); } return v; }
function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config is required');
  return Object.freeze({
    holdMs: finiteNonNegative(config.holdMs, 'holdMs'),
    moveCancelDistance: finiteNonNegative(config.moveCancelDistance, 'moveCancelDistance'),
    rightSwipeDistance: finiteNonNegative(config.rightSwipeDistance, 'rightSwipeDistance'),
  });
}
function validateState(s) {
  if (!s || s.schema !== SCHEMA) throw new Error('unsupported state');
  if (!FEEDBACK.has(s.feedback)) throw new Error('invalid feedback');
  if (!s.config) throw new Error('missing config');
  validateConfig(s.config);
  if (!Number.isInteger(s.sequence) || s.sequence < 0) throw new Error('invalid sequence');
  if (s.pointer) {
    for (const k of ['startX','startY','x','y','downAtMs']) if (typeof s.pointer[k] !== 'number' || !Number.isFinite(s.pointer[k])) throw new Error(`invalid pointer ${k}`);
  }
  if (s.operationToken !== null && (typeof s.operationToken !== 'string' || s.operationToken === '')) throw new Error('invalid operationToken');
  return s;
}
function next(s, patch) { return freeze(validateState({...s, ...patch, sequence:s.sequence+1})); }
function movement(p,x,y) { return Math.hypot(x-p.startX,y-p.startY); }

export function createUIFeedbackState({config, role='action', reason='ready', selected=false, reducedMotion=false, lowPerf=false}={}) {
  const c = validateConfig(config);
  nonEmpty(role,'role'); nonEmpty(reason,'reason');
  return freeze(validateState({schema:SCHEMA, config:c, sequence:0, role, reason, selected:Boolean(selected), feedback:selected?'selected':'normal', pointer:null, holdFired:false, cancelled:false, operationToken:null, intent:null, reducedMotion:Boolean(reducedMotion), lowPerf:Boolean(lowPerf)}));
}

export function applyUIFeedbackEvent(state, event={}) {
  validateState(state);
  if (!event || typeof event !== 'object') throw new Error('event must be an object');
  nonEmpty(event.type,'event.type');
  const pending = state.feedback === 'pending';
  switch (event.type) {
    case 'FOCUS':
      if (state.feedback === 'disabled' || pending) return state;
      return next(state,{feedback:'focus',reason:event.reason || 'focused'});
    case 'BLUR':
      if (pending || state.feedback === 'disabled') return next(state,{pointer:null,holdFired:false,cancelled:false});
      return next(state,{pointer:null,holdFired:false,cancelled:false,feedback:state.selected?'selected':'normal',reason:event.reason || 'ready',intent:null});
    case 'DISABLE':
      return next(state,{feedback:'disabled',reason:nonEmpty(event.reason,'reason'),pointer:null,holdFired:false,cancelled:true,intent:null});
    case 'ENABLE':
      if (state.feedback !== 'disabled') throw new Error('ENABLE requires disabled state');
      return next(state,{feedback:state.selected?'selected':'normal',reason:event.reason || 'ready',cancelled:false,intent:null});
    case 'POINTER_DOWN': {
      if (pending || state.feedback === 'disabled') return state;
      for (const k of ['x','y','atMs']) if (typeof event[k] !== 'number' || !Number.isFinite(event[k])) throw new Error(`POINTER_DOWN ${k} invalid`);
      return next(state,{feedback:'pressed',reason:'pressed',pointer:{startX:event.x,startY:event.y,x:event.x,y:event.y,downAtMs:event.atMs},holdFired:false,cancelled:false,intent:null});
    }
    case 'POINTER_MOVE': {
      if (!state.pointer) throw new Error('POINTER_MOVE without pointer');
      for (const k of ['x','y']) if (typeof event[k] !== 'number' || !Number.isFinite(event[k])) throw new Error(`POINTER_MOVE ${k} invalid`);
      const p={...state.pointer,x:event.x,y:event.y};
      const d=movement(p,event.x,event.y);
      const right=event.x-p.startX;
      const cancelled = state.cancelled || d > state.config.moveCancelDistance;
      const swipe = !state.holdFired && right >= state.config.rightSwipeDistance && Math.abs(event.y-p.startY) <= state.config.moveCancelDistance;
      return next(state,{pointer:p,cancelled:cancelled || swipe,intent:swipe?'swipe_right':state.intent,reason:swipe?'swipe_right':cancelled?'movement_cancelled':state.reason});
    }
    case 'TICK': {
      if (!state.pointer) return state;
      if (typeof event.atMs !== 'number' || !Number.isFinite(event.atMs)) throw new Error('TICK atMs invalid');
      if (state.cancelled || state.holdFired) return state;
      if (event.atMs - state.pointer.downAtMs < state.config.holdMs) return state;
      return next(state,{feedback:'detail',reason:'detail',holdFired:true,intent:'detail'});
    }
    case 'POINTER_UP': {
      if (!state.pointer) throw new Error('POINTER_UP without pointer');
      const intent = state.intent === 'swipe_right' ? 'swipe_right' : state.holdFired ? 'detail' : state.cancelled ? null : 'primary';
      return next(state,{pointer:null,holdFired:false,cancelled:false,intent,feedback:state.selected?'selected':'normal',reason:intent || 'cancelled'});
    }
    case 'SECONDARY':
      if (pending || state.feedback === 'disabled') return state;
      return next(state,{feedback:'detail',reason:'detail',intent:'detail',pointer:null,holdFired:false,cancelled:false});
    case 'SELECT':
      if (state.feedback === 'disabled') return state;
      return next(state,{selected:true,feedback:pending?'pending':'selected',reason:event.reason || 'selected'});
    case 'DESELECT':
      return next(state,{selected:false,feedback:pending?'pending':'normal',reason:event.reason || (pending?'pending':'ready')});
    case 'BEGIN_PENDING': {
      if (pending) throw new Error('operation already pending');
      if (state.feedback === 'disabled') throw new Error('disabled control cannot begin pending');
      const token=nonEmpty(event.token,'token');
      return next(state,{feedback:'pending',reason:event.reason || 'pending',operationToken:token,pointer:null,holdFired:false,cancelled:false,intent:null});
    }
    case 'ACK_CONFIRMED':
    case 'ACK_FAILED': {
      if (!pending || state.operationToken === null) throw new Error('no pending operation');
      if (event.token !== state.operationToken) throw new Error('stale or mismatched operation token');
      const ok=event.type==='ACK_CONFIRMED';
      return next(state,{feedback:ok?'confirmed':'failed',reason:nonEmpty(event.reason,'reason'),operationToken:null,pointer:null,holdFired:false,cancelled:false,intent:null});
    }
    case 'RESET_FEEDBACK':
      if (pending) throw new Error('cannot reset pending operation');
      if (state.feedback === 'disabled') return state;
      return next(state,{feedback:state.selected?'selected':'normal',reason:event.reason || 'ready',intent:null,pointer:null,holdFired:false,cancelled:false});
    default: throw new Error(`unsupported event: ${event.type}`);
  }
}

export function consumeUIIntent(state) {
  validateState(state);
  if (state.intent === null) return freeze({state, intent:null});
  if (!INTENTS.has(state.intent)) throw new Error('invalid intent');
  const intent=state.intent;
  return freeze({state:next(state,{intent:null}), intent});
}

export function projectUIFeedback(state) {
  validateState(state);
  return freeze({schema:state.schema,feedback:state.feedback,reason:state.reason,role:state.role,selected:state.selected,pending:state.feedback==='pending',motion:state.reducedMotion?'none':state.lowPerf?'reduced':'normal',semanticLabel:`${state.role}:${state.feedback}`,intent:state.intent});
}

export const UI_STATE_FEEDBACK_SCHEMA = SCHEMA;

export const TRANSITION_PHASES = Object.freeze({
  IDLE:'IDLE',
  PREPARE:'PREPARE',
  EXIT:'EXIT',
  SWAP:'SWAP',
  ENTER:'ENTER',
  SETTLE:'SETTLE',
});

function transitionResult(status, active, extra={}) {
  return Object.freeze({
    status,
    revision:active.revision,
    from:active.from,
    to:active.to,
    swapped:active.swapped,
    ...extra,
  });
}

function transitionFailure(error, phase) {
  return Object.freeze({
    phase,
    errorName:error instanceof Error ? error.name : 'Error',
    message:error instanceof Error ? error.message : String(error),
  });
}

function validateTransitionRequest(request) {
  if (!request || typeof request !== 'object') throw new Error('transition request is required');
  const to=nonEmpty(request.to,'transition.to');
  const from=request.from == null ? null : nonEmpty(request.from,'transition.from');
  if (typeof request.applySwap !== 'function') throw new Error('transition.applySwap must be a function');
  return Object.freeze({
    from,
    to,
    applySwap:request.applySwap,
    reducedMotion:Boolean(request.reducedMotion),
    lowPerf:Boolean(request.lowPerf),
    reason:request.reason == null ? 'navigation' : nonEmpty(request.reason,'transition.reason'),
  });
}

export function createTransitionDirector({runPhase=async()=>{}}={}) {
  if (typeof runPhase !== 'function') throw new Error('runPhase must be a function');

  let revision=0;
  let phase=TRANSITION_PHASES.IDLE;
  let active=null;

  const current=(candidate)=>active !== null && active === candidate && revision === candidate.revision && !candidate.controller.signal.aborted;

  const snapshot=()=>Object.freeze({
    phase,
    revision,
    activeRevision:active?.revision ?? null,
    from:active?.from ?? null,
    to:active?.to ?? null,
    swapped:active?.swapped ?? false,
  });

  const setPhase=(candidate,nextPhase)=>{
    if (!current(candidate)) return false;
    phase=nextPhase;
    return true;
  };

  const phaseContext=(candidate,nextPhase)=>Object.freeze({
    phase:nextPhase,
    revision:candidate.revision,
    from:candidate.from,
    to:candidate.to,
    reason:candidate.reason,
    reducedMotion:candidate.reducedMotion,
    lowPerf:candidate.lowPerf,
    signal:candidate.controller.signal,
  });

  const runDriver=async(candidate,nextPhase)=>{
    if (!setPhase(candidate,nextPhase)) return false;
    await runPhase(nextPhase,phaseContext(candidate,nextPhase));
    return current(candidate);
  };

  const supersedeActive=({bumpRevision=false}={})=>{
    if (!active) return;
    const stale=active;
    active=null;
    if (bumpRevision) revision+=1;
    phase=TRANSITION_PHASES.IDLE;
    stale.controller.abort();
  };

  const cancel=()=>{
    if (!active) return false;
    supersedeActive({bumpRevision:true});
    return true;
  };

  const start=async(request)=>{
    const input=validateTransitionRequest(request);
    if (active) supersedeActive();
    const candidate={
      revision:revision+1,
      from:input.from,
      to:input.to,
      applySwap:input.applySwap,
      reducedMotion:input.reducedMotion,
      lowPerf:input.lowPerf,
      reason:input.reason,
      controller:new AbortController(),
      swapped:false,
    };
    revision=candidate.revision;
    active=candidate;

    try {
      if (!await runDriver(candidate,TRANSITION_PHASES.PREPARE)) return transitionResult('superseded',candidate);
      if (!await runDriver(candidate,TRANSITION_PHASES.EXIT)) return transitionResult('superseded',candidate);
      if (!setPhase(candidate,TRANSITION_PHASES.SWAP)) return transitionResult('superseded',candidate);
      const swapReturn=candidate.applySwap(phaseContext(candidate,TRANSITION_PHASES.SWAP));
      if (swapReturn && typeof swapReturn.then === 'function') throw new Error('transition.applySwap must be synchronous');
      candidate.swapped=true;
      if (!current(candidate)) return transitionResult('superseded',candidate);
      if (!await runDriver(candidate,TRANSITION_PHASES.SWAP)) return transitionResult('superseded',candidate);
      if (!await runDriver(candidate,TRANSITION_PHASES.ENTER)) return transitionResult('superseded',candidate);
      if (!await runDriver(candidate,TRANSITION_PHASES.SETTLE)) return transitionResult('superseded',candidate);
      if (!current(candidate)) return transitionResult('superseded',candidate);
      active=null;
      phase=TRANSITION_PHASES.IDLE;
      return transitionResult('completed',candidate);
    } catch (error) {
      if (!current(candidate) || candidate.controller.signal.aborted) {
        return transitionResult('superseded',candidate);
      }
      const failedPhase=phase;
      active=null;
      phase=TRANSITION_PHASES.IDLE;
      return transitionResult('failed',candidate,transitionFailure(error,failedPhase));
    }
  };

  return Object.freeze({
    start,
    cancel,
    getState:snapshot,
  });
}

export const ORIENTATION_PROJECTIONS = Object.freeze({
  LANDSCAPE:'landscape',
  PORTRAIT:'portrait',
});

export const ORIENTATION_TRANSITION_CAUSE = 'ORIENTATION_CHANGE';
export const ORIENTATION_MOTION_PROFILE = Object.freeze({
  NORMAL:'normal',
  REDUCED:'reduced',
  NONE:'none',
});

const ORIENTATION_VALUES = new Set(Object.values(ORIENTATION_PROJECTIONS));

function positiveFinite(v,label) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`${label} must be a finite positive number`);
  return v;
}

function orientationValue(v,label='orientation projection') {
  if (!ORIENTATION_VALUES.has(v)) throw new Error(`${label} must be landscape or portrait`);
  return v;
}

function requiredFunction(v,label) {
  if (typeof v !== 'function') throw new Error(`${label} must be a function`);
  return v;
}

function readFlag(source) {
  return Boolean(typeof source === 'function' ? source() : source);
}

function cloneFrozenData(value,label='semanticSnapshot') {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} numbers must be finite`);
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map((item,index)=>cloneFrozenData(item,`${label}[${index}]`)));
  if (typeof value === 'object') {
    const proto=Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error(`${label} must contain plain data only`);
    const result={};
    for (const [key,item] of Object.entries(value)) result[key]=cloneFrozenData(item,`${label}.${key}`);
    return Object.freeze(result);
  }
  throw new Error(`${label} must contain plain data only`);
}

function orientationMotionProfile(reducedMotion,lowPerf) {
  if (reducedMotion) return ORIENTATION_MOTION_PROFILE.NONE;
  if (lowPerf) return ORIENTATION_MOTION_PROFILE.REDUCED;
  return ORIENTATION_MOTION_PROFILE.NORMAL;
}

export function resolveOrientationProjection({width,height,currentProjection=null}={}) {
  const w=positiveFinite(width,'width');
  const h=positiveFinite(height,'height');
  if (w > h) return ORIENTATION_PROJECTIONS.LANDSCAPE;
  if (h > w) return ORIENTATION_PROJECTIONS.PORTRAIT;
  if (currentProjection !== null) return orientationValue(currentProjection,'currentProjection');
  throw new Error('square viewport requires currentProjection');
}

/**
 * Projects one stable game/screen state into landscape or portrait through the
 * existing TransitionDirector. It never owns navigation, gameplay, save, or
 * business state. The caller performs only a synchronous presentation swap at
 * SWAP; resize/safe-area stabilization belongs in runVisualPhase(SETTLE).
 */
export function createOrientationProjectionAdapter({
  getCurrentProjection,
  applyProjection,
  runVisualPhase=async()=>{},
  reducedMotion=false,
  lowPerf=false,
}={}) {
  requiredFunction(getCurrentProjection,'getCurrentProjection');
  requiredFunction(applyProjection,'applyProjection');
  requiredFunction(runVisualPhase,'runVisualPhase');

  const metadataByRevision=new Map();
  const director=createTransitionDirector({
    runPhase:async(phase,context)=>{
      const metadata=metadataByRevision.get(context.revision);
      const profile=orientationMotionProfile(context.reducedMotion,context.lowPerf);
      await runVisualPhase(phase,Object.freeze({
        ...context,
        motionProfile:profile,
        semanticSnapshot:metadata?.semanticSnapshot ?? null,
      }));
    },
  });

  const ignored=(status,from,to,reason)=>Object.freeze({
    status,
    revision:director.getState().revision,
    from,
    to,
    swapped:false,
    reason,
  });

  async function requestProjection(targetProjection,{semanticSnapshot=null,cause=ORIENTATION_TRANSITION_CAUSE}={}) {
    const target=orientationValue(targetProjection,'targetProjection');
    const current=orientationValue(getCurrentProjection(),'getCurrentProjection result');
    const state=director.getState();

    if (state.activeRevision !== null && state.to === target) {
      return ignored('ignored',current,target,'already_targeting_projection');
    }

    if (target === current) {
      if (state.activeRevision !== null) {
        director.cancel();
        return ignored('retained',current,current,'latest_projection_matches_current');
      }
      return ignored('ignored',current,current,'current_projection');
    }

    const expectedRevision=state.revision+1;
    const frozenSnapshot=cloneFrozenData(semanticSnapshot);
    metadataByRevision.set(expectedRevision,Object.freeze({semanticSnapshot:frozenSnapshot}));

    const result=await director.start({
      from:current,
      to:target,
      reason:nonEmpty(cause,'orientation cause'),
      reducedMotion:readFlag(reducedMotion),
      lowPerf:readFlag(lowPerf),
      applySwap:(context)=>{
        const applied=applyProjection(target,Object.freeze({
          from:current,
          to:target,
          cause,
          revision:context.revision,
          semanticSnapshot:frozenSnapshot,
        }));
        if (applied && typeof applied.then === 'function') throw new Error('applyProjection must be synchronous');
      },
    });

    metadataByRevision.delete(expectedRevision);
    return Object.freeze({...result,cause});
  }

  function requestViewport(viewport,options={}) {
    const current=orientationValue(getCurrentProjection(),'getCurrentProjection result');
    const target=resolveOrientationProjection({...viewport,currentProjection:current});
    return requestProjection(target,options);
  }

  return Object.freeze({
    requestProjection,
    requestViewport,
    cancel:director.cancel,
    getState:director.getState,
  });
}
