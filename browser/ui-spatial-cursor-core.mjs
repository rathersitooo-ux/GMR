const DEFAULT_CONFIG = Object.freeze({
  deadzone: 0.12,
  maxSpeed: 980,
  responseExponent: 1.45,
  acquireRadius: 28,
  releaseRadius: 52,
  directionWeight: 22,
  switchMargin: 10,
});

function finite(v,label) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${label} must be a finite number`);
  return v;
}
function nonNegative(v,label) {
  finite(v,label);
  if (v < 0) throw new Error(`${label} must be non-negative`);
  return v;
}
function positive(v,label) {
  finite(v,label);
  if (v <= 0) throw new Error(`${label} must be positive`);
  return v;
}
function clamp(v,min,max) { return Math.min(max,Math.max(min,v)); }
function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const item of Object.values(v)) freeze(item);
  }
  return v;
}

function normalizeConfig(config={}) {
  const c={...DEFAULT_CONFIG,...config};
  nonNegative(c.deadzone,'deadzone');
  if (c.deadzone >= 1) throw new Error('deadzone must be less than 1');
  positive(c.maxSpeed,'maxSpeed');
  positive(c.responseExponent,'responseExponent');
  nonNegative(c.acquireRadius,'acquireRadius');
  nonNegative(c.releaseRadius,'releaseRadius');
  if (c.releaseRadius < c.acquireRadius) throw new Error('releaseRadius must be >= acquireRadius');
  nonNegative(c.directionWeight,'directionWeight');
  nonNegative(c.switchMargin,'switchMargin');
  return Object.freeze(c);
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== 'object') throw new Error('viewport is required');
  const width=positive(viewport.width,'viewport.width');
  const height=positive(viewport.height,'viewport.height');
  return Object.freeze({width,height});
}

function normalizePoint(point,label='position') {
  if (!point || typeof point !== 'object') throw new Error(`${label} is required`);
  return Object.freeze({x:finite(point.x,`${label}.x`),y:finite(point.y,`${label}.y`)});
}

function normalizeRect(rect,label) {
  if (!rect || typeof rect !== 'object') throw new Error(`${label}.rect is required`);
  const x=finite(rect.x,`${label}.rect.x`);
  const y=finite(rect.y,`${label}.rect.y`);
  const width=nonNegative(rect.width,`${label}.rect.width`);
  const height=nonNegative(rect.height,`${label}.rect.height`);
  return Object.freeze({x,y,width,height});
}

function normalizeCandidate(candidate,index) {
  const label=`candidates[${index}]`;
  if (!candidate || typeof candidate !== 'object') throw new Error(`${label} must be an object`);
  if (typeof candidate.id !== 'string' || candidate.id === '') throw new Error(`${label}.id must be a non-empty string`);
  return Object.freeze({
    id:candidate.id,
    rect:normalizeRect(candidate.rect,label),
    selectable:candidate.selectable !== false && candidate.visible !== false && candidate.enabled !== false,
    priority:candidate.priority == null ? 0 : finite(candidate.priority,`${label}.priority`),
    zIndex:candidate.zIndex == null ? 0 : finite(candidate.zIndex,`${label}.zIndex`),
  });
}

function normalizedStick(stick,deadzone) {
  const p=normalizePoint(stick,'input');
  const rawMagnitude=Math.hypot(p.x,p.y);
  if (rawMagnitude <= deadzone || rawMagnitude === 0) return Object.freeze({x:0,y:0,magnitude:0});
  const bounded=Math.min(rawMagnitude,1);
  const magnitude=(bounded-deadzone)/(1-deadzone);
  return Object.freeze({x:p.x/rawMagnitude,y:p.y/rawMagnitude,magnitude});
}

function distanceToRect(point,rect) {
  const dx=Math.max(rect.x-point.x,0,point.x-(rect.x+rect.width));
  const dy=Math.max(rect.y-point.y,0,point.y-(rect.y+rect.height));
  return Math.hypot(dx,dy);
}

function directionPenalty(point,rect,movement,directionWeight) {
  if (movement.magnitude === 0 || directionWeight === 0) return 0;
  const nearestX=clamp(point.x,rect.x,rect.x+rect.width);
  const nearestY=clamp(point.y,rect.y,rect.y+rect.height);
  const dx=nearestX-point.x;
  const dy=nearestY-point.y;
  const distance=Math.hypot(dx,dy);
  if (distance === 0) return 0;
  const alignment=(dx/distance)*movement.x+(dy/distance)*movement.y;
  return (1-clamp(alignment,-1,1))*directionWeight;
}

function compareScored(a,b) {
  const scoreDelta=a.score-b.score;
  if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
  if (a.distance !== b.distance) return a.distance-b.distance;
  if (a.priority !== b.priority) return b.priority-a.priority;
  if (a.zIndex !== b.zIndex) return b.zIndex-a.zIndex;
  return a.id.localeCompare(b.id);
}

function scoreCandidate(candidate,point,movement,config) {
  const distance=distanceToRect(point,candidate.rect);
  return Object.freeze({
    id:candidate.id,
    distance,
    score:distance+directionPenalty(point,candidate.rect,movement,config.directionWeight),
    priority:candidate.priority,
    zIndex:candidate.zIndex,
  });
}

function chooseFocus(point,movement,candidates,currentFocusId,config) {
  const eligible=candidates.filter(candidate=>candidate.selectable);
  if (eligible.length === 0) return null;
  const scored=eligible.map(candidate=>scoreCandidate(candidate,point,movement,config)).sort(compareScored);
  const best=scored[0];
  const current=scored.find(item=>item.id===currentFocusId) ?? null;

  if (current && current.distance <= config.releaseRadius) {
    if (best.id === current.id) return current.id;
    if (best.distance === 0 && current.distance > 0) return best.id;
    if (best.distance <= config.acquireRadius && best.score+config.switchMargin < current.score) return best.id;
    return current.id;
  }
  return best.distance <= config.acquireRadius ? best.id : null;
}

export function advanceSpatialCursor(state={}, input={}, candidates=[], viewport, config={}) {
  if (!Array.isArray(candidates)) throw new Error('candidates must be an array');
  const c=normalizeConfig(config);
  const vp=normalizeViewport(viewport);
  const position=normalizePoint(state.position ?? {x:0,y:0});
  const currentFocusId=state.focusId == null ? null : String(state.focusId);
  const dt=nonNegative(input.dtSeconds ?? 0,'input.dtSeconds');
  const movement=normalizedStick(input.stick ?? {x:0,y:0},c.deadzone);
  const speed=c.maxSpeed*Math.pow(movement.magnitude,c.responseExponent);
  const nextPosition=Object.freeze({
    x:clamp(position.x+movement.x*speed*dt,0,vp.width),
    y:clamp(position.y+movement.y*speed*dt,0,vp.height),
  });
  const normalizedCandidates=candidates.map(normalizeCandidate);
  const focusId=chooseFocus(nextPosition,movement,normalizedCandidates,currentFocusId,c);
  return freeze({position:nextPosition,focusId});
}

export const UI_SPATIAL_CURSOR_DEFAULT_CONFIG = DEFAULT_CONFIG;
