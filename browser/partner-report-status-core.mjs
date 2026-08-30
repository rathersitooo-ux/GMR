export const PARTNER_REPORT_STATUS = Object.freeze({
  ACCEPTED: 'accepted',
  DUPLICATE: 'duplicate',
  REVIEWING: 'reviewing',
  NEEDS_INFO: 'needs_info',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CONFLICT: 'conflict',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
});

export const PARTNER_REPORT_NEXT_ACTION = Object.freeze({
  NONE: 'none',
  ADD_INFO: 'add_info',
  VERIFY_RESOLUTION: 'verify_resolution',
  RETRY_STATUS: 'retry_status',
});

const STATUS_ALIASES = Object.freeze(new Map([
  ['accepted', PARTNER_REPORT_STATUS.ACCEPTED],
  ['received', PARTNER_REPORT_STATUS.ACCEPTED],
  ['received_unique', PARTNER_REPORT_STATUS.ACCEPTED],
  ['unique_accepted', PARTNER_REPORT_STATUS.ACCEPTED],
  ['duplicate', PARTNER_REPORT_STATUS.DUPLICATE],
  ['already_received', PARTNER_REPORT_STATUS.DUPLICATE],
  ['reviewing', PARTNER_REPORT_STATUS.REVIEWING],
  ['pending', PARTNER_REPORT_STATUS.REVIEWING],
  ['in_review', PARTNER_REPORT_STATUS.REVIEWING],
  ['needs_info', PARTNER_REPORT_STATUS.NEEDS_INFO],
  ['more_info_required', PARTNER_REPORT_STATUS.NEEDS_INFO],
  ['resolved', PARTNER_REPORT_STATUS.RESOLVED],
  ['fixed', PARTNER_REPORT_STATUS.RESOLVED],
  ['completed', PARTNER_REPORT_STATUS.RESOLVED],
  ['rejected', PARTNER_REPORT_STATUS.REJECTED],
  ['invalid', PARTNER_REPORT_STATUS.REJECTED],
  ['conflict', PARTNER_REPORT_STATUS.CONFLICT],
  ['failed', PARTNER_REPORT_STATUS.FAILED],
  ['unavailable', PARTNER_REPORT_STATUS.FAILED],
]));

const REASON_DETAILS = Object.freeze({
  insufficient_information: '確認に必要な情報が不足しています。',
  unsupported_report_type: 'この種類の報告は現在受け付けていません。',
  content_conflict: '同じ報告IDに異なる内容が確認されました。',
  temporary_unavailable: '一時的に状態を確認できません。',
});

const PRESENTATION = Object.freeze({
  [PARTNER_REPORT_STATUS.ACCEPTED]: Object.freeze({
    level: 'success', ariaLive: 'polite', role: 'status', message: '報告を受け付けました。', nextAction: PARTNER_REPORT_NEXT_ACTION.NONE,
  }),
  [PARTNER_REPORT_STATUS.DUPLICATE]: Object.freeze({
    level: 'info', ariaLive: 'polite', role: 'status', message: 'この報告はすでに受け付けています。', nextAction: PARTNER_REPORT_NEXT_ACTION.NONE,
  }),
  [PARTNER_REPORT_STATUS.REVIEWING]: Object.freeze({
    level: 'info', ariaLive: 'polite', role: 'status', message: '報告を確認中です。', nextAction: PARTNER_REPORT_NEXT_ACTION.NONE,
  }),
  [PARTNER_REPORT_STATUS.NEEDS_INFO]: Object.freeze({
    level: 'warning', ariaLive: 'polite', role: 'status', message: '確認に追加情報が必要です。', nextAction: PARTNER_REPORT_NEXT_ACTION.ADD_INFO,
  }),
  [PARTNER_REPORT_STATUS.RESOLVED]: Object.freeze({
    level: 'success', ariaLive: 'polite', role: 'status', message: '報告への対応が完了しています。必要ならもう一度確認できます。', nextAction: PARTNER_REPORT_NEXT_ACTION.VERIFY_RESOLUTION,
  }),
  [PARTNER_REPORT_STATUS.REJECTED]: Object.freeze({
    level: 'error', ariaLive: 'assertive', role: 'alert', message: 'この報告は受け付けられませんでした。', nextAction: PARTNER_REPORT_NEXT_ACTION.NONE,
  }),
  [PARTNER_REPORT_STATUS.CONFLICT]: Object.freeze({
    level: 'error', ariaLive: 'assertive', role: 'alert', message: '同じ報告IDに異なる内容があるため、状態を確定できません。', nextAction: PARTNER_REPORT_NEXT_ACTION.NONE,
  }),
  [PARTNER_REPORT_STATUS.FAILED]: Object.freeze({
    level: 'error', ariaLive: 'assertive', role: 'alert', message: '報告状態を確認できませんでした。', nextAction: PARTNER_REPORT_NEXT_ACTION.RETRY_STATUS,
  }),
  [PARTNER_REPORT_STATUS.UNKNOWN]: Object.freeze({
    level: 'info', ariaLive: 'polite', role: 'status', message: '報告状態はまだ確認できません。', nextAction: PARTNER_REPORT_NEXT_ACTION.RETRY_STATUS,
  }),
});

export function normalizePartnerReportStatus(value) {
  if (typeof value !== 'string') return PARTNER_REPORT_STATUS.UNKNOWN;
  return STATUS_ALIASES.get(value.trim().toLowerCase()) ?? PARTNER_REPORT_STATUS.UNKNOWN;
}

function projectKnownReason(reasonCode) {
  if (typeof reasonCode !== 'string') return null;
  return REASON_DETAILS[reasonCode.trim().toLowerCase()] ?? null;
}

export function projectPartnerReportStatus(input = {}) {
  const status = normalizePartnerReportStatus(input?.status);
  const presentation = PRESENTATION[status];
  return Object.freeze({
    kind: 'status',
    speakerId: 'system',
    status,
    key: `partner_report_${status}`,
    level: presentation.level,
    role: presentation.role,
    ariaLive: presentation.ariaLive,
    message: presentation.message,
    detail: projectKnownReason(input?.reasonCode),
    nextAction: presentation.nextAction,
    authoritative: input?.authoritative === true,
  });
}
