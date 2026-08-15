from pathlib import Path
import subprocess

TARGET = Path("browser/GAMEROAD.html")
EXPECTED_BLOB = "58cd47d1c8720882e227ea43914860627f9d2ff2"
MARKER = 'id="gameroad-battle-hand-fan-selection-r2"'
ANCHOR = "</head><body>"

actual_blob = subprocess.check_output(["git", "hash-object", str(TARGET)], text=True).strip()
if actual_blob != EXPECTED_BLOB:
    raise SystemExit(f"production HTML blob moved: expected={EXPECTED_BLOB} actual={actual_blob}")

html = TARGET.read_text(encoding="utf-8")
for token in (
    ".handCard.first10Road",
    ".handCard.first10Battle",
    "function first10BindHand()",
    "while(p.hand.length<3&&p.deck.length)",
):
    if token not in html:
        raise SystemExit(f"missing required current anchor: {token}")
if MARKER in html:
    raise SystemExit("hand fan R2 marker already present")
if html.count(ANCHOR) != 1:
    raise SystemExit(f"expected exactly one head/body anchor, got {html.count(ANCHOR)}")

style = '''<style id="gameroad-battle-hand-fan-selection-r2">
/* BATTLE-HAND-FAN-SELECTION-PRESENTATION-001 R2.
   Presentation only: existing first10Road/first10Battle reservation truth is projected.
   No legality, card identity, hand order, battle, save, network, 109, Honey or HATE semantics. */
#hand.hand{
  justify-content:center;
  align-items:flex-end;
  gap:4px;
  overflow:visible;
  perspective:640px;
}
#hand .handCard{
  position:relative;
  transform-origin:50% 116%;
  z-index:1;
  transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease;
}
#hand:has(> .handCard:nth-child(2):last-child) > .handCard:nth-child(1){transform:translateY(3px) rotate(-4deg)}
#hand:has(> .handCard:nth-child(2):last-child) > .handCard:nth-child(2){transform:translateY(3px) rotate(4deg)}
#hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(1){transform:translateY(6px) rotate(-7deg)}
#hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(2){transform:translateY(0) rotate(0deg)}
#hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(3){transform:translateY(6px) rotate(7deg)}
#hand .handCard.select,
#hand .handCard.first10Road,
#hand .handCard.first10Battle{
  transform:translateY(-14px) scale(1.10) rotate(0deg)!important;
  z-index:30!important;
  border-color:rgba(225,250,241,.92);
  box-shadow:0 12px 28px rgba(0,0,0,.42),0 0 0 2px rgba(255,225,150,.30)!important;
}
@media(max-width:900px){
  #hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(1){transform:translateY(5px) rotate(-6deg)}
  #hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(3){transform:translateY(5px) rotate(6deg)}
  #hand .handCard.select,#hand .handCard.first10Road,#hand .handCard.first10Battle{transform:translateY(-10px) scale(1.08) rotate(0deg)!important}
}
@media(max-width:540px) and (orientation:portrait){
  #hand.hand{gap:3px}
  #hand:has(> .handCard:nth-child(2):last-child) > .handCard:nth-child(1){transform:translateY(2px) rotate(-3deg)}
  #hand:has(> .handCard:nth-child(2):last-child) > .handCard:nth-child(2){transform:translateY(2px) rotate(3deg)}
  #hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(1){transform:translateY(4px) rotate(-5deg)}
  #hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(3){transform:translateY(4px) rotate(5deg)}
  #hand .handCard.select,#hand .handCard.first10Road,#hand .handCard.first10Battle{transform:translateY(-8px) scale(1.07) rotate(0deg)!important}
}
@media(prefers-reduced-motion:reduce){#hand .handCard{transition:none!important}}
body.low-perf #hand .handCard{transition:none!important}
</style>
'''

html = html.replace(ANCHOR, style + ANCHOR)
TARGET.write_text(html, encoding="utf-8")

patched = TARGET.read_text(encoding="utf-8")
checks = {
    "single marker": patched.count(MARKER) == 1,
    "three-card left fan": "#hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(1)" in patched,
    "three-card right fan": "#hand:has(> .handCard:nth-child(3):last-child) > .handCard:nth-child(3)" in patched,
    "road selection projection": "#hand .handCard.first10Road" in patched,
    "battle selection projection": "#hand .handCard.first10Battle" in patched,
    "selected lift": "translateY(-14px) scale(1.10)" in patched,
    "reduced motion": "@media(prefers-reduced-motion:reduce){#hand .handCard{transition:none!important}}" in patched,
    "low perf": "body.low-perf #hand .handCard{transition:none!important}" in patched,
}
failed = [name for name, ok in checks.items() if not ok]
if failed:
    raise SystemExit("presentation contract failed: " + ", ".join(failed))
print("HAND_FAN_PRESENTATION_CONTRACT_PASS")
