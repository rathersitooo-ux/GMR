// セリフの編集とカスタマイズの核。
//
// 決まっていること（ライカの決め、2026-11-07〜08）:
// - 生の会話文は送らない。個人情報が入る可能性があることと、選んでいない文を
//   そのまま入れるとキャラが壊れるから。送るのは利用者が選んだものだけ。
// - キャラ側のセリフは利用者が好きに編集できる。
// - 会話中に出たセリフを添削して、直したものを提案として送れる（書き換え提案）。
// - 台詞の編集と着せ替えを合わせて、利用者へのカスタマイズ機能として提供する。
// - ゲーム内の会話（バトル時＝役になりきる形）と日常の会話（普段＝癒す形）は
//   分ける。少しだけつながりはあるが、それぞれ別にする。
//
// 今ある仕組みとの違い（2026-11-08に写しで自分で確かめた範囲）:
// - partner-dialogue-feedback-core はバトル後の1行だけが対象で、編集は
//   集合知の候補として送られるだけ。自分のゲームには反映されない。
// - partner-conversation-core の会話中のセリフは良い/悪いの評価だけで、
//   編集の入口がない。
// - 着せ替え（partner-costume-core）は衣装だけの保存で、セリフと合わさって
//   いない。
// このファイルは、その足りない所だけを足す。既存の核は変更しない。
//
// このファイルが守ること:
// - 自分用カスタムは端末の中だけ（personalOnly）。正本のセリフは書き換えない。
// - バトル用に直したセリフは日常には出ない。日常用もバトルには出ない。
// - 書き換え提案に入るのは、利用者が選んだキャラ側のセリフと、その直した文
//   だけ。利用者の会話文（生文）が混ざった入力は、提案を作らずに落とす。

import {
  normalizePartnerVoiceTuning,
  PARTNER_DIALOGUE_FEEDBACK_MAX_TEXT,
} from './partner-dialogue-feedback-core.mjs';
import { PARTNER_COSTUME_SNAPSHOT_SCHEMA } from './partner-costume-core.mjs';

export const PARTNER_DIALOGUE_MODES = Object.freeze(['battle', 'daily']);
export const PARTNER_DIALOGUE_CUSTOMIZATION_SCHEMA = 'partner-dialogue-customization-v1';
export const PARTNER_CUSTOMIZATION_PROFILE_SCHEMA = 'partner-customization-profile-v1';
export const PARTNER_DIALOGUE_REWRITE_PROPOSAL_SCHEMA = 'gameroad.partner-dialogue-rewrite-proposal.v1';

// 生の会話文が紛れ込む入口。1つでも入っていたら提案は作らない。
const RAW_CONVERSATION_KEYS = Object.freeze([
  'userMessage',
  'userText',
  'rawConversation',
  'conversationHistory',
  'sessionContext',
  'chatLog',
]);

function fail(message) {
  throw new TypeError(message);
}

function exactToken(value, max = 160) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text !== value || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) return null;
  return text;
}

function dialogueText(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > PARTNER_DIALOGUE_FEEDBACK_MAX_TEXT
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return null;
  return text;
}

function requireMode(value) {
  if (!PARTNER_DIALOGUE_MODES.includes(value)) fail(`unsupported dialogue mode: ${String(value)}`);
  return value;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('custom line entry must be an object');
  const partnerId = exactToken(raw.partnerId);
  const mode = PARTNER_DIALOGUE_MODES.includes(raw.mode) ? raw.mode : null;
  const sourceLineId = exactToken(raw.sourceLineId);
  const originalText = dialogueText(raw.originalText);
  const customText = dialogueText(raw.customText);
  if (!partnerId) fail('custom line partnerId must be a non-empty token');
  if (!mode) fail(`unsupported dialogue mode: ${String(raw.mode)}`);
  if (!sourceLineId) fail('custom line sourceLineId must be a non-empty token');
  if (!originalText) fail('custom line originalText is invalid');
  if (!customText) fail('custom line customText is invalid');
  if (customText === originalText) fail('custom line must differ from the original line');
  return Object.freeze({ partnerId, mode, sourceLineId, originalText, customText });
}

