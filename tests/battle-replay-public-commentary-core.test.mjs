import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT,
  createPublicCommentaryGenerationRequest,
  createPublicSpeechArbiterState,
  createPublicSpeechCandidate,
  dispatchNextPublicSpeech,
  offerPublicSpeechCandidate,
  settlePublicSpeechDispatch,
} from '../browser/battle-replay-public-commentary-core.mjs';

function director(overrides = {}) {
  return {
    presentationOnly: true,
    decisionSerial: 17,
    selectedCandidateId: 'shot-event-42',
    selectedEventId: 'event-42',
    ...overrides,
  };
}

function event(overrides = {}) {
  return {
    eventId: 'event-42',
    kind: 'BATTLE_RESOLVED',
    publicData: {
      actor: 'P3',
      target: 'P1',
      laneCount: 6,
    },
    ...overrides,
  };
}

function request(overrides = {}) {
  return createPublicCommentaryGenerationRequest({
    requestId: 'req-17-mc',
    directorDecision: director(),
    selectedEvent: event(),
    speakerClass: 'PUBLIC_MC',
    ...overrides,
  });
}

function candidate(candidateId, priority, overrides = {}) {
  return createPublicSpeechCandidate({
    candidateId,
    request: request(),
    text: `speech:${candidateId}`,
    priority,
    ...overrides,
  });
}

test('binds commentary generation to the already-selected public replay event without reranking it', () => {
  const value = request();
  assert.equal(value.eventSelectionAuthority, 'BATTLE_REPLAY_DIRECTOR_DECISION');
  assert.equal(value.decisionSerial, 17);
  assert.equal(value.selectedEventId, 'event-42');
  assert.equal(value.publicEvent.publicData.actor, 'P3');
  assert.equal(value.personaApprovalClaimed, false);
  assert.equal(value.automaticPublishAllowed, false);
  assert.equal(value.automaticGameMutationAllowed, false);
  assert.equal('score' in value, false);
  assert.equal('winner' in value, false);
});

test('fails closed when the selected public event does not match the replay director decision', () => {
  assert.throws(
    () => request({ selectedEvent: event({ eventId: 'event-99' }) }),
    /DIRECTOR_EVENT_MISMATCH/,
  );
  assert.throws(
    () => request({ directorDecision: director({ presentationOnly: false }) }),
    /DIRECTOR_PROJECTION_INVALID/,
  );
});

test('rejects private, secret, authority-only, and hidden gameplay fields recursively from public commentary input', () => {
  for (const selectedEvent of [
    event({ privateData: { hand: ['secret-card'] } }),
    event({ publicData: { nested: { privateByViewer: { P1: 'secret-card' } } } }),
    event({ publicData: { secretHand: ['secret-card'] } }),
    event({ publicData: { nested: { authorityOnly: { seed: 7 } } } }),
    event({ publicData: { hand: ['secret-card'] } }),
    event({ publicData: { deck: ['secret-card'] } }),
    event({ publicData: { deckOrder: ['secret-card'] } }),
    event({ publicData: { nested: { hiddenCardId: 'secret-card' } } }),
    event({ publicData: { drawPile: ['secret-card'] } }),
  ]) {
    assert.throws(
      () => request({ selectedEvent }),
      /PUBLIC_PROJECTION_FORBIDDEN_KEY/,
    );
  }
});

test('public commentary privacy guard is semantic-key specific rather than a blanket hand/deck substring ban', () => {
  const value = request({
    selectedEvent: event({
      publicData: {
        actor: 'P3',
        target: 'P1',
        laneCount: 6,
        handSize: 3,
        deckName: 'PUBLIC_ARCHETYPE_LABEL',
      },
    }),
  });
  assert.equal(value.publicEvent.publicData.handSize, 3);
  assert.equal(value.publicEvent.publicData.deckName, 'PUBLIC_ARCHETYPE_LABEL');
});

test('only public MC and public guest speaker classes can enter this seam', () => {
  assert.equal(request().speakerClass, 'PUBLIC_MC');
  assert.equal(request({ speakerClass: 'PUBLIC_GUEST' }).speakerClass, 'PUBLIC_GUEST');
  for (const speakerClass of ['PERSONAL_PARTNER', 'PLAYER_AI', 'PRIVATE_GUEST']) {
    assert.throws(() => request({ speakerClass }), /SPEAKER_CLASS_NOT_PUBLIC/);
  }
});

