// season-events-runtime の検査：お題・ドロップ・本祭・受け取り箱。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimSeasonBoxItem,
  claimSeasonMission,
  festivalStatusFor,
  grantFestivalLook,
  missionProgressFor,
  mountSeasonEvents,
  recordSeasonResultEvents,
  recordSeasonScreenEvent,
  renderClaimBoxSection,
  renderWeeklyMissionCards,
} from '../browser/season-events-runtime.mjs';
import { cleanSeasonState, createSeasonStore } from '../browser/season-store.mjs';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

const CPU_MATCH = { mode: '4p', friendRoom: false, rankMode: 'normal' };
const RANK_MATCH = { mode: '4p', friendRoom: false, rankMode: 'rank' };

describe('season-events: お題の進み', () => {
  it('画面の切り替わりで1回だけ数え、週の外では数えない', () => {
    let state = cleanSeasonState(null, { month: 2 });
    const first = recordSeasonScreenEvent(state, { kind: 'deck', month: 2, day: 6 });
    assert.equal(first.counted, true);
    state = first.state;
    const again = recordSeasonScreenEvent(state, { kind: 'deck', month: 2, day: 6 });
    assert.equal(again.counted, false);
    assert.equal(again.reason, 'ALREADY_COUNTED');
    const outside = recordSeasonScreenEvent(state, { kind: 'watch', month: 2, day: 15 });
    assert.equal(outside.counted, false);
    assert.equal(outside.reason, 'NOT_IN_WEEK');
    const progress = missionProgressFor(state, { month: 2, day: 6 });
    assert.equal(progress.items.find((entry) => entry.id === 'deck-1').now, 1);
    assert.equal(progress.items.find((entry) => entry.id === 'watch-1').now, 0);
    assert.equal(progress.inWeek, true);
  });

  it('投票したら festival-1 が進む', () => {
    const state = cleanSeasonState({ festivalVotes: { 2: 1 } }, { month: 2 });
    const progress = missionProgressFor(state, { month: 2, day: 6 });
    assert.equal(progress.items.find((entry) => entry.id === 'festival-1').now, 1);
    assert.equal(progress.items.find((entry) => entry.id === 'festival-1').done, true);
  });
});

describe('season-events: ドロップとお題の対戦', () => {
  it('1〜10日のCPUへの勝利は大きく（3つまで）、4勝目からは小さい', () => {
    let state = cleanSeasonState(null, { month: 2 });
    for (let n = 1; n <= 3; n += 1) {
      const result = recordSeasonResultEvents(state, {
        resultKey: `2-5|win${n}`, month: 2, day: 5, hour: 12, won: true, match: CPU_MATCH,
      });
      assert.equal(result.counted, true);
      const drop = result.events.find((event) => event.kind === 'drop');
      assert.equal(drop.reason, 'BIG');
      assert.deepEqual(drop.reward, { kind: 'drop-big', tokens: 3, catalogPoints: 10 });
      state = result.state;
    }
    assert.equal(state.exchangeTokens, 9);
    assert.equal(state.catalogPoints, 30);
    const fourth = recordSeasonResultEvents(state, {
      resultKey: '2-5|win4', month: 2, day: 5, hour: 12, won: true, match: CPU_MATCH,
    });
    const drop = fourth.events.find((event) => event.kind === 'drop');
    assert.equal(drop.reason, 'SMALL');
    assert.deepEqual(drop.reward, { kind: 'drop-small', tokens: 1, catalogPoints: 5 });
    assert.equal(fourth.state.exchangeTokens, 10);
  });

  it('負けたときと友だちの部屋・ランクの対戦はドロップにならない', () => {
    let state = cleanSeasonState(null, { month: 2 });
    const lost = recordSeasonResultEvents(state, {
      resultKey: '2-5|lost', month: 2, day: 5, hour: 12, won: false, match: CPU_MATCH,
    });
    assert.equal(lost.events.some((event) => event.kind === 'drop'), false);
    const friend = recordSeasonResultEvents(lost.state, {
      resultKey: '2-5|friend', month: 2, day: 5, hour: 12, won: true,
      match: { mode: '4p', friendRoom: true, rankMode: 'normal' },
    });
    assert.equal(friend.events.some((event) => event.kind === 'drop'), false);
    const rank = recordSeasonResultEvents(friend.state, {
      resultKey: '2-5|rank', month: 2, day: 5, hour: 12, won: true, match: RANK_MATCH,
    });
    assert.equal(rank.events.some((event) => event.kind === 'drop'), false);
  });

  it('同じ結果の番号は2回数えない', () => {
    let state = cleanSeasonState(null, { month: 2 });
    const first = recordSeasonResultEvents(state, {
      resultKey: '2-5|once', month: 2, day: 5, hour: 12, won: true, match: CPU_MATCH,
    });
    assert.equal(first.counted, true);
    const second = recordSeasonResultEvents(first.state, {
      resultKey: '2-5|once', month: 2, day: 5, hour: 12, won: true, match: CPU_MATCH,
    });
    assert.equal(second.counted, false);
    assert.equal(second.reason, 'ALREADY_COUNTED');
    assert.equal(second.state.exchangeTokens, first.state.exchangeTokens);
  });

  it('お題の週の対戦で battle-3 と win-1 が進む', () => {
    let state = cleanSeasonState(null, { month: 2 });
    const result = recordSeasonResultEvents(state, {
      resultKey: '2-6|b1', month: 2, day: 6, hour: 12, won: true, match: CPU_MATCH,
    });
    const progress = missionProgressFor(result.state, { month: 2, day: 6 });
    assert.equal(progress.items.find((entry) => entry.id === 'battle-3').now, 1);
    assert.equal(progress.items.find((entry) => entry.id === 'win-1').now, 1);
  });
});