function entryKey(entry) {
  return `${entry.partnerId}\u001f${entry.mode}\u001f${entry.sourceLineId}`;
}

export function createPartnerDialogueCustomizationSnapshot(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('dialogue customization snapshot must be an object');
  }
  if (input.schema !== undefined && input.schema !== PARTNER_DIALOGUE_CUSTOMIZATION_SCHEMA) {
    fail(`unsupported dialogue customization schema: ${String(input.schema)}`);
  }
  const rawEntries = input.entries === undefined ? [] : input.entries;
  if (!Array.isArray(rawEntries)) fail('dialogue customization entries must be an array');
  const seen = new Set();
  const entries = [];
  for (const raw of rawEntries) {
    const entry = normalizeEntry(raw);
    const key = entryKey(entry);
    if (seen.has(key)) fail(`duplicate custom line: ${entry.partnerId}/${entry.mode}/${entry.sourceLineId}`);
    seen.add(key);
    entries.push(entry);
  }
  return Object.freeze({
    schema: PARTNER_DIALOGUE_CUSTOMIZATION_SCHEMA,
    entries: Object.freeze(entries),
  });
}

export function setPartnerCustomLine(snapshot, entryInput = {}) {
  const base = createPartnerDialogueCustomizationSnapshot(snapshot);
  const entry = normalizeEntry(entryInput);
  const key = entryKey(entry);
  const entries = base.entries.filter((candidate) => entryKey(candidate) !== key);
  entries.push(entry);
  return createPartnerDialogueCustomizationSnapshot({ entries });
}

export function clearPartnerCustomLine(snapshot, { partnerId, mode, sourceLineId } = {}) {
  const base = createPartnerDialogueCustomizationSnapshot(snapshot);
  const id = exactToken(partnerId);
  const lineId = exactToken(sourceLineId);
  const wantedMode = PARTNER_DIALOGUE_MODES.includes(mode) ? mode : null;
  if (!id || !lineId || !wantedMode) fail('clearPartnerCustomLine requires partnerId, mode and sourceLineId');
  const entries = base.entries.filter(
    (entry) => !(entry.partnerId === id && entry.mode === wantedMode && entry.sourceLineId === lineId),
  );
  return createPartnerDialogueCustomizationSnapshot({ entries });
}

export function listPartnerCustomLines(snapshot, { partnerId = null, mode = null } = {}) {
  const base = createPartnerDialogueCustomizationSnapshot(snapshot);
  const id = partnerId === null ? null : exactToken(partnerId);
  const wantedMode = mode === null ? null : (PARTNER_DIALOGUE_MODES.includes(mode) ? mode : fail(`unsupported dialogue mode: ${String(mode)}`));
  return Object.freeze(base.entries.filter((entry) => {
    if (id !== null && entry.partnerId !== id) return false;
    if (wantedMode !== null && entry.mode !== wantedMode) return false;
    return true;
  }));
}

// その場面（バトル/日常）で実際に言うセリフを決める。
// 自分用カスタムがあればそれを、なければ正式なセリフをそのまま返す。
// 別の場面用に直したセリフが漏れることはない。
export function resolvePartnerCustomLine(snapshot, { partnerId, mode, sourceLineId, approvedText } = {}) {
  const base = createPartnerDialogueCustomizationSnapshot(snapshot);
  const id = exactToken(partnerId);
  const lineId = exactToken(sourceLineId);
  const approved = dialogueText(approvedText);
  const wantedMode = requireMode(mode);
  if (!id || !lineId || !approved) fail('resolvePartnerCustomLine requires partnerId, sourceLineId and approvedText');
  const custom = base.entries.find(
    (entry) => entry.partnerId === id && entry.mode === wantedMode && entry.sourceLineId === lineId,
  );
  return Object.freeze({
    partnerId: id,
    mode: wantedMode,
    sourceLineId: lineId,
    text: custom ? custom.customText : approved,
    customized: Boolean(custom),
    scope: custom ? 'personal_only' : 'approved',
    canonicalWrite: false,
    sharedWithOthers: false,
  });
}

