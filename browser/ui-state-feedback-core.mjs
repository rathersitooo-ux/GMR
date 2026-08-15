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