test('speech candidates preserve exact public request identity without claiming persona approval or publishing', () => {
  const value = candidate('candidate-a', 20);
  assert.equal(value.requestId, 'req-17-mc');
  assert.equal(value.decisionSerial, 17);
  assert.equal(value.selectedEventId, 'event-42');
  assert.equal(value.speakerClass, 'PUBLIC_MC');
  assert.equal(value.text, 'speech:candidate-a');
  assert.equal(value.personaApprovalClaimed, false);
  assert.equal(value.automaticPublishAllowed, false);
  assert.equal(value.automaticGameMutationAllowed, false);
});

test('arbitrates multiple public voices deterministically and permits only one in-flight dispatch', () => {
  let state = createPublicSpeechArbiterState({ maxPending: 4 });
  state = offerPublicSpeechCandidate(state, candidate('low', 10));
  state = offerPublicSpeechCandidate(state, candidate('high-b', 50));
  state = offerPublicSpeechCandidate(state, candidate('high-a', 50));

  assert.deepEqual(state.pending.map((item) => item.candidateId), ['high-a', 'high-b', 'low']);

  const first = dispatchNextPublicSpeech(state, { channelIdle: true, dispatchId: 'dispatch-1' });
  assert.equal(first.dispatch.candidateId, 'high-a');
  assert.equal(first.state.inFlight.dispatchId, 'dispatch-1');
  assert.deepEqual(first.state.pending.map((item) => item.candidateId), ['high-b', 'low']);

  const blocked = dispatchNextPublicSpeech(first.state, { channelIdle: true, dispatchId: 'dispatch-2' });
  assert.equal(blocked.dispatch, null);
  assert.strictEqual(blocked.state, first.state);
});

test('does not dispatch when the caller says the speech channel is busy', () => {
  let state = createPublicSpeechArbiterState({ maxPending: 2 });
  state = offerPublicSpeechCandidate(state, candidate('waiting', 1));
  const result = dispatchNextPublicSpeech(state, { channelIdle: false, dispatchId: 'unused-id' });
  assert.equal(result.dispatch, null);
  assert.strictEqual(result.state, state);
  assert.equal(state.pending.length, 1);
});

test('candidate identity is idempotent only for exact duplicates and queue capacity fails closed', () => {
  const original = candidate('same', 5);
  let state = createPublicSpeechArbiterState({ maxPending: 1 });
  state = offerPublicSpeechCandidate(state, original);
  assert.strictEqual(offerPublicSpeechCandidate(state, original), state);

  assert.throws(
    () => offerPublicSpeechCandidate(state, { ...original, text: 'different speech' }),
    /CANDIDATE_ID_CONFLICT/,
  );
  assert.throws(
    () => offerPublicSpeechCandidate(state, candidate('overflow', 6)),
    /SPEECH_QUEUE_FULL/,
  );
});

test('settlement is caller-explicit: completed and drop clear, retry requeues, with no automatic retry', () => {
  let completedState = createPublicSpeechArbiterState({ maxPending: 2 });
  completedState = offerPublicSpeechCandidate(completedState, candidate('complete-me', 9));
  completedState = dispatchNextPublicSpeech(completedState, { channelIdle: true, dispatchId: 'dispatch-complete' }).state;
  completedState = settlePublicSpeechDispatch(completedState, { dispatchId: 'dispatch-complete', outcome: 'COMPLETED' });
  assert.equal(completedState.inFlight, null);
  assert.deepEqual(completedState.pending, []);

  let retryState = createPublicSpeechArbiterState({ maxPending: 2 });
  retryState = offerPublicSpeechCandidate(retryState, candidate('retry-me', 7));
  retryState = dispatchNextPublicSpeech(retryState, { channelIdle: true, dispatchId: 'dispatch-retry' }).state;
  retryState = settlePublicSpeechDispatch(retryState, { dispatchId: 'dispatch-retry', outcome: 'RETRY' });
  assert.equal(retryState.inFlight, null);
  assert.deepEqual(retryState.pending.map((item) => item.candidateId), ['retry-me']);
  assert.equal(retryState.automaticRetryAllowed, false);

  let dropState = createPublicSpeechArbiterState({ maxPending: 2 });
  dropState = offerPublicSpeechCandidate(dropState, candidate('drop-me', 3));
  dropState = dispatchNextPublicSpeech(dropState, { channelIdle: true, dispatchId: 'dispatch-drop' }).state;
  dropState = settlePublicSpeechDispatch(dropState, { dispatchId: 'dispatch-drop', outcome: 'DROP' });
  assert.deepEqual(dropState.pending, []);
  assert.throws(
    () => settlePublicSpeechDispatch(dropState, { dispatchId: 'dispatch-drop', outcome: 'COMPLETED' }),
    /DISPATCH_NOT_IN_FLIGHT/,
  );
});

