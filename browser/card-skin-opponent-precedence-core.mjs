function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function freezeSelection(source, skin) {
  const selection = { source, skin: cloneJson(skin) };
  if (selection.skin && typeof selection.skin === 'object') Object.freeze(selection.skin);
  return Object.freeze(selection);
}

export function resolveOpponentCardSkin({
  viewerPreference,
  opponentEquippedSkin,
  defaultSkin,
} = {}) {
  if (viewerPreference !== undefined && viewerPreference !== null) {
    return freezeSelection('viewer_preference', viewerPreference);
  }
  if (opponentEquippedSkin !== undefined && opponentEquippedSkin !== null) {
    return freezeSelection('opponent_equipped', opponentEquippedSkin);
  }
  return freezeSelection('default', defaultSkin ?? null);
}
