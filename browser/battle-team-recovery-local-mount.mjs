// BATTLE-2V2-RUNTIME-CONFORMANCE-001 R1 — 2v2の離脱/再接続の表示の現地取り付け。
// 核（battle-2v2-reconnect-core）・橋（battle-recovery-live-adapter）・表面
// （battle-recovery-runtime-surface）は本流にあるが、公開版への取り付けが0だったため、
// 現地の2v2（P1人間＋P2相棒＝A組）だけに取り付ける。表示だけ。対戦の状態・所有権・
// 対象確定・報酬・勝敗は変えない。相方の代理操作はしない。
// 読み込みの決まり：対戦画面（GAMEROAD.html）はこの取り付けだけを読む。この取り付けは
// 2v2の席の状態・橋・表面だけを読み、正式なカード面の中核（card-presentation-core など）は
// 読まない。正式なカード面の中核を読むのはリプレイの橋だけ、という決まりを守る。
// 2v2の席の状態は核の作り・切り替えだけを使って持ち、席の決まりをこの取り付けで
// 作り直さない。委任中（自発・強制）は人間の席を一時的に相棒預かりにし、委任が
// 終われば自分の席へ戻す。通信の再接続は現地にはないため、再接続中にはならない。
import {
  BATTLE_2V2_CONTROL_MODES,
  create2v2ReconnectState,
  disconnect2v2Player,
  reconnect2v2Player,
} from './battle-2v2-reconnect-core.mjs';
import { BATTLE_RECOVERY_LOCAL_STAGE } from './battle-recovery-presentation-core.mjs';
import { syncBattleRecoveryRuntimeFrom2v2Authority } from './battle-recovery-live-adapter.mjs';
import { mountBattleRecoveryRuntimeSurface } from './battle-recovery-runtime-surface.mjs';

export const TEAM_RECOVERY_LOCAL_MOUNT_SCHEMA = 'gameroad.battle-team-recovery-local-mount.v1';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function localStageOf(match) {
  // 計画の途中はまだ下書き（経路を戻せる）なので未確定、計画を過ぎれば確定。
  // この段は表示のためだけのもので、古い入力の却下は現地では出さない。
  if (match?.phase === 'plan') return BATTLE_RECOVERY_LOCAL_STAGE.UNCOMMITTED;
  return BATTLE_RECOVERY_LOCAL_STAGE.COMMITTED;
}

