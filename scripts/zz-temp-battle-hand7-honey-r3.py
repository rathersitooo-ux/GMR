from pathlib import Path
import re

html_path = Path('browser/GAMEROAD.html')
test_path = Path('tests/browser-static-check.mjs')
html = html_path.read_text(encoding='utf-8')
static = test_path.read_text(encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    return text.replace(old, new, 1)


html = replace_once(html, 'const hand=deck.splice(0,3);', 'const hand=deck.splice(0,7);', 'initial-hand-7')
html = replace_once(html, 'mana,awake:0,chip:', 'mana,awake:0,honey:0,chip:', 'player-owned-honey-init')
html = replace_once(
    html,
    'position:p.position,awake:Number(p.awake)||0,mana:',
    'position:p.position,awake:Number(p.awake)||0,honey:Number(p.honey)||0,mana:',
    'friend-honey-projection',
)

old_rank = "function ranksFFA(){const ps=state.match.players.map(p=>({p,depth:Math.max(...Object.values(p.lanes).map(a=>a.length))})).sort((a,b)=>b.depth-a.depth);let prev=null,rank=0;return ps.map((x,i)=>{if(prev===null||x.depth!==prev)rank=i+1;prev=x.depth;return{player:x.p,rank,depth:x.depth}})}"
new_rank = "function currentPlacementRanks(m=state.match){const ps=m.players.map(p=>({p,depth:Math.max(...Object.values(p.lanes).map(a=>a.length))})).sort((a,b)=>b.depth-a.depth);let prev=null,rank=0;return ps.map((x,i)=>{if(prev===null||x.depth!==prev)rank=i+1;prev=x.depth;return{player:x.p,rank,depth:x.depth}})}\nfunction awardRoundStartHoney(m){for(const row of currentPlacementRanks(m)){const gain=Math.max(1,Number(row.rank)||1);row.player.honey=Math.max(0,Number(row.player.honey)||0)+gain;log(`${row.player.name}：${gain}位のためハニー+${gain}。`)}}\nfunction ranksFFA(){return currentPlacementRanks(state.match)}"
html = replace_once(html, old_rank, new_rank, 'reuse-current-ranking-for-honey')

html = replace_once(
    html,
    "state.match.selectionLock=grCreateSelectionLock(state.match,'P1');grBattleReplayBegin(state.match);initRoundRuntime(state.match);",
    "state.match.selectionLock=grCreateSelectionLock(state.match,'P1');grBattleReplayBegin(state.match);awardRoundStartHoney(state.match);initRoundRuntime(state.match);",
    'initial-round-honey-award',
)
html = replace_once(
    html,
    'm.players.forEach(p=>p.plan=null);initRoundRuntime(m);',
    'm.players.forEach(p=>p.plan=null);awardRoundStartHoney(m);initRoundRuntime(m);',
    'later-round-honey-award',
)

old_generic_mana = "if(m.contentId!=='honey_hunt'&&CARDS[p.plan.roadId].effect_type==='none'){const before=p.awake;p.awake=Math.min(p.mana.length,p.awake+1);if(p.awake>before)log(`${p.name}：能力なしロードカードの成立でマナを1枚起こした。`)}"
count = html.count(old_generic_mana)
if count != 2:
    raise SystemExit(f'legacy-generic-mana-wake: expected 2 exact blocks, got {count}')
html = html.replace(old_generic_mana, '')
if 'function awakeManaFromHoney(' not in html:
    raise SystemExit('Honey Hunt Mana wake authority was accidentally removed')
if re.search(r'p\.awake\s*=\s*Math\.min\(\s*p\.mana\.length\s*,\s*p\.awake\s*\+\s*1\s*\)', html):
    raise SystemExit('legacy generic Mana +1 remains after exact removal')

marker = '  errors.push(...collectHomeVisualShellErrors(html));\n'
if static.count(marker) != 1:
    raise SystemExit(f'static-contract-marker: expected 1, got {static.count(marker)}')
contract = """  const correctedBattleResourceContracts = [
    [/const hand=deck\\.splice\\(0,7\\);/, 'fresh Battle ordinary hand is not initialized to seven'],
    [/function refill\\(p\\)\\{while\\(p\\.hand\\.length<3&&p\\.deck\\.length\\)p\\.hand\\.push\\(p\\.deck\\.shift\\(\\)\\)\\}/, 'post-use refill target is no longer three'],
    [/mana,awake:0,honey:0,chip:/, 'player-owned Honey balance is not initialized'],
    [/function currentPlacementRanks\\(m=state\\.match\\)/, 'current placement ranking was not made reusable for round income'],
    [/function awardRoundStartHoney\\(m\\)/, 'round-start Honey income is not mounted'],
    [/grBattleReplayBegin\\(state\\.match\\);awardRoundStartHoney\\(state\\.match\\);initRoundRuntime\\(state\\.match\\)/, 'round one does not award current-rank Honey before play'],
    [/m\\.players\\.forEach\\(p=>p\\.plan=null\\);awardRoundStartHoney\\(m\\);initRoundRuntime\\(m\\)/, 'later rounds do not award current-rank Honey'],
    [/position:p\\.position,awake:Number\\(p\\.awake\\)\\|\\|0,honey:Number\\(p\\.honey\\)\\|\\|0,mana:/, 'friend projection drops player-owned Honey'],
    [/function awakeManaFromHoney\\(/, 'Honey Hunt node-Honey Mana wake authority was removed'],
  ];
  for (const [pattern, message] of correctedBattleResourceContracts) {
    if (!pattern.test(html)) errors.push(message);
  }
  if (/p\\.awake\\s*=\\s*Math\\.min\\(\\s*p\\.mana\\.length\\s*,\\s*p\\.awake\\s*\\+\\s*1\\s*\\)/.test(html)) {
    errors.push('legacy generic no-effect-road Mana +1 wake remains');
  }
"""
static = static.replace(marker, marker + contract, 1)

html_path.write_text(html, encoding='utf-8')
test_path.write_text(static, encoding='utf-8')
print('PATCH_OK')
print('initial_hand_7', html.count('const hand=deck.splice(0,7);'))
print('refill_to_3', html.count('while(p.hand.length<3&&p.deck.length)'))
print('round_honey_calls', html.count('awardRoundStartHoney('))
print('legacy_generic_mana_blocks', html.count(old_generic_mana))
print('honey_hunt_wake_preserved', html.count('function awakeManaFromHoney('))
