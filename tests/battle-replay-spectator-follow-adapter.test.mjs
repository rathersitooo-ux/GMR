import assert from 'node:assert/strict';
import test from 'node:test';
import { createContinuousPublicBroadcastFollow } from '../browser/battle-replay-public-commentary-core.mjs';
import {
  createLiveReplaySession,
  readLiveReplay,
} from '../browser/battle-replay-live-adapter.mjs';
import {
  advanceAuthorizedSpectatorPresence,
  consumeAuthorizedSpectatorReplay,
  BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT,
} from '../browser/battle-replay-spectator-follow-adapter.mjs';

const PRESENCE_SCHEMA = 'GAMEROAD_REPLAY_AUTHORIZED_SPECTATOR_PRESENCE_V1';

function waitingFollow() {
  return createContinuousPublicBroadcastFollow({ targetUserId: 'TARGET-7' });
}

function presence(overrides = {}) {
  return {
    schema: PRESENCE_SCHEMA,
    targetUserId: 'TARGET-7',
    lifecycle: 'WAITING',
    viewerAuthorized: true,
    spectatable: false,
    ...overrides,
  };
}

function liveResult() {
  return advanceAuthorizedSpectatorPresence(waitingFollow(), presence({
    lifecycle: 'LIVE',
    spectatable: true,
    matchId: 'MATCH-PUBLIC-1',
    publicAttachRef: 'public-watch:MATCH-PUBLIC-1',
  }));
}

test('authorized public live presence advances the existing follow core and emits one presentation-only attach intent', () => {
  const result = liveResult();

  assert.equal(result.state.status, 'ATTACHED');
  assert.equal(result.followStatus.matchId, 'MATCH-PUBLIC-1');
  assert.equal(result.followStatus.attachSerial, 1);
  assert.equal(result.attachIntent.matchId, 'MATCH-PUBLIC-1');
  assert.equal(result.attachIntent.targetUserId, 'TARGET-7');
  assert.equal(result.attachIntent.publicAttachRef, 'public-watch:MATCH-PUBLIC-1');
  assert.equal(result.attachIntent.intentId, 'spectator:TARGET-7:MATCH-PUBLIC-1:1');
  assert.equal(result.attachIntent.presentationOnly, true);
  assert.equal(result.attachIntent.gameplayAuthority, false);
  assert.equal(result.attachIntent.gameStateWrite, false);
  assert.equal(result.attachIntent.automaticPrivateJoinAllowed, false);
});

test('repeating the same authorized live match preserves core attachment identity and deterministic attach intent', () => {
  const first = liveResult();
  const second = advanceAuthorizedSpectatorPresence(first.state, presence({
    lifecycle: 'LIVE',
    spectatable: true,
    matchId: 'MATCH-PUBLIC-1',
    publicAttachRef: 'public-watch:MATCH-PUBLIC-1',
  }));

  assert.strictEqual(second.state, first.state);
  assert.equal(second.followStatus.attachSerial, 1);
  assert.equal(second.attachIntent.intentId, first.attachIntent.intentId);
});

test('denied, non-spectatable, and offline presence fail closed without retaining match identity or attach intent', () => {
  const denied = advanceAuthorizedSpectatorPresence(waitingFollow(), presence({
    lifecycle: 'DENIED',
    viewerAuthorized: false,
  }));
  assert.equal(denied.state.status, 'DENIED');
  assert.equal(denied.state.currentMatchId, null);
  assert.equal(denied.attachIntent, null);

  const nonSpectatable = advanceAuthorizedSpectatorPresence(waitingFollow(), presence({
    lifecycle: 'LIVE',
    viewerAuthorized: true,
    spectatable: false,
  }));
  assert.equal(nonSpectatable.state.status, 'DENIED');
  assert.equal(nonSpectatable.state.currentMatchId, null);
  assert.equal(nonSpectatable.attachIntent, null);

  const offline = advanceAuthorizedSpectatorPresence(waitingFollow(), presence({
    lifecycle: 'OFFLINE',
    viewerAuthorized: false,
  }));
  assert.equal(offline.state.status, 'OFFLINE');
  assert.equal(offline.state.waitingReason, 'TARGET_OFFLINE');
  assert.equal(offline.attachIntent, null);
});

test('match end returns the existing follow core to WAIT_NEXT_ALLOWED_MATCH and clears attach intent', () => {
  const live = liveResult();
  const ended = advanceAuthorizedSpectatorPresence(live.state, presence({
    lifecycle: 'ENDED',
    spectatable: false,
    matchId: 'MATCH-PUBLIC-1',
  }));

  assert.equal(ended.state.status, 'WAITING');
  assert.equal(ended.state.currentMatchId, null);
  assert.equal(ended.state.lastCompletedMatchId, 'MATCH-PUBLIC-1');
  assert.equal(ended.state.waitingReason, 'WAIT_NEXT_ALLOWED_MATCH');
  assert.equal(ended.attachIntent, null);
});

test('waiting presence uses the existing waiting transition and never fabricates an attach locator', () => {
  const result = advanceAuthorizedSpectatorPresence(waitingFollow(), presence());
  assert.equal(result.state.status, 'WAITING');
  assert.equal(result.state.waitingReason, 'AWAITING_AUTHORIZED_MATCH');
  assert.equal(result.attachIntent, null);
});

test('target mismatch is rejected by the existing continuous follow authority boundary', () => {
  assert.throws(
    () => advanceAuthorizedSpectatorPresence(waitingFollow(), presence({ targetUserId: 'OTHER-TARGET' })),
    /CONTINUOUS_FOLLOW_SIGNAL_TARGET_MISMATCH/,
  );
});

