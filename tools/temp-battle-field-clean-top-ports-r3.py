from pathlib import Path

HTML_PATH = Path('browser/GAMEROAD.html')
TEST_PATH = Path('tests/browser-static-check.mjs')
html = HTML_PATH.read_text(encoding='utf-8')
test = TEST_PATH.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 anchor, found {count}')
    return text.replace(old, new, 1)


def replace_between(text: str, start: str, end: str, replacement: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise SystemExit(f'{label}: start anchor missing')
    j = text.find(end, i + len(start))
    if j < 0:
        raise SystemExit(f'{label}: end anchor missing')
    if text.find(start, i + len(start), j) >= 0:
        raise SystemExit(f'{label}: duplicate/nested start anchor')
    return text[:i] + replacement + '\n' + text[j:]


# Keep the existing FIELD-10/FIELD-11 movement authority, but make the Shield seam
# a clean left-to-right one-to-one top rail. 13 top points provide 12 Shield ports
# plus the deliberately unconnected exact center point F:U:6.
new_topology = """const SYMMETRIC_FIELD_NODE_IDS=Object.freeze([
  'F:U:0','F:U:1','F:U:2','F:U:3','F:U:4','F:U:5','F:U:6','F:U:7','F:U:8','F:U:9','F:U:10','F:U:11','F:U:12',
  'F:D:0','F:D:1','F:D:2','F:D:3','F:D:4','F:D:5','F:D:6','F:D:7','F:D:8',
  'F:L:0','F:L:1','F:L:2','F:L:3','F:R:0','F:R:1','F:R:2','F:R:3'
]);
const SYMMETRIC_FIELD_EDGES=Object.freeze([
  ['F:U:0','F:U:1'],['F:U:1','F:U:2'],['F:U:2','F:U:3'],['F:U:3','F:U:4'],['F:U:4','F:U:5'],['F:U:5','F:U:6'],['F:U:6','F:U:7'],['F:U:7','F:U:8'],['F:U:8','F:U:9'],['F:U:9','F:U:10'],['F:U:10','F:U:11'],['F:U:11','F:U:12'],
  ['F:D:0','F:D:1'],['F:D:1','F:D:2'],['F:D:2','F:D:3'],['F:D:3','F:D:4'],['F:D:4','F:D:5'],['F:D:5','F:D:6'],['F:D:6','F:D:7'],['F:D:7','F:D:8'],
  ['F:U:1','F:D:1'],['F:U:4','F:D:3'],['F:U:6','F:D:4'],['F:U:8','F:D:5'],['F:U:11','F:D:7'],
  ['F:U:0','F:L:0'],['F:L:0','F:L:1'],['F:L:1','F:L:2'],['F:L:2','F:L:3'],['F:L:2','F:D:0'],['F:L:3','F:D:1'],['F:U:3','F:L:2'],['F:D:2','F:L:3'],
  ['F:U:12','F:R:0'],['F:R:0','F:R:1'],['F:R:1','F:R:2'],['F:R:2','F:R:3'],['F:R:2','F:D:8'],['F:R:3','F:D:7'],['F:U:9','F:R:2'],['F:D:6','F:R:3']
].map(pair=>Object.freeze(pair)));
const SYMMETRIC_FIELD_TOP_PORT_IDS=Object.freeze([
  'F:U:0','F:U:1','F:U:2','F:U:3','F:U:4','F:U:5',
  'F:U:7','F:U:8','F:U:9','F:U:10','F:U:11','F:U:12'
]);
const SYMMETRIC_FIELD_PORTS=Object.freeze({
  'P1:L':'F:U:0','P1:C':'F:U:1','P1:R':'F:U:2',
  'P2:L':'F:U:3','P2:C':'F:U:4','P2:R':'F:U:5',
  'P3:L':'F:U:7','P3:C':'F:U:8','P3:R':'F:U:9',
  'P4:L':'F:U:10','P4:C':'F:U:11','P4:R':'F:U:12'
});"""
html = replace_between(
    html,
    'const SYMMETRIC_FIELD_NODE_IDS=Object.freeze([',
    "const SYMMETRIC_FIELD_START_ID='F:D:4';",
    new_topology,
    'symmetric common-field topology',
)

old_height = """function garden3DSharedHeight(band,index){
 const upper=[.78,1.06,1.42,1.78,2.08,1.78,1.42,1.06,.78],lower=[.22,.32,.44,.58,.72,.58,.44,.32,.22],side=[1.18,.9,.66,.94];
 if(band==='U')return upper[index]??.24;if(band==='D')return lower[index]??.24;if(band==='L'||band==='R')return side[index]??.24;return .24
}"""
new_height = """function garden3DSharedHeight(band,index){
 const upper=[.72,.82,.94,1.06,1.16,1.24,1.32,1.24,1.16,1.06,.94,.82,.72],lower=[.22,.32,.44,.58,.72,.58,.44,.32,.22],side=[1.18,.9,.66,.94];
 if(band==='U')return upper[index]??.24;if(band==='D')return lower[index]??.24;if(band==='L'||band==='R')return side[index]??.24;return .24
}"""
html = replace_once(html, old_height, new_height, 'Garden3D top-rail heights')

old_world = "if(band==='U'&&Number.isInteger(index)&&index>=0&&index<=8)return{x:(index-4)*1.8,z:-1.9,y:garden?garden3DSharedHeight(band,index):.24};"
new_world = "if(band==='U'&&Number.isInteger(index)&&index>=0&&index<=12){const laneIndex=index<6?index:index>6?index-1:null,x=laneIndex===null?0:(laneIndex-5.5)*1.45;return{x,z:-1.9,y:garden?garden3DSharedHeight(band,index):.24}}"
html = replace_once(html, old_world, new_world, 'top-rail world alignment')

html = replace_once(
    html,
    "topCenterHasDirectShieldPort:Object.values(SYMMETRIC_FIELD_PORTS).includes('F:U:4')",
    "topCenterHasDirectShieldPort:Object.values(SYMMETRIC_FIELD_PORTS).includes('F:U:6')",
    'runtime center-gap receipt',
)

# Static contracts: the one deliberate center gap moves to U6 and the 12 Shield
# columns must occupy every other top point exactly once in physical left-to-right order.
test = replace_once(
    test,
    r"[/topCenterHasDirectShieldPort:Object\.values\(SYMMETRIC_FIELD_PORTS\)\.includes\(['\"]F:U:4['\"]\)/, 'top-center no-upward-connection receipt is missing'],",
    r"[/topCenterHasDirectShieldPort:Object\.values\(SYMMETRIC_FIELD_PORTS\)\.includes\(['\"]F:U:6['\"]\)/, 'top-center no-upward-connection receipt is missing'],",
    'static center-gap receipt regex',
)

test = replace_once(
    test,
    "if (symmetricPortsBlock.includes(\"'F:U:4'\")) errors.push('central-top shared-field point is directly connected upward to a Shield/Gate edge');",
    "if (symmetricPortsBlock.includes(\"'F:U:6'\")) errors.push('central-top shared-field point is directly connected upward to a Shield/Gate edge');",
    'static center-gap assertion',
)

anchor = "  for (const [pattern, message] of symmetricGateFieldContracts) if (!pattern.test(html)) errors.push(message);\n"
extra = """  const cleanTopPortExpected = [
    [\"'P1:L':'F:U:0'\",0],[\"'P1:C':'F:U:1'\",1],[\"'P1:R':'F:U:2'\",2],
    [\"'P2:L':'F:U:3'\",3],[\"'P2:C':'F:U:4'\",4],[\"'P2:R':'F:U:5'\",5],
    [\"'P3:L':'F:U:7'\",7],[\"'P3:C':'F:U:8'\",8],[\"'P3:R':'F:U:9'\",9],
    [\"'P4:L':'F:U:10'\",10],[\"'P4:C':'F:U:11'\",11],[\"'P4:R':'F:U:12'\",12],
  ];
  const cleanPortsStart = html.indexOf('const SYMMETRIC_FIELD_PORTS=Object.freeze({');
  const cleanPortsEnd = html.indexOf('const SYMMETRIC_FIELD_START_ID=', cleanPortsStart);
  const cleanPortsBlock = cleanPortsStart >= 0 && cleanPortsEnd > cleanPortsStart ? html.slice(cleanPortsStart, cleanPortsEnd) : '';
  if ((cleanPortsBlock.match(/'P[1-4]:[LCR]':'F:U:\\d+'/g) ?? []).length !== 12) errors.push('all 12 Shield columns are not mapped to top-row ports');
  if (/:'F:[LR]:/.test(cleanPortsBlock)) errors.push('a Shield column still enters the common field through a side port');
  if (cleanPortsBlock.includes(\"'F:U:6'\")) errors.push('the exact top-center common-field point is not reserved as the single direct-connection gap');
  const cleanPortValues = [...cleanPortsBlock.matchAll(/'P[1-4]:[LCR]':'(F:U:\\d+)'/g)].map(m=>m[1]);
  if (new Set(cleanPortValues).size !== 12) errors.push('Shield columns share a common-field top port');
  for (const [literal] of cleanTopPortExpected) if (!cleanPortsBlock.includes(literal)) errors.push(`ordered top-port mapping missing: ${literal}`);
  if (!/const SYMMETRIC_FIELD_TOP_PORT_IDS=Object\\.freeze\\(\\[[\\s\\S]*?'F:U:0'[\\s\\S]*?'F:U:5'[\\s\\S]*?'F:U:7'[\\s\\S]*?'F:U:12'[\\s\\S]*?\\]\\)/.test(html)) errors.push('clean top-port rail identity list is missing');
  if (!/if\\(band==='U'&&Number\\.isInteger\\(index\\)&&index>=0&&index<=12\\)\\{const laneIndex=index<6\\?index:index>6\\?index-1:null,x=laneIndex===null\\?0:\\(laneIndex-5\\.5\\)\\*1\\.45;/.test(html)) errors.push('top ports are not aligned one-to-one with the 12 Shield-column x positions');
  const topRailBlockStart = html.indexOf('const SYMMETRIC_FIELD_EDGES=Object.freeze([');
  const topRailBlockEnd = html.indexOf('const SYMMETRIC_FIELD_TOP_PORT_IDS=', topRailBlockStart);
  const topRailBlock = topRailBlockStart >= 0 && topRailBlockEnd > topRailBlockStart ? html.slice(topRailBlockStart, topRailBlockEnd) : '';
  for (let i=0;i<12;i++) if (!topRailBlock.includes(`['F:U:${i}','F:U:${i+1}']`)) errors.push(`top common-field rail is broken between U${i} and U${i+1}`);
  const redundantTangleEdges = [
    \"['F:U:1','F:L:0']\",\"['F:U:0','F:L:1']\",\"['F:L:0','F:L:2']\",\"['F:L:1','F:L:3']\",
    \"['F:U:11','F:R:0']\",\"['F:U:12','F:R:1']\",\"['F:R:0','F:R:2']\",\"['F:R:1','F:R:3']\",
  ];
  for (const edge of redundantTangleEdges) if (topRailBlock.includes(edge)) errors.push(`redundant tangled side edge remains: ${edge}`);
"""
test = replace_once(test, anchor, anchor + extra, 'clean top-port static contracts')

HTML_PATH.write_text(html, encoding='utf-8')
TEST_PATH.write_text(test, encoding='utf-8')
print('BATTLE_CLEAN_TOP_PORTS_R3_MUTATION_READY')
