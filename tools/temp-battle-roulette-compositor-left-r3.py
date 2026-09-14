from pathlib import Path
import re

runtime_path = Path('browser/battle-current-player-ui-runtime.mjs')
test_path = Path('tests/battle-current-player-ui-runtime.test.mjs')

runtime = runtime_path.read_text(encoding='utf-8')
test = test_path.read_text(encoding='utf-8')

old_base = '.screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{position:absolute!important;z-index:43!important;left:auto!important;right:var(--gr-ui-edge)!important;bottom:calc(var(--gr-thumb-h) + var(--gr-ui-edge) + 4px)!important;max-width:min(236px,36vw)!important;transform-origin:right bottom!important}'
new_base = '.screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{position:absolute!important;z-index:43!important;max-width:min(236px,36vw)!important}'
old_portrait = '  .screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{right:var(--gr-ui-edge)!important;bottom:calc(var(--gr-thumb-h) + var(--gr-ui-edge) + 4px)!important;max-width:min(164px,42vw)!important}'
new_portrait = '  .screen.battle[${ROOT_ATTR}="1"] [data-battle-playable-hand-row-roulette-live="1"]{max-width:min(164px,42vw)!important}'

for label, source in [('base roulette rule', old_base), ('portrait roulette rule', old_portrait)]:
    count = runtime.count(source)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 source anchor, got {count}')

runtime = runtime.replace(old_base, new_base, 1).replace(old_portrait, new_portrait, 1)

anchor = '  const styleText = document.head.children[0].textContent;\n'
marker = '  const roulettePlacementRules = [...styleText.matchAll('
if marker in test:
    raise SystemExit('roulette placement regression already present; refusing duplicate insertion')
if test.count(anchor) != 1:
    raise SystemExit(f'test styleText anchor: expected exactly 1, got {test.count(anchor)}')

regression = r'''  const roulettePlacementRules = [...styleText.matchAll(/\[data-battle-playable-hand-row-roulette-live="1"\]\{([^}]*)\}/g)]
    .map((match) => match[1]);
  assert.ok(roulettePlacementRules.length >= 3);
  for (const rule of roulettePlacementRules) {
    assert.doesNotMatch(rule, /(?:^|;)(?:left|right|top|bottom|transform-origin):/);
  }
'''
test = test.replace(anchor, anchor + regression, 1)

rule_re = re.compile(r'\[data-battle-playable-hand-row-roulette-live="1"\]\{([^}]*)\}')
rules = rule_re.findall(runtime)
if len(rules) < 3:
    raise SystemExit(f'roulette direct rules: expected >=3, got {len(rules)}')
for rule in rules:
    if re.search(r'(?:^|;)(?:left|right|top|bottom|transform-origin):', rule):
        raise SystemExit(f'compositor still owns roulette direction: {rule}')

if new_base not in runtime or new_portrait not in runtime:
    raise SystemExit('expected repaired roulette rules missing after patch')
if old_base in runtime or old_portrait in runtime:
    raise SystemExit('old roulette placement override still present after patch')

runtime_path.write_text(runtime, encoding='utf-8')
test_path.write_text(test, encoding='utf-8')
print('X8 compositor-left exact patch applied')