describe('season-events: お題の受け取り', () => {
  it('終えていないお題は受け取れず、終えたら点とマニーが入る', () => {
    let state = cleanSeasonState(null, { month: 2 });
    const early = claimSeasonMission(state, 'battle-3', { month: 2, day: 6, hour: 12 });
    assert.equal(early.claimed, false);
    assert.equal(early.reason, 'NOT_DONE');
    for (let n = 1; n <= 3; n += 1) {
      state = recordSeasonResultEvents(state, {
        resultKey: `2-6|m${n}`, month: 2, day: 6, hour: 12, won: n === 1, match: CPU_MATCH,
      }).state;
    }
    const claimed = claimSeasonMission(state, 'battle-3', { month: 2, day: 6, hour: 12 });
    assert.equal(claimed.claimed, true);
    // ドロップの点10点（1勝目が大きく入った分）＋お題の受け取り15点。
    assert.equal(claimed.state.catalogPoints, 25);
    assert.equal(claimed.state.mannyEarned, 50);
    assert.deepEqual(claimed.state.mannyLedger[0], { id: 'mission-battle-3-02', amount: 50, source: 'weekly-mission' });
    const again = claimSeasonMission(claimed.state, 'battle-3', { month: 2, day: 6, hour: 12 });
    assert.equal(again.claimed, false);
    assert.equal(again.reason, 'ALREADY_CLAIMED');
  });

  it('7つ全部受け取ると追加のごほうびも入る', () => {
    let state = cleanSeasonState(null, { month: 2 });
    // 対戦3回（1勝つき）＋画面の切り替わり3つ＋投票で7つ全部終える。
    for (let n = 1; n <= 3; n += 1) {
      state = recordSeasonResultEvents(state, {
        resultKey: `2-6|a${n}`, month: 2, day: 6, hour: 12, won: n === 1, match: CPU_MATCH,
      }).state;
    }
    for (const kind of ['grow', 'watch', 'deck', 'partner']) {
      state = recordSeasonScreenEvent(state, { kind, month: 2, day: 6 }).state;
    }
    state = cleanSeasonState({ ...state, festivalVotes: { 2: 0 } }, { month: 2 });
    let total = state.catalogPoints;
    for (const id of ['battle-3', 'win-1', 'grow-1', 'watch-1', 'deck-1', 'partner-1', 'festival-1']) {
      const result = claimSeasonMission(state, id, { month: 2, day: 6, hour: 12 });
      assert.equal(result.claimed, true, id);
      state = result.state;
    }
    // お題7つ（15点ずつ）＋ドロップの点（対戦3回分：BIG 3回で30点）＋追加20点。
    assert.equal(state.catalogPoints, total + 7 * 15 + 20);
    assert.equal(state.mannyEarned, 7 * 50 + 100);
    assert.equal(state.missions.allDoneBonusClaimed, true);
  });
});