// 書き換え提案。利用者が選んだキャラ側のセリフだけが対象。
// - selected が true でないものは提案にしない（選んでいない文は送らない）。
// - 利用者の会話文（生文）のキーが1つでも混ざっていたら作らない。
// - 提案は候補止まり。正本へは自動で書かない。
export function buildPartnerDialogueRewriteProposal(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  for (const key of RAW_CONVERSATION_KEYS) {
    if (key in input) return null;
  }
  if (input.selected !== true) return null;
  const partnerId = exactToken(input.partnerId);
  const mode = PARTNER_DIALOGUE_MODES.includes(input.mode) ? input.mode : null;
  const sourceLineId = exactToken(input.sourceLineId);
  const originalText = dialogueText(input.originalText);
  const proposedText = dialogueText(input.proposedText);
  if (!partnerId || !mode || !sourceLineId || !originalText || !proposedText) return null;
  if (proposedText === originalText) return null;
  return Object.freeze({
    schema: PARTNER_DIALOGUE_REWRITE_PROPOSAL_SCHEMA,
    kind: 'dialogue_rewrite_proposal',
    partnerId,
    mode,
    sourceLineId,
    proposedText,
    voiceTuning: normalizePartnerVoiceTuning(input.voiceTuning ?? {}),
    userSelected: true,
    containsRawConversation: false,
    rawConversationSent: false,
    candidateOnly: true,
    canonicalWrite: false,
  });
}

// 台詞の編集と着せ替えを合わせた、利用者へのカスタマイズの姿。
// 着せ替えの保存（partner-costume-core の snapshot）と、セリフの自分用
// カスタムを、パートナー1人分として1つにまとめて返す。
export function buildPartnerCustomizationProfile({ partnerId, costumeSnapshot = null, dialogueSnapshot = null } = {}) {
  const id = exactToken(partnerId);
  if (!id) return null;

  let costume = null;
  if (costumeSnapshot !== null && costumeSnapshot !== undefined) {
    if (!costumeSnapshot || typeof costumeSnapshot !== 'object' || Array.isArray(costumeSnapshot)) return null;
    if (costumeSnapshot.schema !== PARTNER_COSTUME_SNAPSHOT_SCHEMA) return null;
    const partnerCostume = costumeSnapshot.partners?.[id];
    if (!partnerCostume || typeof partnerCostume !== 'object') return null;
    const selection = partnerCostume.savedSelection ?? {};
    costume = Object.freeze({
      savedSelection: Object.freeze({
        shoes: selection.shoes ?? null,
        coord: selection.coord ?? null,
        accessory: selection.accessory ?? null,
      }),
      ownedCount: Array.isArray(partnerCostume.ownedItemIds) ? partnerCostume.ownedItemIds.length : 0,
    });
  }

  let dialogue = null;
  if (dialogueSnapshot !== null && dialogueSnapshot !== undefined) {
    let normalized;
    try {
      normalized = createPartnerDialogueCustomizationSnapshot(dialogueSnapshot);
    } catch {
      return null;
    }
    const mine = normalized.entries.filter((entry) => entry.partnerId === id);
    dialogue = Object.freeze({
      battle: Object.freeze(mine.filter((entry) => entry.mode === 'battle')),
      daily: Object.freeze(mine.filter((entry) => entry.mode === 'daily')),
      customCount: mine.length,
    });
  }

  if (!costume && !dialogue) return null;
  return Object.freeze({
    schema: PARTNER_CUSTOMIZATION_PROFILE_SCHEMA,
    partnerId: id,
    costume,
    dialogue,
    personalOnly: true,
    canonicalWrite: false,
  });
}
