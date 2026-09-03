from pathlib import Path
import re

html = Path('browser/GAMEROAD.html').read_text(encoding='utf-8')
pattern = re.compile(r'p\.awake\s*=\s*Math\.min\(\s*p\.mana\.length\s*,\s*p\.awake\s*\+\s*1\s*\)')
hits = list(pattern.finditer(html))
print('AUTO_MANA_HIT_COUNT', len(hits))
if len(hits) != 2:
    raise SystemExit(f'expected exactly 2 legacy generic Mana +1 residuals, got {len(hits)}')
for index, hit in enumerate(hits, 1):
    start = max(0, hit.start() - 1000)
    end = min(len(html), hit.end() + 1000)
    context = html[start:end].replace('\r', '')
    print(f'===== AUTO_MANA_CONTEXT_{index}_BEGIN =====')
    print(context)
    print(f'===== AUTO_MANA_CONTEXT_{index}_END =====')
raise SystemExit('INSPECTION_ONLY_STOP_BEFORE_PRODUCT_MUTATION')