test('dispatch remains presentation-only and contains no source private payload or game mutation authority', () => {
  let state = createPublicSpeechArbiterState({ maxPending: 1 });
  state = offerPublicSpeechCandidate(state, candidate('public-only', 12));
  const { dispatch } = dispatchNextPublicSpeech(state, { channelIdle: true, dispatchId: 'dispatch-public' });
  const serialized = JSON.stringify(dispatch);
  assert.doesNotMatch(serialized, /private|secret|authorityOnly/i);
  assert.equal(dispatch.presentationOnly, true);
  assert.equal(dispatch.automaticPublishAllowed, false);
  assert.equal(dispatch.automaticGameMutationAllowed, false);
});

test('caller-owned objects are cloned for public request and not frozen or mutated', () => {
  const selectedEvent = event();
  const directorDecision = director();
  const value = request({ selectedEvent, directorDecision });

  assert.equal(Object.isFrozen(selectedEvent), false);
  assert.equal(Object.isFrozen(directorDecision), false);
  selectedEvent.publicData.actor = 'MUTATED-LATER';
  assert.equal(value.publicEvent.publicData.actor, 'P3');
});

test('contract explicitly leaves model, TTS, avatar, OAuth, storage and game authority outside this core', () => {
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.gameStateAuthority, 'NONE');
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.storageAuthority, 'NONE');
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.privateDataAllowed, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.personalPartnerPrivateMemoryAllowed, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.oauthHandled, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.ttsHandled, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.avatarHandled, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.automaticPublishAllowed, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_COMMENTARY_CONTRACT.automaticRetryAllowed, false);
});

test('continuous public follow crosses authorized matches without carrying replay or commentary payloads', async () => {
  const {
    advanceContinuousPublicBroadcastFollow,
    createContinuousPublicBroadcastFollow,
    readContinuousPublicBroadcastFollowStatus,
  } = await import('../browser/battle-replay-public-commentary-core.mjs');

  let follow = createContinuousPublicBroadcastFollow({ targetUserId: 'STREAMER-TARGET' });
  assert.equal(follow.status, 'WAITING');
  assert.equal(follow.presentationOnly, true);
  assert.equal(follow.gameplayAuthority, false);
  assert.equal(follow.gameStateWrite, false);
  assert.equal(Object.isFrozen(follow), true);

  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED',
    targetUserId: 'STREAMER-TARGET',
    viewerAuthorized: true,
    spectatable: true,
    matchId: 'MATCH-A',
  });
  assert.equal(follow.status, 'ATTACHED');
  assert.equal(follow.currentMatchId, 'MATCH-A');
  assert.equal(follow.attachSerial, 1);
  assert.deepEqual(readContinuousPublicBroadcastFollowStatus(follow), {
    schema: 'GAMEROAD_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_STATUS_V1',
    presentationOnly: true,
    gameplayAuthority: false,
    gameStateWrite: false,
    targetUserId: 'STREAMER-TARGET',
    status: 'ATTACHED',
    matchId: 'MATCH-A',
    attachSerial: 1,
    waitingReason: null,
  });

  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_ENDED',
    targetUserId: 'STREAMER-TARGET',
    matchId: 'MATCH-A',
  });
  assert.equal(follow.status, 'WAITING');
  assert.equal(follow.currentMatchId, null);
  assert.equal(follow.lastCompletedMatchId, 'MATCH-A');
  assert.equal(follow.waitingReason, 'WAIT_NEXT_ALLOWED_MATCH');

  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED',
    targetUserId: 'STREAMER-TARGET',
    viewerAuthorized: true,
    spectatable: true,
    matchId: 'MATCH-B',
  });
  assert.equal(follow.status, 'ATTACHED');
  assert.equal(follow.currentMatchId, 'MATCH-B');
  assert.equal(follow.attachSerial, 2);
  const serialized = JSON.stringify(follow);
  assert.equal(serialized.includes('publicEvent'), false);
  assert.equal(serialized.includes('text'), false);
  assert.equal(serialized.includes('events'), false);
});

test('continuous public follow never stores denied/private candidate match identity or payload', async () => {
  const {
    advanceContinuousPublicBroadcastFollow,
    createContinuousPublicBroadcastFollow,
    readContinuousPublicBroadcastFollowStatus,
  } = await import('../browser/battle-replay-public-commentary-core.mjs');

  let follow = createContinuousPublicBroadcastFollow({ targetUserId: 'TARGET' });
  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED',
    targetUserId: 'TARGET',
    viewerAuthorized: false,
    spectatable: false,
    matchId: 'PRIVATE-MATCH-SECRET',
    privateData: { hand: ['SECRET_CARD'] },
    authorityOnly: { roomKey: 'SECRET_ROOM_KEY' },
  });

  assert.equal(follow.status, 'DENIED');
  assert.equal(follow.currentMatchId, null);
  assert.equal(follow.waitingReason, 'MATCH_NOT_AUTHORIZED');
  const serialized = JSON.stringify(follow);
  assert.equal(serialized.includes('PRIVATE-MATCH-SECRET'), false);
  assert.equal(serialized.includes('SECRET_CARD'), false);
  assert.equal(serialized.includes('SECRET_ROOM_KEY'), false);
  assert.equal(readContinuousPublicBroadcastFollowStatus(follow).matchId, null);
});

