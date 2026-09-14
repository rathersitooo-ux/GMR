from pathlib import Path
import subprocess
import tempfile

HTML = Path('browser/GAMEROAD.html')
STATIC = Path('tests/browser-static-check.mjs')

html = HTML.read_text()
replacements = [
    (
        "function canAffordAbility(p,c){return p.manaCurrent>=effectiveAbilityCost(p,c).due}",
        "function abilityResourceAmount(value){return Math.max(0,Math.floor(Number(value)||0))}\nfunction canAffordAbility(p,c){const cost=effectiveAbilityCost(p,c),mana=abilityResourceAmount(p.manaCurrent),honey=abilityResourceAmount(p.honey);return mana+honey>=cost.due}",
        'canAffordAbility',
    ),
    (
        "function payAbility(p,c){const cost=effectiveAbilityCost(p,c);if(p.manaCurrent<cost.due)return null;p.manaCurrent-=cost.due;if(cost.base>0)p.nextCostReduction=0;return cost}",
        "function payAbility(p,c){const cost=effectiveAbilityCost(p,c),manaBefore=abilityResourceAmount(p.manaCurrent),honeyBefore=abilityResourceAmount(p.honey);if(manaBefore+honeyBefore<cost.due)return null;const manaPaid=Math.min(manaBefore,cost.due),honeyPaid=cost.due-manaPaid;p.manaCurrent=manaBefore-manaPaid;p.honey=honeyBefore-honeyPaid;if(cost.base>0)p.nextCostReduction=0;return{...cost,cost:cost.due,manaPaid,honeyPaid,manaAfter:p.manaCurrent,honeyAfter:p.honey,source:'能力'}}",
        'payAbility',
    ),
    (
        "if(paid.base)log(`${p.name}：${c.display_name}の能力用マナ${paid.due}を支払った${paid.reduction?`（次回軽減${paid.reduction}適用）`:''}。`);",
        "if(paid.base)log(`${p.name}：${c.display_name}の能力コスト${paid.due}を支払った（マナ${paid.manaPaid}${paid.honeyPaid?`＋ハニー${paid.honeyPaid}`:''}）${paid.reduction?`（次回軽減${paid.reduction}適用）`:''}。`);",
        'ability payment log',
    ),
]
for old, new, label in replacements:
    count = html.count(old)
    if count != 1:
        raise SystemExit(f'{label} anchor count={count}')
    html = html.replace(old, new, 1)
HTML.write_text(html)

static = STATIC.read_text()
marker = "\n  return errors;\n}\n\nasync function syntaxErrors(html) {"
if static.count(marker) != 1:
    raise SystemExit(f'static insertion anchor count={static.count(marker)}')
guard = """
  const abilityHoneyPaymentRequired = [
    'function abilityResourceAmount(value){return Math.max(0,Math.floor(Number(value)||0))}',
    'mana+honey>=cost.due',
    'const manaPaid=Math.min(manaBefore,cost.due),honeyPaid=cost.due-manaPaid',
    'manaAfter:p.manaCurrent,honeyAfter:p.honey',
    "source:'能力'",
  ];
  for (const required of abilityHoneyPaymentRequired) {
    if (!html.includes(required)) errors.push(`ability Mana/Honey payment seam missing: ${required}`);
  }
  for (const forbidden of [
    'function canAffordAbility(p,c){return p.manaCurrent>=effectiveAbilityCost(p,c).due}',
    'if(p.manaCurrent<cost.due)return null;p.manaCurrent-=cost.due',
    '能力用マナ${paid.due}を支払った',
  ]) {
    if (html.includes(forbidden)) errors.push(`stale Mana-only ability payment seam remains: ${forbidden}`);
  }
"""
static = static.replace(marker, guard + marker, 1)
STATIC.write_text(static)

node_test = r"""
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('browser/GAMEROAD.html','utf8');
function extractFunction(name){
  const needle=`function ${name}(`;
  const start=html.indexOf(needle);
  assert.notEqual(start,-1,`${name} missing`);
  assert.equal(html.indexOf(needle,start+1),-1,`${name} duplicate`);
  const open=html.indexOf('{',start);
  assert.notEqual(open,-1,`${name} body missing`);
  let depth=0;
  for(let i=open;i<html.length;i+=1){
    if(html[i]==='{') depth+=1;
    else if(html[i]==='}'){
      depth-=1;
      if(depth===0) return html.slice(start,i+1);
    }
  }
  throw new Error(`${name} unterminated`);
}
const source=[
  extractFunction('effectiveAbilityCost'),
  extractFunction('abilityResourceAmount'),
  extractFunction('canAffordAbility'),
  extractFunction('payAbility'),
  'globalThis.__abilityPayment={canAffordAbility,payAbility};',
].join('\n');
const context=vm.createContext({});
vm.runInContext(source,context);
const {canAffordAbility,payAbility}=context.__abilityPayment;
{
  const p={manaCurrent:5,honey:4,nextCostReduction:0};
  const c={ability_cost:3};
  assert.equal(canAffordAbility(p,c),true);
  const r=payAbility(p,c);
  assert.deepEqual([r.cost,r.base,r.reduction,r.due,r.manaPaid,r.honeyPaid,r.manaAfter,r.honeyAfter,r.source],[3,3,0,3,3,0,2,4,'能力']);
  assert.deepEqual([p.manaCurrent,p.honey],[2,4]);
}
{
  const p={manaCurrent:1,honey:5,nextCostReduction:0};
  const c={ability_cost:4};
  assert.equal(canAffordAbility(p,c),true);
  const r=payAbility(p,c);
  assert.deepEqual([r.manaPaid,r.honeyPaid,r.manaAfter,r.honeyAfter],[1,3,0,2]);
  assert.deepEqual([p.manaCurrent,p.honey],[0,2]);
}
{
  const p={manaCurrent:1,honey:2,nextCostReduction:0};
  const c={ability_cost:4};
  assert.equal(canAffordAbility(p,c),false);
  assert.equal(payAbility(p,c),null);
  assert.deepEqual([p.manaCurrent,p.honey,p.nextCostReduction],[1,2,0]);
}
{
  const p={manaCurrent:1,honey:1,nextCostReduction:2};
  const c={ability_cost:4};
  assert.equal(canAffordAbility(p,c),true);
  const r=payAbility(p,c);
  assert.deepEqual([r.base,r.reduction,r.due,r.cost,r.manaPaid,r.honeyPaid],[4,2,2,2,1,1]);
  assert.deepEqual([p.manaCurrent,p.honey,p.nextCostReduction],[0,0,0]);
}
assert.ok(html.includes('能力コスト${paid.due}を支払った（マナ${paid.manaPaid}'));
assert.ok(!html.includes('能力用マナ${paid.due}を支払った'));
console.log('ABILITY_HONEY_PAYMENT_DYNAMIC_PASS');
"""
with tempfile.NamedTemporaryFile('w', suffix='.mjs', delete=False) as f:
    f.write(node_test)
    node_file = f.name
try:
    subprocess.run(['node', node_file], check=True)
finally:
    Path(node_file).unlink(missing_ok=True)

subprocess.run(['node', 'tests/browser-static-check.mjs', '--self-test', 'browser/GAMEROAD.html'], check=True)
subprocess.run(['git', 'diff', '--check'], check=True)
print('X12_R10_HELPER_PASS')
