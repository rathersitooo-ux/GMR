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

const materialClamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));

export const MATERIAL_FEEDBACK_MATERIALS = Object.freeze({GUMMY:'gummy',DROPLET:'droplet',HARD:'hard',FLAT:'flat'});
export const MATERIAL_FEEDBACK_PHASES = Object.freeze({NORMAL:'normal',FOCUSED:'focused',PRESSED:'pressed',HOLD:'hold',CANCELLED:'cancelled',COMMITTED:'committed',SETTLED:'settled',DISABLED:'disabled'});

const MATERIAL_BASE = Object.freeze({scaleX:1,scaleY:1,translateXEm:0,translateYEm:0,rotateDeg:0,shadowCompression:0,rimTension:0,refraction:0,meniscus:0,specularLag:0,wobble:0,overshoot:0,durationMs:0,easing:'linear',particleStrength:0});
const MATERIAL_PROFILES = freeze({
  gummy:{
    normal:{}, focused:{rimTension:.16,durationMs:90,easing:'ease-out'},
    pressed:{scaleX:1.045,scaleY:.91,translateYEm:.045,shadowCompression:.72,rimTension:.68,specularLag:.18,durationMs:70,easing:'cubic-bezier(.2,.8,.25,1)'},
    hold:{scaleX:1.055,scaleY:.895,translateYEm:.052,shadowCompression:.8,rimTension:.82,specularLag:.24,wobble:.08,durationMs:110,easing:'ease-out'},
    cancelled:{scaleX:.992,scaleY:1.018,translateYEm:-.008,shadowCompression:.08,rimTension:.25,specularLag:.08,wobble:.18,overshoot:.28,durationMs:170,easing:'cubic-bezier(.2,.9,.25,1.2)'},
    committed:{scaleX:.98,scaleY:1.04,translateYEm:-.018,shadowCompression:.05,rimTension:.34,specularLag:.12,wobble:.42,overshoot:.55,durationMs:210,easing:'cubic-bezier(.15,.9,.25,1.25)'},
    settled:{rimTension:.08,durationMs:130,easing:'ease-out'}, disabled:{shadowCompression:.12,rimTension:.03}
  },
  droplet:{
    normal:{refraction:.22,meniscus:.28}, focused:{refraction:.27,meniscus:.34,rimTension:.12,durationMs:100,easing:'ease-out'},
    pressed:{scaleX:1.085,scaleY:.855,translateYEm:.055,shadowCompression:.78,rimTension:.76,refraction:.5,meniscus:.74,specularLag:.36,wobble:.06,durationMs:85,easing:'cubic-bezier(.18,.82,.22,1)'},
    hold:{scaleX:1.1,scaleY:.84,translateYEm:.06,shadowCompression:.84,rimTension:.86,refraction:.56,meniscus:.82,specularLag:.46,wobble:.16,durationMs:130,easing:'ease-out'},
    cancelled:{scaleX:.985,scaleY:1.025,translateYEm:-.012,shadowCompression:.08,rimTension:.38,refraction:.31,meniscus:.42,specularLag:.25,wobble:.38,overshoot:.36,durationMs:210,easing:'cubic-bezier(.17,.9,.22,1.22)'},
    committed:{scaleX:.955,scaleY:1.085,translateYEm:-.028,shadowCompression:.03,rimTension:.48,refraction:.4,meniscus:.5,specularLag:.34,wobble:.7,overshoot:.72,durationMs:280,easing:'cubic-bezier(.12,.92,.2,1.28)',particleStrength:.18},
    settled:{refraction:.24,meniscus:.3,rimTension:.08,durationMs:150,easing:'ease-out'}, disabled:{refraction:.08,meniscus:.12,shadowCompression:.1}
  },
  hard:{
    normal:{}, focused:{rimTension:.1,durationMs:70,easing:'ease-out'}, pressed:{scaleX:.992,scaleY:.965,translateYEm:.03,shadowCompression:.7,durationMs:55,easing:'ease-out'}, hold:{scaleX:.992,scaleY:.96,translateYEm:.034,shadowCompression:.76,durationMs:80,easing:'ease-out'}, cancelled:{overshoot:.08,durationMs:100,easing:'ease-out'}, committed:{scaleX:1.008,scaleY:1.008,overshoot:.12,durationMs:115,easing:'ease-out'}, settled:{durationMs:90,easing:'ease-out'}, disabled:{}
  },
  flat:{normal:{},focused:{rimTension:.06},pressed:{scaleX:.99,scaleY:.98,shadowCompression:.28,durationMs:50,easing:'ease-out'},hold:{scaleX:.99,scaleY:.98,shadowCompression:.32,durationMs:70,easing:'ease-out'},cancelled:{durationMs:70,easing:'ease-out'},committed:{durationMs:80,easing:'ease-out'},settled:{durationMs:70,easing:'ease-out'},disabled:{}}
});

