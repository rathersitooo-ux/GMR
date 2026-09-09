from pathlib import Path
import json, re

SCRIPT = Path('tools/temp-battle-camera-live-r4.py')
MARK = '# CAMERA_PROBE_RESULT='
if any(line.startswith(MARK) for line in SCRIPT.read_text(encoding='utf-8').splitlines()):
    raise SystemExit(0)

html_path = Path('browser/GAMEROAD.html')
build_path = Path('deploy/cloudflare/scripts/build.mjs')
text = html_path.read_text(encoding='utf-8')
build = build_path.read_text(encoding='utf-8')
needles = [
    'fieldCameraState','setFieldCamera','renderField3D','project3','nodeWorld(',
    'battleMap','battleRuntime','battleBoard','battleField','battleViewport',
    'pointerdown','pointermove','pointerup','wheel','touchstart','touchmove',
    'updateBattleAvatar','renderBoardPlayers','phaseSurface','prefers-reduced-motion',
    'reducedMotion','controlled','player.character','selectedPartnerId'
]
out = {'htmlBytes': len(text), 'htmlLines': text.count('\n') + 1, 'needles': {}, 'build': {}}
for needle in needles:
    hits=[]; pos=0
    while len(hits) < 8:
        idx=text.find(needle,pos)
        if idx < 0: break
        line=text.count('\n',0,idx)+1
        ctx=re.sub(r'\s+',' ',text[max(0,idx-500):min(len(text),idx+len(needle)+900)])
        hits.append({'line':line,'index':idx,'ctx':ctx})
        pos=idx+len(needle)
    out['needles'][needle]={'count':text.count(needle),'hits':hits}
for needle in ['battle-camera-control-core.mjs','battle-camera-input-router.mjs','ARTIFACT_SPECS','GAMEROAD.html']:
    out['build'][needle]={'count':build.count(needle)}
ids=[]
for m in re.finditer(r'id=["\']([^"\']*(?:battle|board|field|map|world|runtime)[^"\']*)["\']', text, re.I):
    v=m.group(1)
    if v not in ids: ids.append(v)
    if len(ids)>=80: break
out['candidateIds']=ids
classes=[]
for m in re.finditer(r'class=["\']([^"\']*(?:battle|board|field|map|world|runtime)[^"\']*)["\']', text, re.I):
    v=m.group(1)
    if v not in classes: classes.append(v)
    if len(classes)>=80: break
out['candidateClasses']=classes
raw=json.dumps(out,ensure_ascii=False,separators=(',',':'))
with SCRIPT.open('a',encoding='utf-8') as f:
    f.write('\n'+MARK+raw+'\n')
print(raw)
