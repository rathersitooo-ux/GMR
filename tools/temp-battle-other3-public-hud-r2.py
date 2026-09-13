from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
STATIC = Path('tests/browser-static-check.mjs')

html = HTML.read_text(encoding='utf-8')
static = STATIC.read_text(encoding='utf-8')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, found {count}')
    return text.replace(old, new, 1)


html = replace_once(
    html,
    "<div class=\"publicTurnHud\" id=\"publicTurnHud\" aria-live=\"polite\"><div class=\"publicPlayerStrip\" id=\"publicPlayerStrip\"></div><div class=\"royalUsageStrip\" id=\"royalUsageStrip\" aria-label=\"各プレイヤーのロイヤルカード使用数\"></div></div>",
    "<div class=\"publicTurnHud\" id=\"publicTurnHud\" aria-live=\"polite\" aria-label=\"他プレイヤーの公開状態\"><div class=\"publicPlayerStrip\" id=\"publicPlayerStrip\"></div><div class=\"royalUsageStrip\" id=\"royalUsageStrip\" aria-label=\"他プレイヤーのロイヤルカード使用数\"></div></div>",
    'public HUD semantic labels',
)

old_hud_start = """function hudRender(){const m=state.match,root=$('#publicPlayerStrip');if(!m||!root)return;hudObserve();root.innerHTML='';
  m.players.forEach(p=>{"""
new_hud_start = """function hudPublicPeers(m){const viewers=m?.players?.filter(p=>p.human===true)??[];if(viewers.length!==1)return[];const viewerId=viewers[0].id;return m.players.filter(p=>p.id!==viewerId)}
function hudRender(){const m=state.match,root=$('#publicPlayerStrip');if(!m||!root)return;hudObserve();const peers=hudPublicPeers(m);root.innerHTML='';
  peers.forEach(p=>{"""
html = replace_once(html, old_hud_start, new_hud_start, 'viewer-relative public peers')

html = replace_once(
    html,
    "d.className='publicPlayerChip '+s.cls+(p.human?' you':'')+(active?' activeAttack':'');",
    "d.className='publicPlayerChip '+s.cls+(active?' activeAttack':'');",
    'remove self peer chip role',
)
html = replace_once(
    html,
    "const royalRoot=$('#royalUsageStrip');if(royalRoot){royalRoot.replaceChildren();m.players.forEach(p=>{",
    "const royalRoot=$('#royalUsageStrip');if(royalRoot){royalRoot.replaceChildren();peers.forEach(p=>{",
    'viewer-relative royal peers',
)
html = replace_once(
    html,
    "c.className='royalUsageCell'+(p.human?' you':'');",
    "c.className='royalUsageCell';",
    'remove self royal peer role',
)

private_counts = '<div>手札 ${p.hand.length} / 山札 ${p.deck.length} / チップ ${p.chip.length}</div>'
self_only_counts = "${p.human?`<div>手札 ${p.hand.length} / 山札 ${p.deck.length} / チップ ${p.chip.length}</div>`:''}"
html = replace_once(html, private_counts, self_only_counts, 'opponent private count fail-closed')

html = replace_once(
    html,
    "  render:hudRender,\n  chips:",
    "  render:hudRender,\n  peers:()=>state.match?hudPublicPeers(state.match).map(p=>p.id):[],\n  chips:",
    'public HUD peer QA accessor',
)

style_anchor = '<style id="gameroad-battle-camera-live-style">'
other3_style = '''<style id="gameroad-other3-public-hud-r1">
/* Viewer-relative peer HUD: self stays on self-owned surfaces; only other players occupy this peer family. */
.battle .publicTurnHud{left:auto!important;right:8px!important;top:76px!important;width:auto!important;max-width:min(255px,calc(100vw - 94px))!important}
.battle .publicPlayerStrip{justify-content:flex-end!important}
.battle .royalUsageStrip{width:auto!important;max-width:min(255px,calc(100vw - 94px))!important;justify-content:flex-end!important}
.battle .royalUsageCell{flex:0 1 82px!important;min-width:72px!important}
@media(max-height:470px) and (orientation:landscape){.battle .publicTurnHud{right:8px!important;top:72px!important}.battle .royalUsageCell{flex-basis:74px!important;min-width:66px!important}}
@media(max-width:540px) and (orientation:portrait){.battle .publicTurnHud{right:8px!important;top:76px!important}}
</style>
'''
html = replace_once(html, style_anchor, other3_style + style_anchor, 'right-top peer HUD style')

