/**
 * Read-only Battle Phase projection: use the event's accepted public target order.
 * Never infer targets, hits or outcomes from seating, art or the presentation DOM.
 */
export function selectBattleCinematicAcceptedActors(model) {
  if (model?.presentationOnly !== true || model?.gameplayAuthority !== false ||
      model?.gameStateWrite !== false || model?.screenMode !== 'BATTLE_PHASE' ||
      model?.battlePhasePresentationMode !== 'FULLSCREEN_ANIMATION' ||
      (model?.phase !== 'attack' && model?.phase !== 'ability') ||
      typeof model?.eventId !== 'string' || !model.eventId.trim() ||
      !Array.isArray(model.lanes) || model.lanes.length !== 4) return null;
  const lanes = model.lanes;
  const playerIds = lanes.map(row => row?.id);
  if (playerIds.some(id => typeof id !== 'string' || !id || id !== id.trim()) ||
      new Set(playerIds).size !== 4) return null;
  const sourceLanes = lanes.filter(row => row.role === 'source');
  const targetLanes = lanes.filter(row => row.role === 'target');
  if (sourceLanes.length !== 1 || targetLanes.length < 1 || targetLanes.length > 3) return null;
  const source = sourceLanes[0];
  const focus = model.focus;
  if (focus?.causeId !== source.id || !Array.isArray(focus.targetIds) ||
      focus.targetIds.length !== targetLanes.length ||
      new Set(focus.targetIds).size !== targetLanes.length) return null;
  const targetsById = new Map(targetLanes.map(lane => [lane.id, lane]));
  const targets = [];
  for (const id of focus.targetIds) {
    if (typeof id !== 'string' || !id || id !== id.trim() ||
        id === source.id || !targetsById.has(id)) return null;
    targets.push(targetsById.get(id));
  }
  return Object.freeze({
    source,
    targets: Object.freeze(targets),
    orderedTargetIds: Object.freeze([...focus.targetIds]),
    multiTarget: targets.length > 1
  });
}
