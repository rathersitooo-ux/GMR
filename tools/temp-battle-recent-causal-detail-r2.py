from pathlib import Path

adapter = Path('browser/battle-replay-live-adapter.mjs')
source = adapter.read_text()
old = """    const cards = publicCards.length ? `・公開カード ${publicCards.join(' / ')}` : '';
    return `第${data.round}ラウンド・対象${data.lane}列${cards}${totals}・勝者${Number(data.winnerCount) || 0}人`;
"""
new = """    const cards = publicCards.length ? `公開カード ${publicCards.join(' / ')}` : '';
    const shield = data.shieldUsed === true ? 'Shield使用' : '';
    const laneChanges = Array.isArray(data.laneGains)
      ? data.laneGains.flatMap(row => nonEmptyString(row?.lane) &&
          Number.isSafeInteger(row?.before) &&
          Number.isSafeInteger(row?.after) &&
          Number.isSafeInteger(row?.added)
            ? [`${row.lane}列 ${row.before}→${row.after}${row.added > 0 ? `（+${row.added}）` : ''}`]
            : [])
      : [];
    const progress = laneChanges.length ? `進行 ${laneChanges.join(' / ')}` : '';
    const causal = [cards, `対象 ${data.lane}列`, shield, progress].filter(Boolean).join(' → ');
    return `第${data.round}ラウンド・${causal}${totals}・勝者${Number(data.winnerCount) || 0}人`;
"""
if source.count(old) != 1:
    raise RuntimeError(f'adapter anchor count={source.count(old)}')
adapter.write_text(source.replace(old, new, 1))

test_path = Path('tests/partner-battle-event-log-projection.test.mjs')
tests = test_path.read_text()
anchor = """  assert.equal(readLiveReplay(session).events.length, 2);
});

test('Partner Battle log projection fails closed on prefix divergence or count regression without mutating accepted rows', () => {
"""
insertion = """  assert.equal(readLiveReplay(session).events.length, 2);
});

test('Battle recent public history explains only canonical public causal detail in event order', () => {
  const fake = fakeBattleLogDocument();
  const partnerBridge = createPartnerBattleEventLogPresentationBridge({
    document: fake.document,
    partnerBattleLogIncludePublicCards: true
  });
  let session = createLiveReplaySession(
    { matchId: 'M-PARTNER-CAUSAL', versions: liveVersions },
    { partnerBattleEventLogBridge: partnerBridge }
  );
  session = appendAcceptedBattleResolution(
    session,
    liveResolution(1),
    { partnerBattleEventLogBridge: partnerBridge }
  );

  const text = fake.children[0].textContent;
  assert.match(text, /公開カード C1\\(6\\) \\/ C2\\(4\\) → 対象 C列 → Shield使用 → 進行 C列 2→4（\\+2）/);
  assert.match(text, /A 21 \\/ B 18/);
  assert.match(text, /勝者2人/);
  for (const secret of ['P1', 'P3', 'You', 'CPU', 'SECRET_ORDER', 'SECRET_HAND', 'SECRET_FUTURE']) {
    assert.equal(text.includes(secret), false, `causal history must not expose ${secret}`);
  }
});

test('Partner Battle log projection fails closed on prefix divergence or count regression without mutating accepted rows', () => {
"""
if tests.count(anchor) != 1:
    raise RuntimeError(f'test anchor count={tests.count(anchor)}')
test_path.write_text(tests.replace(anchor, insertion, 1))