static_anchor = "  errors.push(...collectHomeVisualShellErrors(html));"
static_insert = r'''  const otherThreeHudStart = html.indexOf('function hudPublicPeers(m)');
  const otherThreeHudEnd = html.indexOf('function hudRenderTelemetryDrawer', otherThreeHudStart);
  const otherThreeHudBlock = otherThreeHudStart >= 0 && otherThreeHudEnd > otherThreeHudStart
    ? html.slice(otherThreeHudStart, otherThreeHudEnd)
    : '';
  if (!/function hudPublicPeers\(m\)\{const viewers=m\?\.players\?\.filter\(p=>p\.human===true\)\?\?\[\];if\(viewers\.length!==1\)return\[\];const viewerId=viewers\[0\]\.id;return m\.players\.filter\(p=>p\.id!==viewerId\)\}/.test(html)) {
    errors.push('public peer HUD is not viewer-relative/fail-closed');
  }
  if (!/const peers=hudPublicPeers\(m\);root\.innerHTML='';\s*peers\.forEach\(p=>/.test(otherThreeHudBlock)) {
    errors.push('public player chips are not rendered from viewer-relative peers');
  }
  if (!/royalRoot\.replaceChildren\(\);peers\.forEach\(p=>/.test(otherThreeHudBlock)) {
    errors.push('public royal strip is not rendered from the same viewer-relative peers');
  }
  if (otherThreeHudBlock.includes("p.human?' you'")) {
    errors.push('viewer self peer-role marker remains in other-player HUD renderer');
  }
  const renderPlayersStart = html.indexOf('function renderPlayers(){');
  const renderPlayersEnd = html.indexOf('function resolutionOriginLabel', renderPlayersStart);
  const renderPlayersBlock = renderPlayersStart >= 0 && renderPlayersEnd > renderPlayersStart
    ? html.slice(renderPlayersStart, renderPlayersEnd)
    : '';
  if (!renderPlayersBlock.includes("${p.human?`<div>手札 ${p.hand.length} / 山札 ${p.deck.length} / チップ ${p.chip.length}</div>`:''}")) {
    errors.push('Battle detail drawer does not fail closed on opponent hand/deck/chip counts');
  }
  if (!/id=["']publicTurnHud["'][^>]*aria-label=["']他プレイヤーの公開状態["']/.test(html)) {
    errors.push('public peer HUD lacks viewer-relative Japanese accessibility label');
  }
  if (!/id=["']royalUsageStrip["'][^>]*aria-label=["']他プレイヤーのロイヤルカード使用数["']/.test(html)) {
    errors.push('public royal peer strip lacks viewer-relative Japanese accessibility label');
  }
  if (!/<style id=["']gameroad-other3-public-hud-r1["']>[\s\S]*?\.battle \.publicTurnHud\{left:auto!important;right:8px!important;top:76px!important;/.test(html)) {
    errors.push('other-player public HUD is not anchored at the right-top presentation zone');
  }
  if (!/peers:\(\)=>state\.match\?hudPublicPeers\(state\.match\)\.map\(p=>p\.id\):\[\]/.test(html)) {
    errors.push('public HUD QA probe does not expose viewer-relative peer ids');
  }
'''
if static.count(static_anchor) != 1:
    raise SystemExit(f'static-check insertion: expected one anchor, found {static.count(static_anchor)}')
static = static.replace(static_anchor, static_insert + static_anchor, 1)

HTML.write_text(html, encoding='utf-8')
STATIC.write_text(static, encoding='utf-8')
print('patched', HTML, STATIC)