function materialEnum(value, allowed, label) { if (!allowed.includes(value)) throw new Error(`unsupported ${label}: ${String(value)}`); }

export function projectMaterialFeedback({material=MATERIAL_FEEDBACK_MATERIALS.FLAT,phase=MATERIAL_FEEDBACK_PHASES.NORMAL,localX=.5,localY=.5,reducedMotion=false,lowPerf=false}={}) {
  materialEnum(material,Object.values(MATERIAL_FEEDBACK_MATERIALS),'material');
  materialEnum(phase,Object.values(MATERIAL_FEEDBACK_PHASES),'phase');
  if (!Number.isFinite(Number(localX)) || !Number.isFinite(Number(localY))) throw new Error('localX/localY must be finite');
  const x=materialClamp(localX), y=materialClamp(localY), impactX=(x-.5)*2, impactY=(y-.5)*2;
  const profile={...MATERIAL_BASE,...(MATERIAL_PROFILES[material][phase]||{})};
  const isContact=phase==='pressed'||phase==='hold', isRelease=phase==='cancelled'||phase==='committed';
  let durationMs=profile.durationMs,wobble=profile.wobble,overshoot=profile.overshoot,particleStrength=profile.particleStrength,refraction=profile.refraction,specularLag=profile.specularLag;
  if(reducedMotion){durationMs=0;wobble=0;overshoot=0;particleStrength=0;specularLag=0;}
  else if(lowPerf){durationMs=Math.min(durationMs,120);wobble*=.35;overshoot*=.5;particleStrength=0;refraction=0;specularLag*=.4;}
  const lateralYield=material==='droplet'?.032:material==='gummy'?.018:.006;
  const contactBias=isContact?1:isRelease?.35:0;
  const translateXEm=profile.translateXEm+impactX*lateralYield*contactBias;
  const rotateDeg=(material==='droplet'?impactX*1.4:material==='gummy'?impactX*.7:0)*contactBias;
  const highlightX=materialClamp(x-impactX*specularLag*.18), highlightY=materialClamp(y-impactY*specularLag*.14);
  const hapticIntent=phase==='pressed'?(material==='gummy'||material==='droplet'?'soft_press':'crisp_press'):phase==='committed'?(material==='droplet'?'liquid_release':material==='gummy'?'elastic_release':'confirm'):null;
  return freeze({material,phase,contact:{x,y},transform:{scaleX:profile.scaleX,scaleY:profile.scaleY,translateXEm,translateYEm:profile.translateYEm,rotateDeg},surface:{shadowCompression:profile.shadowCompression,rimTension:profile.rimTension,refraction,meniscus:profile.meniscus,specularLag,highlightX,highlightY},motion:{durationMs,easing:reducedMotion?'linear':profile.easing,wobble,overshoot,particleStrength},channels:{hapticIntent,audioIntent:phase==='pressed'?'press':phase==='committed'?'release_confirm':phase==='cancelled'?'release_cancel':null},invariants:{mutatesActionState:false,requiresStableHitbox:true,reducedMotion:Boolean(reducedMotion),lowPerf:Boolean(lowPerf)}});
}

export function materialFeedbackCssVars(projection) {
  if (!projection || projection.invariants?.mutatesActionState!==false) throw new Error('invalid material projection');
  const {transform,surface,motion,contact}=projection;
  return freeze({'--mf-scale-x':String(transform.scaleX),'--mf-scale-y':String(transform.scaleY),'--mf-translate-x':`${transform.translateXEm}em`,'--mf-translate-y':`${transform.translateYEm}em`,'--mf-rotate':`${transform.rotateDeg}deg`,'--mf-contact-x':`${contact.x*100}%`,'--mf-contact-y':`${contact.y*100}%`,'--mf-highlight-x':`${surface.highlightX*100}%`,'--mf-highlight-y':`${surface.highlightY*100}%`,'--mf-shadow-compression':String(surface.shadowCompression),'--mf-rim-tension':String(surface.rimTension),'--mf-refraction':String(surface.refraction),'--mf-meniscus':String(surface.meniscus),'--mf-wobble':String(motion.wobble),'--mf-overshoot':String(motion.overshoot),'--mf-duration':`${motion.durationMs}ms`,'--mf-easing':motion.easing});
}