test('unexpected secret/private fields and denied match identity are rejected before they can enter follow state', () => {
  for (const secretField of [
    { ticketSecret: 'secret-ticket' },
    { roomSecret: 'secret-room' },
    { authToken: 'secret-token' },
    { hiddenMatchId: 'hidden-match' },
    { privatePayload: { hand: ['secret-card'] } },
  ]) {
    assert.throws(
      () => advanceAuthorizedSpectatorPresence(waitingFollow(), presence(secretField)),
      /AUTHORIZED_PRESENCE_UNEXPECTED_FIELD/,
    );
  }

  assert.throws(
    () => advanceAuthorizedSpectatorPresence(waitingFollow(), presence({
      lifecycle: 'DENIED',
      viewerAuthorized: false,
      matchId: 'PRIVATE-MATCH',
    })),
    /AUTHORIZED_PRESENCE_NONPUBLIC_IDENTITY_FORBIDDEN/,
  );
});

test('authorized attach consumes the existing live replay reader through publicAttachRef only and renders presentation-only output', async () => {
  const session = createLiveReplaySession({
    matchId: 'MATCH-PUBLIC-1',
    versions: { rules: 'rules@1', content: 'content@1', state: 'state@1' },
  });
  let readerRequest = null;
  let renderInput = null;

  const consumed = await consumeAuthorizedSpectatorReplay(liveResult(), {
    readPublicReplay(request) {
      readerRequest = request;
      return readLiveReplay(session);
    },
    renderPublicReplay(input) {
      renderInput = input;
      return true;
    },
  });

  assert.deepEqual(Object.keys(readerRequest).sort(), [
    'intentId',
    'matchId',
    'publicAttachRef',
    'targetUserId',
  ]);
  assert.equal(readerRequest.publicAttachRef, 'public-watch:MATCH-PUBLIC-1');
  assert.equal(readerRequest.matchId, 'MATCH-PUBLIC-1');
  assert.equal(renderInput.replay.ok, true);
  assert.equal(renderInput.replay.matchId, 'MATCH-PUBLIC-1');
  assert.equal(renderInput.presentationOnly, true);
  assert.equal(consumed.status, 'ATTACHED');
  assert.equal(consumed.rendered, true);
  assert.equal(consumed.gameplayAuthority, false);
  assert.equal(consumed.gameStateWrite, false);
});

test('waiting/offline/denied follow clears presentation without invoking replay reader or renderer', async () => {
  for (const snapshot of [
    presence(),
    presence({ lifecycle: 'OFFLINE', viewerAuthorized: false }),
    presence({ lifecycle: 'DENIED', viewerAuthorized: false }),
  ]) {
    let reads = 0;
    let renders = 0;
    let clears = 0;
    const result = advanceAuthorizedSpectatorPresence(waitingFollow(), snapshot);
    const consumed = await consumeAuthorizedSpectatorReplay(result, {
      readPublicReplay() {
        reads += 1;
        throw new Error('reader must not run');
      },
      renderPublicReplay() {
        renders += 1;
        throw new Error('renderer must not run');
      },
      clearPublicReplay() {
        clears += 1;
        return true;
      },
    });
    assert.equal(reads, 0);
    assert.equal(renders, 0);
    assert.equal(clears, 1);
    assert.equal(consumed.rendered, false);
    assert.equal(consumed.matchId, null);
  }
});

test('live consumer rejects mismatched replay identity and any private spectator projection', async () => {
  await assert.rejects(
    () => consumeAuthorizedSpectatorReplay(liveResult(), {
      readPublicReplay() {
        return {
          ok: true,
          status: 'ready',
          schema: 'GAMEROAD_BATTLE_REPLAY_V1',
          matchId: 'OTHER-MATCH',
          events: [],
        };
      },
      renderPublicReplay() {
        return true;
      },
    }),
    /SPECTATOR_PUBLIC_REPLAY_INVALID/,
  );

  await assert.rejects(
    () => consumeAuthorizedSpectatorReplay(liveResult(), {
      readPublicReplay() {
        return {
          ok: true,
          status: 'ready',
          schema: 'GAMEROAD_BATTLE_REPLAY_V1',
          matchId: 'MATCH-PUBLIC-1',
          events: [{ sequence: 1, kind: 'battle_resolution', publicData: {}, privateData: { hand: ['SECRET'] } }],
        };
      },
      renderPublicReplay() {
        return true;
      },
    }),
    /SPECTATOR_PUBLIC_REPLAY_PRIVATE_FIELD:privateData/,
  );
});

test('adapter contract declares a caller-verified public presence seam with no discovery, secrets, private join, game authority, or second replay state', () => {
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.inputAuthority, 'CALLER_VERIFIED_PUBLIC_SPECTATOR_PRESENCE');
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.consumerReaderAuthority, 'CALLER_SUPPLIED_PUBLIC_ATTACH_REF_RESOLVER');
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.networkDiscoveryPerformed, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.hiddenOrSecretDiscoveryAllowed, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.ticketSecretAccepted, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.roomSecretAccepted, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.privateMatchIdentityRetainedWhenDenied, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.forcePrivateJoinAllowed, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.publicAttachRefRequiredForAttach, true);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.secondFollowStateStore, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.secondReplayStateStore, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_REPLAY_SPECTATOR_FOLLOW_ADAPTER_CONTRACT.gameStateWrite, false);
});
