export const NEW_BASE_GOAL_BAND_KIND = "GOAL_BAND";
export const NEW_BASE_GOAL_BAND_PLACEMENT = "ABOVE_SHIELDS";

function requireBandId(bandId) {
  if (typeof bandId !== "string" || bandId.trim() === "") {
    throw new TypeError("bandId must be a non-empty string");
  }
  return bandId;
}

export function createNewBaseGoalBand({ bandId } = {}) {
  return Object.freeze({
    bandId: requireBandId(bandId),
    kind: NEW_BASE_GOAL_BAND_KIND,
    placement: NEW_BASE_GOAL_BAND_PLACEMENT,
  });
}
