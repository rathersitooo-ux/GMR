import {
  AUTO_RANK_RESULT_RECEIPT_LEDGER_CORE,
  restoreAutoRankResultReceiptLedger,
} from './auto-rank-result-receipt-ledger-core.mjs';

const SCHEMA = 'gameroad.auto-rank-result-receipt-projection.v1';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function projectAutoRankResultReceipts(ledger) {
  const restored = restoreAutoRankResultReceiptLedger(ledger);

  return deepFreeze({
    schema: SCHEMA,
    sourceSchema: AUTO_RANK_RESULT_RECEIPT_LEDGER_CORE.schema,
    seasonId: restored.seasonId,
    competitionId: restored.competitionId,
    versions: { ...restored.versions },
    receipts: [...restored.receipts].reverse(),
  });
}

export const AUTO_RANK_RESULT_RECEIPT_PROJECTION = Object.freeze({
  schema: SCHEMA,
});