export function createBattleTeamRecoveryLocalMount({
  getMatch,
  isPartnerDelegated,
  getHost,
  getPreferences = () => ({ reducedMotion: false, lowPerformance: false }),
  mountSurface = null,
  onInputLock = null,
} = {}) {
  if (typeof getMatch !== 'function') throw new TypeError('GET_MATCH_REQUIRED');
  if (typeof isPartnerDelegated !== 'function') throw new TypeError('IS_PARTNER_DELEGATED_REQUIRED');
  if (typeof getHost !== 'function') throw new TypeError('GET_HOST_REQUIRED');
  if (mountSurface != null && typeof mountSurface !== 'function') throw new TypeError('MOUNT_SURFACE_INVALID');
  if (onInputLock != null && typeof onInputLock !== 'function') throw new TypeError('ON_INPUT_LOCK_INVALID');
  if (typeof getPreferences !== 'function') throw new TypeError('GET_PREFERENCES_INVALID');

  let reconnectState = null;
  let matchId = null;
  let surface = null;
  let lastStatus = null;
  let lastShown = false;

  function ensureSurface() {
    if (surface) return surface;
    const host = getHost();
    if (!host) return null;
    const mount = mountSurface || ((hostNode, setLocalInputLocked) => mountBattleRecoveryRuntimeSurface(globalThis, { host: hostNode, setLocalInputLocked }));
    surface = mount(host, (locked, projection) => {
      if (onInputLock) onInputLock(locked, projection);
    });
    return surface;
  }

  function sync() {
    const match = getMatch();
    if (!match || match.mode !== '2v2' || match.lastResult) {
      // 2v2の対戦中でなければ表示を隠すだけ。席の状態は次の対戦で作り直す。
      if (surface) {
        surface.sync({ status: 'READY', localStage: BATTLE_RECOVERY_LOCAL_STAGE.NONE, reducedMotion: false, lowPerformance: false });
        lastStatus = 'READY';
        lastShown = false;
      }
      return Object.freeze({ ok: true, status: lastStatus, shown: false, reason: 'NOT_2V2_BATTLE' });
    }
    const players = Array.isArray(match.players) ? match.players : [];
    const me = players.find((player) => player?.human) || players[0] || null;
    if (!me || players.length !== 4 || players.some((player) => !nonEmptyString(player?.id) || !nonEmptyString(player?.team))) {
      return Object.freeze({ ok: false, reason: 'SEATS_INVALID', status: null, shown: lastShown });
    }
    const teamCounts = new Map();
    for (const player of players) teamCounts.set(player.team, (teamCounts.get(player.team) || 0) + 1);
    if (teamCounts.size !== 2 || [...teamCounts.values()].some((count) => count !== 2)) {
      return Object.freeze({ ok: false, reason: 'SEATS_INVALID', status: null, shown: lastShown });
    }
    if (!reconnectState || matchId !== match.id) {
      reconnectState = create2v2ReconnectState({
        seats: players.map((player) => ({ seatId: player.id, playerId: player.id, teamId: player.team })),
      });
      matchId = match.id;
    }
    // 委任の切り替えに席を合わせる。委任中は一時的に相棒が席を預かる。
    const delegated = isPartnerDelegated() === true;
    const seat = reconnectState.seats.find((candidate) => candidate.playerId === me.id);
    if (seat?.controlMode === BATTLE_2V2_CONTROL_MODES.SELF && delegated) {
      const next = disconnect2v2Player(reconnectState, me.id);
      if (next.ok) reconnectState = next.state;
    } else if (seat?.controlMode === BATTLE_2V2_CONTROL_MODES.TEMPORARY_PARTNER && !delegated) {
      const next = reconnect2v2Player(reconnectState, me.id);
      if (next.ok) reconnectState = next.state;
    }
    const runtime = ensureSurface();
    if (!runtime) {
      return Object.freeze({ ok: false, reason: 'HOST_MISSING', status: null, shown: false });
    }
    const preferences = getPreferences() || {};
    const resolved = syncBattleRecoveryRuntimeFrom2v2Authority(runtime, {
      reconnectState,
      localSeatId: me.id,
      localPlayerId: me.id,
      reconnectInFlight: false,
      controlEnvelopeRejected: false,
      rejectedControlEnvelope: null,
      localStage: localStageOf(match),
      reducedMotion: preferences.reducedMotion === true,
      lowPerformance: preferences.lowPerformance === true,
    });
    if (!resolved?.ok) {
      return Object.freeze({ ok: false, reason: resolved?.reason || 'RECOVERY_RESOLVE_FAILED', status: resolved?.status || null, shown: lastShown });
    }
    lastStatus = resolved.status;
    lastShown = resolved.presentation?.visible === true;
    return Object.freeze({ ok: true, status: resolved.status, shown: lastShown, reason: 'OK', seat: resolved.seat });
  }

  function snapshot() {
    return Object.freeze({
      schema: TEAM_RECOVERY_LOCAL_MOUNT_SCHEMA,
      matchId,
      status: lastStatus,
      shown: lastShown,
      seats: reconnectState ? reconnectState.seats.map((seat) => ({ seatId: seat.seatId, playerId: seat.playerId, teamId: seat.teamId, connected: seat.connected, controlMode: seat.controlMode, controlGeneration: seat.controlGeneration })) : [],
    });
  }

  return Object.freeze({ schema: TEAM_RECOVERY_LOCAL_MOUNT_SCHEMA, sync, snapshot });
}
