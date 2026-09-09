from pathlib import Path
import json, re

SCRIPT = Path('tools/temp-battle-camera-html-r5c.py')
HTML = Path('browser/GAMEROAD.html')
text = HTML.read_text(encoding='utf-8')
MARK = '# CAMERA_R5C_PROBE='
if any(line.startswith(MARK) for line in SCRIPT.read_text(encoding='utf-8').splitlines()):
    raise SystemExit(0)

def ctx(needle, before=1400, after=4200, limit=8):
    out=[]; pos=0
    while len(out)<limit:
        i=text.find(needle,pos)
        if i<0: break
        out.append({
            'line': text.count('\n',0,i)+1,
            'index': i,
            'text': re.sub(r'\s+',' ',text[max(0,i-before):min(len(text),i+len(needle)+after)])
        })
        pos=i+len(needle)
    return out

result={
  'moduleImports':ctx("from './",800,2200,10),
  'fieldCameraState':ctx('fieldCameraState',1800,5200,8),
  'fieldCameraDef':ctx('function fieldCamera(',2200,6500,2),
  'project3Def':ctx('function project3(',1800,4200,2),
  'renderField3DDef':ctx('function renderField3D(',2200,7000,2),
  'uniformCalls':ctx('uniform',1200,4200,12),
  'battleMapMarkup':ctx('id="battleMap"',1000,5000,2),
  'battleRailMarkup':ctx('class="battleRail"',1000,3000,2),
  'renderBoardDef':ctx('function renderBoard(',1500,5000,2),
  'screenChange':ctx("state.screen='battle'",1200,3500,8),
  'renderBattle':ctx('renderBattle',1200,3200,8),
  'moduleScript':ctx('<script type="module">',300,1600,4),
}
raw=json.dumps(result,ensure_ascii=False,separators=(',',':'))
with SCRIPT.open('a',encoding='utf-8') as f:
    f.write('\n'+MARK+raw+'\n')
print(raw)
