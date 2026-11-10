// BATTLE-2V2-PING-RUNTIME-001 R1 — 2v2のチーム合図（公開ping）の現地取り付け。
// 核（battle-team-ping-core）と橋（battle-team-ping-live-adapter）は本流にあるが、
// 公開版への取り付けが0だったため、現地の2v2（P1人間＋P2相棒＝A組）だけに取り付ける。
// 宛先は公開のものだけ（盤面の位置・対戦中の人物）。手カード・予約・シールドの中身は
// 宛先にできず、合図で対戦の状態・所有権・対象確定・報酬・勝敗は変わらない。
// 相方の代理操作はしない（受け取りの記録だけ）。
import { createBattleTeamPingLiveAdapter } from './battle-team-ping-live-adapter.mjs';
import { TEAM_PING_INTENTS } from './battle-team-ping-core.mjs';

export const TEAM_PING_LOCAL_MOUNT_SCHEMA = 'gameroad.battle-team-ping-local-mount.v1';

// 2v2の合図6種。表示の言葉は現地の画面で使うだけのもので、核の決まりは変えない。
export const TEAM_PING_LOCAL_INTENT_LABELS = Object.freeze({
  ATTENTION: '注目',
  ATTACK_INTENT: '攻めたい',
  DEFEND_INTENT: '守りたい',
  HELP: '助けて',
  WAIT: '待って',
  ACK: '了解',
});

const INTENT_SET = new Set(TEAM_PING_INTENTS);
// 公開の盤面の位置だけ。C=中央3x3、S=シールド境界、R=道、K=角。
const PUBLIC_BOARD_ID = /^(?:C:-?[0-1]:-?[0-1]|S:P[1-4]:[LCR]|R:P[1-4]:[LCR]:[1-7]|K:(?:NW|NE|SW|SE))$/;
const MAX_RECORDED_EVENTS = 50;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function playerOf(match, playerId) {
  if (!match || !Array.isArray(match.players) || !nonEmptyString(playerId)) return null;
  return match.players.find((player) => player?.id === playerId) ?? null;
}

function boardOwnerId(boardId) {
  const parts = String(boardId).split(':');
  if ((parts[0] === 'S' || parts[0] === 'R') && parts.length >= 2) return parts[1];
  return null;
}

export function createBattleTeamPingLocalMount({ getMatch, presentPing = null, recordPing = null } = {}) {
  if (typeof getMatch !== 'function') throw new TypeError('GET_MATCH_REQUIRED');
  if (presentPing != null && typeof presentPing !== 'function') throw new TypeError('PRESENT_PING_INVALID');
  if (recordPing != null && typeof recordPing !== 'function') throw new TypeError('RECORD_PING_INVALID');

  const recordedEvents = [];

  function resolveTeamId(actorId) {
    const match = getMatch();
    if (!match || match.mode !== '2v2') return null;
    return playerOf(match, actorId)?.team ?? null;
  }

  // 公開の宛先だけを通す。手カード・予約・シールドの中身は形にできない。
  function resolvePublicTarget({ target } = {}) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      throw new TypeError('TARGET_NOT_PUBLIC');
    }
    if (target.kind === 'player') {
      const match = getMatch();
      if (!playerOf(match, target.id)) throw new TypeError('TARGET_NOT_PUBLIC');
      return Object.freeze({ kind: 'player', id: target.id });
    }
    if (target.kind === 'board') {
      if (!nonEmptyString(target.id) || !PUBLIC_BOARD_ID.test(target.id)) {
        throw new TypeError('TARGET_NOT_PUBLIC');
      }
      const ownerId = boardOwnerId(target.id);
      if (ownerId !== null && !playerOf(getMatch(), ownerId)) {
        throw new TypeError('TARGET_NOT_PUBLIC');
      }
      return Object.freeze({ kind: 'board', id: target.id });
    }
    throw new TypeError('TARGET_NOT_PUBLIC');
  }

  function canReadTeam(viewerId, teamId) {
    if (!nonEmptyString(viewerId) || !nonEmptyString(teamId)) return false;
    return playerOf(getMatch(), viewerId)?.team === teamId;
  }

  // 現地の2v2の対戦中だけ。終わった対戦・2v2以外・組外の人は通さない。
  function admissionPolicy({ actorId, teamId } = {}) {
    const match = getMatch();
    if (!match || match.mode !== '2v2' || match.lastResult) return false;
    return playerOf(match, actorId)?.team === teamId;
  }

  // 現地の送り口。同じ画面の中へ届けるだけ（外への送信はしない）。
  function dispatchPing(event) {
    recordedEvents.push(event);
    while (recordedEvents.length > MAX_RECORDED_EVENTS) recordedEvents.shift();
    if (typeof recordPing === 'function') recordPing(event);
    return true;
  }

  const adapter = createBattleTeamPingLiveAdapter({
    resolveTeamId,
    resolvePublicTarget,
    canReadTeam,
    admissionPolicy,
    dispatchPing,
    presentPing,
  });

  function submit(actorId, intent, target = null) {
    const message = target == null ? { intent } : { intent, target };
    const result = adapter.submit(actorId, message);
    if (!result?.ok || result.notify !== true) return result;
    // 送り手の画面に出す。組の仲間へも届けを付ける（表示は人間の画面だけ）。
    adapter.readForViewer(actorId, result.ping.teamId, { present: true });
    const match = getMatch();
    for (const player of match?.players ?? []) {
      if (player?.id !== actorId && player?.team === result.ping.teamId) {
        adapter.readForViewer(player.id, result.ping.teamId, { present: true });
      }
    }
    return result;
  }

  return Object.freeze({
    schema: TEAM_PING_LOCAL_MOUNT_SCHEMA,
    intents: TEAM_PING_INTENTS,
    labels: TEAM_PING_LOCAL_INTENT_LABELS,
    submit,
    readForViewer: (viewerId, teamId, options) => adapter.readForViewer(viewerId, teamId, options),
    clearPresentationReceipts: (viewerId, teamId) => adapter.clearPresentationReceipts(viewerId, teamId),
    recordedEvents: () => Object.freeze([...recordedEvents]),
  });
}
