from pathlib import Path

html_path = Path('browser/GAMEROAD.html')
static_path = Path('tests/browser-static-check.mjs')
html = html_path.read_text(encoding='utf-8')
static = static_path.read_text(encoding='utf-8')

old_start = "async function resolveBattle(){const m=state.match;if(m.busy)return;if(!m.target)throw Error('target-missing');const active=m.players.find(p=>p.id===m.activeId);if(!active||!legalOpponents(active).some(p=>p.id===m.target.defenderId))throw Error('illegal-target');m.busy=true;m.phase='resolve';const defender=m.players.find(p=>p.id===m.target.defenderId);m.battlePresentation="
new_start = "async function resolveBattle(){const m=state.match;if(m.busy)return;if(!m.target)throw Error('target-missing');const active=m.players.find(p=>p.id===m.activeId);if(!active||!legalOpponents(active).some(p=>p.id===m.target.defenderId))throw Error('illegal-target');const defender=m.players.find(p=>p.id===m.target.defenderId);const usedShield=defender.shields[m.target.shield];if(!usedShield)throw Error('shield-missing');if(!defender.deck.length)throw Error('shield-battle-replenish-deck-empty');m.busy=true;m.phase='resolve';m.battlePresentation="

old_shield = "if(active.human)await setBattleRuntimeState('attack');const usedShield=defender.shields[m.target.shield];if(!usedShield)throw Error('shield-missing');let replenish=defender.plan.battleId;if(!defender.hand.includes(replenish)||CARDS[replenish]?.runtime_status!=='playable')replenish=await replacementBattleCard(defender,'使用シールドの同位置補充に使う札を1枚選びます。');if(!replenish)throw Error('shield-replenish-card-missing');removeHand(defender,replenish);defender.shields[m.target.shield]=replenish;const battleReveals=[];m.players.forEach(p=>{if(p.id===defender.id){battleReveals.push(makeParticipant(p,usedShield,'auto_defense'));return}});for(const p of m.players){if(p.id===defender.id)continue;if(p.battleBlockedRound===m.round){"
new_shield = "if(active.human)await setBattleRuntimeState('attack');defender.shields[m.target.shield]=defender.deck.shift();const battleReveals=[makeParticipant(defender,usedShield,'auto_defense')];for(const p of m.players){if(p.battleBlockedRound===m.round){"

for label, old in [('resolve-start', old_start), ('shield-body', old_shield)]:
    count = html.count(old)
    if count != 1:
        raise SystemExit(f'{label} anchor count must be 1, got {count}')

html = html.replace(old_start, new_start, 1).replace(old_shield, new_shield, 1)

static_anchor = "  const resultRankPresentationContracts = [\n"
if static.count(static_anchor) != 1:
    raise SystemExit(f'static insertion anchor count must be 1, got {static.count(static_anchor)}')
shield_contract = r'''  const shieldBattleContracts = [
    [/const usedShield=defender\.shields\[m\.target\.shield\];if\(!usedShield\)throw Error\('shield-missing'\);if\(!defender\.deck\.length\)throw Error\('shield-battle-replenish-deck-empty'\);/, 'Shield-associated Battle slot does not fail closed before an empty-deck replenish'],
    [/defender\.shields\[m\.target\.shield\]=defender\.deck\.shift\(\);/, 'used Shield-associated Battle slot is not replenished from the deck'],
    [/const battleReveals=\[makeParticipant\(defender,usedShield,'auto_defense'\)\];for\(const p of m\.players\)\{if\(p\.battleBlockedRound===m\.round\)/, 'defender normal Battle submission is not preserved alongside the additional Shield Battle card'],
  ];
  for (const [pattern, message] of shieldBattleContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/if\(p\.id===defender\.id\)continue/.test(html)) {
    errors.push('defender normal Battle submission is still replaced by the Shield Battle card');
  }
  if (/使用シールドの同位置補充|shield-replenish-card-missing/.test(html)) {
    errors.push('Shield-associated Battle slot still replenishes from the defender hand');
  }

'''
static = static.replace(static_anchor, shield_contract + static_anchor, 1)

# Focused postconditions before writing.
required = [
    "shield-battle-replenish-deck-empty",
    "defender.shields[m.target.shield]=defender.deck.shift()",
    "const battleReveals=[makeParticipant(defender,usedShield,'auto_defense')];for(const p of m.players){if(p.battleBlockedRound===m.round)",
]
for token in required:
    if token not in html:
        raise SystemExit(f'missing required Shield postcondition: {token}')
for forbidden in [
    "if(p.id===defender.id)continue",
    "使用シールドの同位置補充に使う札を1枚選びます。",
    "shield-replenish-card-missing",
]:
    if forbidden in html:
        raise SystemExit(f'legacy Shield behavior remains: {forbidden}')

html_path.write_text(html, encoding='utf-8')
static_path.write_text(static, encoding='utf-8')
print('Shield patch applied with exact anchors and focused postconditions.')