describe('season-events: 本祭の対戦の数え方', () => {
  it('前半はCPUとの対戦を soloBattles、ランクは openBattles に数える', () => {
    let state = cleanSeasonState({ festivalVotes: { 2: 1 } }, { month: 2 });
    const solo = recordSeasonResultEvents(state, {
      resultKey: '2-19|solo', month: 2, day: 19, hour: 10, won: true, match: CPU_MATCH,
    });
    const event = solo.events.find((entry) => entry.kind === 'festival-battle');
    assert.equal(event.department, 'soloBattles');
    assert.equal(event.teamIndex, 1);
    assert.equal(event.sameTeamUnknown, true);
    assert.deepEqual(solo.state.festival.contribution.soloBattles, [0, 1, 0]);
    assert.equal(solo.state.festival.titleStep, 1);
    const rank = recordSeasonResultEvents(solo.state, {
      resultKey: '2-19|rank', month: 2, day: 19, hour: 11, won: false, match: RANK_MATCH,
    });
    const rankEvent = rank.events.find((entry) => entry.kind === 'festival-battle');
    assert.equal(rankEvent.department, 'openBattles');
    assert.deepEqual(rank.state.festival.contribution.openBattles, [0, 1, 0]);
    assert.equal(rank.state.festival.titleStep, 1);
  });

  it('後半は特別な対戦として数える', () => {
    let state = cleanSeasonState({ festivalVotes: { 2: 2 } }, { month: 2 });
    const result = recordSeasonResultEvents(state, {
      resultKey: '2-20|special', month: 2, day: 20, hour: 12, won: true, match: CPU_MATCH,
    });
    const event = result.events.find((entry) => entry.kind === 'festival-battle');
    assert.equal(event.department, 'specialBattles');
    assert.deepEqual(result.state.festival.contribution.specialBattles, [0, 0, 1]);
  });

  it('投票していない月は数えず、理由が残る', () => {
    const state = cleanSeasonState(null, { month: 2 });
    const result = recordSeasonResultEvents(state, {
      resultKey: '2-19|noteam', month: 2, day: 19, hour: 10, won: true, match: CPU_MATCH,
    });
    assert.equal(result.events.find((entry) => entry.kind === 'festival-skipped')?.reason, 'NO_TEAM');
    assert.deepEqual(result.state.festival.contribution.soloBattles, [0, 0, 0]);
  });

  it('お祭りの今の様子が予定の窓用にまとまる', () => {
    let state = cleanSeasonState({ festivalVotes: { 2: 1 } }, { month: 2 });
    state = recordSeasonResultEvents(state, {
      resultKey: '2-19|s1', month: 2, day: 19, hour: 10, won: true, match: CPU_MATCH,
    }).state;
    const status = festivalStatusFor(state, { month: 2, day: 19, hour: 10 });
    assert.equal(status.phase, 'main-first');
    assert.equal(status.voted, true);
    assert.equal(status.teamIndex, 1);
    assert.deepEqual(status.points, [0, 12, 0]);
    assert.equal(status.titleLabel, '応援者');
    assert.equal(status.shellsWin, 15);
  });
});