test('continuous public follow is idempotent for duplicate attach/end and can reconnect after offline', async () => {
  const {
    advanceContinuousPublicBroadcastFollow,
    createContinuousPublicBroadcastFollow,
  } = await import('../browser/battle-replay-public-commentary-core.mjs');

  let follow = createContinuousPublicBroadcastFollow({ targetUserId: 'TARGET' });
  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED', targetUserId: 'TARGET', viewerAuthorized: true, spectatable: true, matchId: 'M1',
  });
  const duplicateAttach = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED', targetUserId: 'TARGET', viewerAuthorized: true, spectatable: true, matchId: 'M1',
  });
  assert.strictEqual(duplicateAttach, follow);
  assert.equal(duplicateAttach.attachSerial, 1);

  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_ENDED', targetUserId: 'TARGET', matchId: 'M1',
  });
  const duplicateEnd = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_ENDED', targetUserId: 'TARGET', matchId: 'M1',
  });
  assert.strictEqual(duplicateEnd, follow);
  assert.throws(
    () => advanceContinuousPublicBroadcastFollow(follow, {
      kind: 'MATCH_ENDED', targetUserId: 'TARGET', matchId: 'OTHER',
    }),
    /CONTINUOUS_FOLLOW_MATCH_END_IDENTITY_MISMATCH/,
  );

  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'OFFLINE', targetUserId: 'TARGET',
  });
  assert.equal(follow.status, 'OFFLINE');
  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'MATCH_DISCOVERED', targetUserId: 'TARGET', viewerAuthorized: true, spectatable: true, matchId: 'M2',
  });
  assert.equal(follow.status, 'ATTACHED');
  assert.equal(follow.currentMatchId, 'M2');
  assert.equal(follow.attachSerial, 2);
});

test('continuous public follow supports denied/waiting, target change and explicit stop without game authority', async () => {
  const {
    BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT,
    advanceContinuousPublicBroadcastFollow,
    createContinuousPublicBroadcastFollow,
    readContinuousPublicBroadcastFollowStatus,
    retargetContinuousPublicBroadcastFollow,
    stopContinuousPublicBroadcastFollow,
  } = await import('../browser/battle-replay-public-commentary-core.mjs');

  let follow = createContinuousPublicBroadcastFollow({ targetUserId: 'TARGET-A' });
  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'DENIED', targetUserId: 'TARGET-A',
  });
  assert.equal(follow.status, 'DENIED');
  assert.equal(follow.currentMatchId, null);
  follow = advanceContinuousPublicBroadcastFollow(follow, {
    kind: 'WAITING', targetUserId: 'TARGET-A',
  });
  assert.equal(follow.status, 'WAITING');

  follow = retargetContinuousPublicBroadcastFollow(follow, { targetUserId: 'TARGET-B' });
  assert.equal(follow.targetUserId, 'TARGET-B');
  assert.equal(follow.status, 'WAITING');
  assert.equal(follow.attachSerial, 0);
  assert.throws(
    () => advanceContinuousPublicBroadcastFollow(follow, {
      kind: 'OFFLINE', targetUserId: 'TARGET-A',
    }),
    /CONTINUOUS_FOLLOW_SIGNAL_TARGET_MISMATCH/,
  );

  follow = stopContinuousPublicBroadcastFollow(follow);
  assert.equal(follow.status, 'STOPPED');
  assert.equal(follow.targetUserId, null);
  assert.equal(follow.currentMatchId, null);
  assert.strictEqual(stopContinuousPublicBroadcastFollow(follow), follow);
  assert.strictEqual(advanceContinuousPublicBroadcastFollow(follow, { nope: true }), follow);
  assert.equal(readContinuousPublicBroadcastFollowStatus(follow).matchId, null);

  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.deniedMatchIdentityStored, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.replayEventStorage, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.secondSpectatorStateStore, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.gameplayAuthority, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.gameStateWrite, false);
  assert.equal(BATTLE_REPLAY_PUBLIC_CONTINUOUS_FOLLOW_CONTRACT.automaticPublishAllowed, false);
});
