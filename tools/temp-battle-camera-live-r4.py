from pathlib import Path
import json, re

SCRIPT = Path('tools/temp-battle-camera-live-r4.py')
MARK = '# CAMERA_NARROW_PROBE='
if any(line.startswith(MARK) for line in SCRIPT.read_text(encoding='utf-8').splitlines()):
    raise SystemExit(0)
text = Path('browser/GAMEROAD.html').read_text(encoding='utf-8')
build = Path('deploy/cloudflare/scripts/build.mjs').read_text(encoding='utf-8')

def ctx(needle, before=900, after=2200, limit=4):
    out=[]; pos=0
    while len(out)<limit:
        i=text.find(needle,pos)
        if i<0: break
        out.append({'line':text.count('\n',0,i)+1,'index':i,'text':re.sub(r'\s+',' ',text[max(0,i-before):min(len(text),i+len(needle)+after)])})
        pos=i+len(needle)
    return out

result={
  'fieldCamera':ctx('function fieldCamera(',1200,4200,2),
  'battleMapPointer':ctx("$('#battleMap')",900,2600,6),
  'pointerdown':ctx("addEventListener('pointerdown'",800,2600,6),
  'wheel':ctx("addEventListener('wheel'",800,2400,6),
  'renderField3DCalls':ctx('renderField3D();',650,1500,8),
  'renderBoardDef':ctx('function renderBoard(',1000,2600,2),
  'battleMapMarkup':ctx('id="battleMap"',700,1800,2),
  'fieldCanvasMarkup':ctx('id="fieldCanvas"',700,1800,2),
  'battleRuntimeMarkup':ctx('id="battleRuntime"',700,1800,2),
  'buildCameraControl':build.count('battle-camera-control-core.mjs'),
  'buildCameraRouter':build.count('battle-camera-input-router.mjs'),
}
raw=json.dumps(result,ensure_ascii=False,separators=(',',':'))
with SCRIPT.open('a',encoding='utf-8') as f:
    f.write('\n'+MARK+raw+'\n')
print(raw)