describe('season-events: 投票の見た目の受け取り', () => {
  it('投票したら見た目が受け取り箱に入り、1回だけ受け取れる', () => {
    let state = cleanSeasonState({ festivalVotes: { 2: 0 } }, { month: 2 });
    const granted = grantFestivalLook(state, 2);
    assert.equal(granted.granted, true);
    assert.equal(granted.state.claimBox.grants.length, 1);
    assert.equal(granted.state.claimBox.grants[0].id, 'festival-look-S1-2');
    const again = grantFestivalLook(granted.state, 2);
    assert.equal(again.granted, false);
    assert.equal(again.reason, 'ALREADY_GRANTED');
    const claimed = claimSeasonBoxItem(granted.state, 'festival-look-S1-2', { month: 2, day: 19 });
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.reward.kind, 'festival-look');
    const twice = claimSeasonBoxItem(claimed.state, 'festival-look-S1-2', { month: 2, day: 19 });
    assert.equal(twice.claimed, false);
    assert.equal(twice.reason, 'ALREADY_CLAIMED');
  });

  it('投票していない月は見た目が入らない', () => {
    const state = cleanSeasonState(null, { month: 2 });
    const result = grantFestivalLook(state, 2);
    assert.equal(result.granted, false);
    assert.equal(result.reason, 'NOT_VOTED');
  });

  it('本祭が終わったあとは見た目の受け取り期限が切れる', () => {
    let state = cleanSeasonState({ festivalVotes: { 2: 0 } }, { month: 2 });
    state = grantFestivalLook(state, 2).state;
    const expired = claimSeasonBoxItem(state, 'festival-look-S1-2', { month: 2, day: 22 });
    assert.equal(expired.claimed, false);
    assert.equal(expired.reason, 'EXPIRED');
  });
});

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this.textContent = '';
    this.id = '';
    this.hidden = false;
    this.style = {};
    this.listeners = {};
    this.parent = null;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
      if (typeof node.textContent === 'string' && node.textContent !== '') {
        this.textContent += node.textContent;
      }
    }
    return this;
  }

  replaceChildren() {
    this.children = [];
    this.textContent = '';
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  click() {
    for (const handler of this.listeners.click ?? []) handler({ target: this });
  }

  querySelector(selector) {
    const match = (node) => {
      if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      return node.tagName === selector.toUpperCase();
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (match(child)) return child;
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this);
  }

  querySelectorAll(selector) {
    const out = [];
    const match = (node) => {
      if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
      if (selector.startsWith('#')) return node.id === selector.slice(1);
      return node.tagName === selector.toUpperCase();
    };
    const walk = (node) => {
      for (const child of node.children) {
        if (match(child)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  get classList() {
    return { contains: (name) => this.className.split(' ').includes(name) };
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
    this.head = new FakeElement('head');
    this.elements = new Map();
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  getElementById(id) {
    return this.elements.get(id) ?? null;
  }

  querySelector() {
    return null;
  }

  addEventListener() {}
}

describe('season-events: 画面づくり', () => {
  it('週のお題のカードが7枚でき、受け取るボタンでお題を受け取れる', () => {
    const doc = new FakeDocument();
    let state = cleanSeasonState(null, { month: 2 });
    for (let n = 1; n <= 3; n += 1) {
      state = recordSeasonResultEvents(state, {
        resultKey: `2-6|c${n}`, month: 2, day: 6, hour: 12, won: n === 1, match: CPU_MATCH,
      }).state;
    }
    const claimed = [];
    const { progress, cards } = renderWeeklyMissionCards(doc, state, { month: 2, day: 6 }, (id) => { claimed.push(id); });
    assert.equal(cards.length, 7);
    assert.equal(progress.doneCount, 2);
    const claimable = cards.filter((card) => card.querySelector('button'));
    assert.equal(claimable.length, 2);
    claimable[0].querySelector('button').click();
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0], 'battle-3');
  });

  it('受け取り箱の段に、投票の見た目が出る', () => {
    const doc = new FakeDocument();
    let state = cleanSeasonState({ festivalVotes: { 2: 1 } }, { month: 2 });
    state = grantFestivalLook(state, 2).state;
    const claimed = [];
    const section = renderClaimBoxSection(doc, state, { month: 2, day: 15 }, (id) => { claimed.push(id); });
    assert.equal(section.querySelectorAll('button').length, 1);
    section.querySelector('button').click();
    assert.deepEqual(claimed, ['festival-look-S1-2']);
    assert.match(section.textContent, /ためたマニー/);
  });

  it('取り付けが結果画面からドロップを数える', () => {
    const doc = new FakeDocument();
    const resultSection = new FakeElement('section');
    resultSection.dataset = { screen: 'result' };
    doc.querySelector = (selector) => (selector === 'section[data-screen="result"]' ? resultSection : null);
    const grade = new FakeElement('b');
    grade.textContent = '1位';
    const headline = new FakeElement('h2');
    headline.textContent = '対戦結果';
    const rounds = new FakeElement('b');
    rounds.textContent = '3巡';
    const points = new FakeElement('b');
    points.textContent = '+30';
    const lead = new FakeElement('strong');
    lead.textContent = '一位で決着';
    doc.elements.set('resultGrade', grade);
    doc.elements.set('resultHeadline', headline);
    doc.elements.set('resultRounds', rounds);
    doc.elements.set('resultPointsEarned', points);
    doc.elements.set('resultLeadText', lead);
    globalThis.__GAMEROAD_TEST__ = { state: { match: { mode: '4p', friendRoom: false } } };
    const store = createSeasonStore(memoryStorage());
    let changed = 0;
    const mounted = mountSeasonEvents({ document: doc, store, onChange: () => { changed += 1; } });
    assert.ok(mounted);
    // 今日は11月8日（ドロップの期間 1〜10日・お祭りはお知らせの期間）。
    mounted.onResultShown();
    const saved = store.load(11);
    assert.equal(saved.exchangeTokens, 3);
    assert.equal(saved.catalogPoints, 10);
    assert.equal(changed, 1);
    delete globalThis.__GAMEROAD_TEST__;
  });
});
