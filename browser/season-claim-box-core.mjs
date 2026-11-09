// season-claim-box-core.mjs -- S1-12
// Claim box ("受け取り箱"): the present box the local copy does not have yet.
// Grants are recorded by id, so the same reward can never be claimed twice,
// even if the claim button is pressed twice or the closing job runs twice.
// Expiry is checked against an explicit day key ({month, day}) so tests can
// drive it without a clock. Expired grants are not deleted silently: they
// are listed as expired and their manny conversion is reported by the
// closing core.

const SCHEMA = 'gameroad.season-claim-box.v1';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function dayNumber({ month, day }) {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new TypeError('MONTH_INVALID');
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth[month - 1]) throw new TypeError('DAY_INVALID');
  return daysInMonth.slice(0, month - 1).reduce((sum, d) => sum + d, 0) + day;
}

function assertBox(box) {
  if (!box || typeof box !== 'object' || box.schema !== SCHEMA) throw new TypeError('CLAIM_BOX_REQUIRED');
  if (!Array.isArray(box.grants)) throw new TypeError('GRANTS_INVALID');
  return box;
}

export function createClaimBox({ grants = [] } = {}) {
  const seen = new Set();
  const clean = [];
  for (const grant of grants) {
    if (!grant || typeof grant.id !== 'string' || !grant.id || seen.has(grant.id)) continue;
    seen.add(grant.id);
    clean.push(freeze({ id: grant.id, reward: freeze({ ...grant.reward }), claimed: grant.claimed === true, expiresDay: grant.expiresDay ?? null }));
  }
  return freeze({ schema: SCHEMA, grants: Object.freeze(clean) });
}

export function grantToClaimBox(box, { id, reward, expiresDay = null } = {}) {
  assertBox(box);
  if (typeof id !== 'string' || !id) throw new TypeError('GRANT_ID_REQUIRED');
  if (box.grants.some((grant) => grant.id === id)) return freeze({ box, granted: false, reason: 'ALREADY_GRANTED' });
  const next = freeze({
    ...box,
    grants: Object.freeze([...box.grants, freeze({ id, reward: freeze({ ...reward }), claimed: false, expiresDay })]),
  });
  return freeze({ box: next, granted: true, reason: 'OK' });
}

export function claimFromBox(box, id, today) {
  assertBox(box);
  const grant = box.grants.find((entry) => entry.id === id);
  if (!grant) return freeze({ box, claimed: false, reason: 'NOT_FOUND' });
  if (grant.claimed) return freeze({ box, claimed: false, reason: 'ALREADY_CLAIMED' });
  if (grant.expiresDay !== null && today) {
    if (dayNumber(today) > grant.expiresDay) return freeze({ box, claimed: false, reason: 'EXPIRED' });
  }
  const next = freeze({
    ...box,
    grants: Object.freeze(box.grants.map((entry) => (entry.id === id ? freeze({ ...entry, claimed: true }) : entry))),
  });
  return freeze({ box: next, claimed: true, reason: 'OK', reward: grant.reward });
}

export function listClaimable(box, today) {
  assertBox(box);
  const list = box.grants.filter((grant) => {
    if (grant.claimed) return false;
    if (grant.expiresDay !== null && today) return dayNumber(today) <= grant.expiresDay;
    return true;
  });
  return freeze(list);
}

export function listExpired(box, today) {
  assertBox(box);
  if (!today) return freeze([]);
  return freeze(box.grants.filter((grant) => !grant.claimed && grant.expiresDay !== null && dayNumber(today) > grant.expiresDay));
}

export function claimBoxSummary(box, today) {
  assertBox(box);
  return freeze({
    total: box.grants.length,
    claimed: box.grants.filter((grant) => grant.claimed).length,
    claimable: listClaimable(box, today).length,
    expired: listExpired(box, today).length,
  });
}

export { dayNumber };
