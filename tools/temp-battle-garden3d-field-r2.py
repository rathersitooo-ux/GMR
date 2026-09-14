from pathlib import Path

HTML = Path('browser/GAMEROAD.html')
STATIC = Path('tests/browser-static-check.mjs')
html = HTML.read_text(encoding='utf-8')
static = STATIC.read_text(encoding='utf-8')

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one anchor, got {count}')
    return text.replace(old, new, 1)

def replace_function_until_next(text, name, replacement):
    start = text.find(f'function {name}(')
    if start < 0:
        raise SystemExit(f'missing function {name}')
    nxt = text.find('\nfunction ', start + len(name) + 10)
    if nxt < 0:
        raise SystemExit(f'missing next function after {name}')
    return text[:start] + replacement.rstrip() + text[nxt:]

css = r'''
/* GARDEN3D-FIELD-R2: actual user garden materials remain presentation-only. */
.garden3dPhotoStage{position:absolute;inset:0;z-index:0;pointer-events:none;display:block;opacity:.18;background-position:center;background-size:cover;background-repeat:no-repeat;filter:saturate(.92) contrast(1.06) brightness(.92);mix-blend-mode:soft-light;transition:background-image .22s linear,opacity .22s ease;border-radius:inherit;overflow:hidden}
.garden3dPhotoStage[hidden]{display:none!important}
.battleMap.garden3dField #fieldCanvas{filter:saturate(1.08) contrast(1.03)}
.battleMap.garden3dField:after{content:"";position:absolute;inset:0;pointer-events:none;z-index:0;background:radial-gradient(ellipse at 50% 54%,transparent 38%,rgba(7,19,10,.18) 100%);mix-blend-mode:multiply}
'''
html = replace_once(html, '</style>', css + '</style>', 'garden css')

html = replace_once(
    html,
    '<button class="fieldBtn" data-field="FIELD-10">新フィールド</button>',
    '<button class="fieldBtn" data-field="FIELD-10">新フィールド</button><button class="fieldBtn" data-field="FIELD-11">立体庭園</button>',
    'field choice',
)
html = replace_once(
    html,
    '<canvas id="fieldCanvas" aria-hidden="true"></canvas>',
    '<canvas id="fieldCanvas" aria-hidden="true"></canvas><div id="garden3dPhotoStage" class="garden3dPhotoStage" hidden aria-hidden="true"></div>',
    'photo stage',
)

const_start = html.find("const BATTLE_FIELD_CURRENT_ID='FIELD-01';")
const_end = html.find('const SYMMETRIC_FIELD_NODE_IDS=', const_start)
if const_start < 0 or const_end < 0:
    raise SystemExit('field constants anchors missing')
field_constants = """const BATTLE_FIELD_CURRENT_ID='FIELD-01';
const BATTLE_FIELD_SYMMETRIC_GATE_ID='FIELD-10';
const BATTLE_FIELD_GARDEN3D_ID='FIELD-11';
function normalizeBattleFieldId(value){return value===BATTLE_FIELD_SYMMETRIC_GATE_ID||value===BATTLE_FIELD_GARDEN3D_ID?value:BATTLE_FIELD_CURRENT_ID}
function currentBattleFieldId(){return normalizeBattleFieldId(state.match?.fieldId??state.setupField)}
function symmetricFieldActive(){const id=currentBattleFieldId();return id===BATTLE_FIELD_SYMMETRIC_GATE_ID||id===BATTLE_FIELD_GARDEN3D_ID}
function garden3DFieldActive(){return currentBattleFieldId()===BATTLE_FIELD_GARDEN3D_ID}
"""
html = html[:const_start] + field_constants + html[const_end:]

html = html.replace("===BATTLE_FIELD_SYMMETRIC_GATE_ID?SYMMETRIC_FIELD_START_ID:'C:0:0'", "!==BATTLE_FIELD_CURRENT_ID?SYMMETRIC_FIELD_START_ID:'C:0:0'")
if "!==BATTLE_FIELD_CURRENT_ID?SYMMETRIC_FIELD_START_ID:'C:0:0'" not in html:
    raise SystemExit('battleFieldStartPosition was not updated')

shared_world = """function garden3DSharedHeight(band,index){
 const upper=[.78,1.06,1.42,1.78,2.08,1.78,1.42,1.06,.78],lower=[.22,.32,.44,.58,.72,.58,.44,.32,.22],side=[1.18,.9,.66,.94];
 if(band==='U')return upper[index]??.24;if(band==='D')return lower[index]??.24;if(band==='L'||band==='R')return side[index]??.24;return .24
}
function symmetricFieldWorld(id){
 const parts=id.split(':'),band=parts[1],index=Number(parts[2]),garden=garden3DFieldActive();
 if(band==='U'&&Number.isInteger(index)&&index>=0&&index<=8)return{x:(index-4)*1.8,z:-1.9,y:garden?garden3DSharedHeight(band,index):.24};
 if(band==='D'&&Number.isInteger(index)&&index>=0&&index<=8)return{x:(index-4)*1.8,z:2.7,y:garden?garden3DSharedHeight(band,index):.24};
 const side={L:{0:[-8.1,-.9],1:[-9.25,.25],2:[-8.35,1.55],3:[-6.75,.8]},R:{0:[8.1,-.9],1:[9.25,.25],2:[8.35,1.55],3:[6.75,.8]}}[band]?.[index];
 return side?{x:side[0],z:side[1],y:garden?garden3DSharedHeight(band,index):.24}:null
}"""
html = replace_function_until_next(html, 'symmetricFieldWorld', shared_world)

shield_world = """function symmetricShieldRoadWorld(owner,lane,depth=0){
 const index=symmetricLaneIndex(owner,lane);if(index===null)return null;
 const d=Math.max(0,depth),x=(index-5.5)*1.45,z=-4.05-(d*1.04);
 if(!garden3DFieldActive())return{x,z,y:.24};
 const laneHeight=[.72,.82,.94,1.06,1.16,1.24,1.24,1.16,1.06,.94,.82,.72][index];
 return{x,z,y:laneHeight+d*.18}
}"""
html = replace_function_until_next(html, 'symmetricShieldRoadWorld', shield_world)

materials = """const GARDEN3D_SCENE_MATERIALS=Object.freeze([
 {id:'garden-concept',source:'accepted-concept',data:'data:image/webp;base64,UklGRoADAABXRUJQVlA4IHQDAABQEgCdASpgADYAPxl2qVKsp6Oit/uJWZAjCWIAxKO0Kx208LWoBqdZPaOFQKGE511NtKcu555w66+DbfjnCvvKu7jFeZIl7NFITjC+Gf5f+T35J0ceVsDpdOKkkMUmU4JYQpxk4MrC/YuQAHiQ67blL8i6Fw6O3FpBx9FoEewo1WFpVxZoCsgNBDIP0BSsVHt6LqAaH02MaerzAAD+3CEXA3BOj7HoqNaMDIE5Kocy4aYt3r14LorjS3O5NzzAhA59sRm+FLMcGFQlQdC8i+fzVlPbAsTqyksDx0TSCCghoVpz6oZ7Kkwea/gXHreYahl5zGRUV6tClHIpRr24M1jWnYM5ro7LB1xkXEVS6ewQZa7GOmKK2RXJQqbpxm6lpo2mDWW8oJahi0AZru5lJyfh6qwaOKZ8mDVPWc5TgVweAt8GLTOJzw8siraFmMrC53RpRcsPfgEsoEyHn2EG9f7KMlxD/3fWjJ+nojV1zTFUcsKrxPYoT62TigGUKaf98utNL6/UR9IQCxzDH4S5cSiDkv+aWy6F9+zGDQskL695kV6HXMSmJkAwynBzPYESestOrqR3QnY9sQDe65IluhesmaHrI++6T6knuEDUvm3kIgulqHnwlKaMnHph3uDoE5gR6nwS8/Y0EN1jg9OvubIjLphWn2gtxDT5t2fiDkSHq0JM1h87JHRnVtN4Qk4OlVbodCnEt6WK1LhkSDPEZzOrJMtFXll6N/tvtSM4UvoXygIfXpXplhcdJmWU95jftRkHn1o8aeFMD7UiX5KKIkvWYagdLJA0weuyivo3j4nVE+0rQgoKnHLGVM+/4fGuXM/ngra2bM45bFl8iC5ONByCyVmjUrUwCouX/j9dr8ytViLz1/c9dPs3URZ1Ofe0C26qXkd+YAgHHxUww/ytzp/eFDo2mre2yLS0AEI7p/XA/MxKhCKOmwQhq7XAVllONlDymFMmgcrw/wXrZmNiO+K98SK+mmtxJgfQ3PEYb5pjGGwFNWxopB52xh6VTIKUvAx/+fqDvfVKQ5Dbf0wMnO9zGE7pxEW3KzQKjqvtvuHvVkNHo/t9dfJiD5Mq9uPIR6w/km8LvyH0Bzwok/UuoQxt6/vdT7zSGsFPMfwbaPGPlPHhXmKOtbmMFl6LFOxtDZsez36fu8AmqEKikT/M6SXk9oAAAA=='},
 {id:'garden-user-01',source:'user-photo',data:'data:image/webp;base64,UklGRiwBAABXRUJQVlA4ICABAACQCACdASpAADAAPzGKvFiuqKWjqrQKAdAmCUuwCyTVyYeO3an7niU2m3GU/g0DEXYhINxC1r3QJuCgfSC8zGnrsi2DhXQ6/+Ri/FM9kAD9WxqUBMsHAj4VKPUGPaVzZxI/fzObbErrigsoNvdKrDBq65SxeevGxWBS7yQXb7gKERtzGXOU6g5JDrgCbKCoAwm4hkFULrYXxKeI8K2KjgN775/0URWa/3ieEqeKKs7J6Ti4DrZE4g/flZ53UE+fheDMx57IiVqAyc+/3o7Y0N+VhMkfBzU+Xv4feHh3Mwe+vSG+PNjsdsLNrLtRob2PwqCpeq0DN24Ah61UCrVWOyHzPsGN/yxi7dKtUj3CPXLs1bbJp9z9rYfODSoBVnAAAAA='},
 {id:'garden-user-02',source:'user-photo',data:'data:image/webp;base64,UklGRvwBAABXRUJQVlA4IPABAABwCwCdASpAADAAPxVwrFKspqQiurmcAZAiiWMAwKeqmxk1irGICJTBO20o7aZaNcftHjlNnXUoiQsGqp9I8a0EoSkV/YRkNeGJxn3f55j74nI/yKceSEg9rnbKRIQG+ZHp7u2YAP6mbEXp6l2S1daoYZ6n5MM6BU/1yWvrTKm0u7ncc61g367ZYBMrk3aYRANhwEuc1VsLCFWQPVHf8Ci+e/ZXlULmBRrlfcfOLD0d4vgh/RWA06z3PbZ32V6UQXBXacS5C2jcbkUVa291mGWjVR0YJhN5TYZ47B4J4KN5r1/UiXFRAiz13MiAAHtD67YLR5cBfb7DOXgTm/ovf3tPy4t/aSNcSlgeMeJ47RIDEYzo5cs40bw5uGHPpxcRw7Yu9Tk6foOvXSe0Wt+ypjNbhj58AH6COVm+YXtqjeHfcr31jxNkJElcBsj8f2mbAJGk/zLaEB+bWK5OXuPG3WeqTMc40qFtGQ5OiZtlVLl7rn2gLnH2Xh+6dwGp+AQ+P5quiA2xH9AYZq0NqLSBBt771DvZ4r3IXLG36hx2H32y3gU527rI306lTdttz297dtytGIzJJjZ4VOs0wUug+sX9L6ekP/FslVjp5IkuBA0Yt84vHRvLcGEcJRcmBwyinB9lPEuk3UQUSzAwu8UEgAAA'},
 {id:'garden-user-03',source:'user-photo',data:'data:image/webp;base64,UklGRoIBAABXRUJQVlA4IHYBAADwCQCdASpAADAAPyV6s1KuJ6SitVYN+cAkiUAZr4KPwlwKPtm4MfSbTg2PTEV2JdsCs2OFSi9C56GDWjKJzb/kf6cUAnUMr55JOnaW8OENmkKK0m8eEUQAAPtCtuKVPP7QjVTk5ytLiKmV/XDeu2hz/xzApdx6saILMg60c9kz1/OB8fqstXaEmEE+D10bZUgaMR54vVf/29h+Ik6oQ9J9gw1W6aISU+ldjTQDVJO/hIj/lipfIkFcpDbtJ9cY/wkEyR4i5pL42/+8uGBoUudwQBSF3OunpD8kf4EAqYBFgq0qtKz3bD+KlsqQNcBBOXAJU9JnkcAukA8VD3Tj7XtEqm4QKKYBArUnxRyiV8k3cdP7XPSb0XbWNiaQ224+9VcRDBY6hLZ2Y6RrvOsLBO2LTnUOZU595sX5DQJyTQmYx3teXLNqwZMy5+571d/QyzxijHHxGWEJZLm3WgmJIlqbwUL0bb+mPQqMl+Lk8G82gXqSc7n0AA=='},
 {id:'garden-user-04',source:'user-photo',data:'data:image/webp;base64,UklGRhoCAABXRUJQVlA4IA4CAADwCgCdASpAADAAPzF8uFMupyUirVzLadAmCWVMAFxfT6WI2o1Ws8RqNhp18ZxIxur19i3ZnmM67dGd6Yu6N3LNDlgDZW2qVXSEoBT93BSQx/iIhNXVGnWvFOmIf2GZREQA/qMn4NBlZk92NfUPzmsGHvftCMIiIgOiWN4JtXD68j4M6Wj+gETzAQPeM27NTI6Ql/glwwI8KRPCmzfyGY+uSCh1k2B9DDWxmHEiaWRzqDbxgBzjUiz1UVzYJ526CPFV+sUblV+GSyT9kjtvPafboqO3JOybeQm0qVkvmNgLcs7ymGwWPI6tLpENROqYFbYPacRiElNQ38dJyKqDW/STVksrGvS4Qt81sJ+S5zOLcrQtoSQoAHXT7Edg4lBK6GpQxxZXr/+fDgwkTRQASeEFYL7bsRdKip3hP7XVmsMo/NiO6jM4sMAjpzLqKxqACp8psFe9HaTr1GYhdoxHqEmqKnROYeOXQ4RT0M+co9nnBa7whw3O9afr6kgIJcWGEC1WMZnGxmYruiRnqaTPBv+tzpmtlOIdv+sOBMnw8nkck5KasjNZVboVBNebAEwylapy4jzVo+LocYpMJpQyLYDMYmEjGEZzrGM5BtNydMis/OU5mf0GOxU/TVdLYnUFNn7buKeAilIr99zt5DYkOmgzDAVOFrH9UbBzSL6Smy/NQBBddZWgXjvhP5kzOHAA'},
 {id:'garden-user-05',source:'user-photo',data:'data:image/webp;base64,UklGRuABAABXRUJQVlA4INQBAACwCgCdASpAADAAPxFwqlKsJqOiurs4AYAiCWMAyY+qOx81preHqGurB1KwzkOZSLpxnqC88+dlsCKm4UndS1gJCqzG5WgIW1n2bVNRuesQtfiHA8XTaY7ZOBqwK5wgAP5mXHiKzG3UlZesI3oQuMPSm+zbinEiEJv+HbvahpgyKrcTXdzcNjcbikWzmptz6MCi1Gbje5ksZDKCl6xHD2/MICQTPi8JI4Rh8xGH23f0+IN80iCH9jcMX993qm0nsdmLuI/PqBJxnj40atbZmlf/rx7HXv6XQgVXnUF4GHP+C8Bu4ciTLKbvADoiQ8ifyrc7fih4RbuZiL/h5LEhfunKuaWDGTwqhjkAFU8o0xDGDcxx7YM+dPr6U0bFPPa5OEwWabUFv4bCPjNTFGc2kS/eN7grY/KB7h6wVRMg8c4BaC9//u+7VUK9xN3UM/ZsClEYq7gu5djOhDhtaEZA+bDcL/XtZ1xUSe8c2SeJbjlK/irDuRavZX+j9t/DOokdHAX89Ff9JGhjbn7W1hhYfm96B2pwd6q96fqE8dD37Y02dSwh5eToHZHGysYtUmU96NYpV1aDXsxc4SAqq2yjOpOGZP4hDGYBFD++DIE95kaGy+JIAAA='},
 {id:'garden-user-06',source:'user-photo',data:'data:image/webp;base64,UklGRuoBAABXRUJQVlA4IN4BAACQCgCdASpAADAAPx1ysVKtJqSitVn9+aAjiWMAxguqaxY0qrDHrxTy8woiHCMrB1jT+fm/YRtpkM9azoXbqg6BhZeq5UPkV5hLeXIuwnFUPGiA6ftU3ZTO+JhTOrAA/o7nvSBDYPMNY097d9sWEVmwecn6OUuYFcxkNzo+xa5HYvgESADJo5X0u5lrZoBYf+7lRhDm7CsyrK0v6ZgQNH+cWGUy2rr5SoNUw4ElXxVK606PTXC581pCWJLySfSL0vbAQCKszT8dcNNT4mRSn9Xo3Yv8R/a/ZhxRdB/Iqqvr5KFG9qvr2yli7xnIWQqJsxwN3czEjhDLEVuAcoyHo3r0AMEjXrZRaIyFIrT+jiURsQzaiaiA9xnYY7x9CUZEK/lY9If3pMyVUJJ3cXf8FnPcFRikbAvfYhpIV1Cy4xX1yqhmYX1YFLOECuZmrSyUtW4kZGkprQTF7cXT+ATc0EG6k12kg4g4Lsf/76AlKbehG4HHb2r8YpTc7uQB16O00kwNsB0gnn6YD/vQVHmEEcgWnt5PcWuQ45RFOIWY9MkHDUdc19cFY89PzVek4m+Qe8Evw2DySXEMH2aK8Npf1I9obYS56k6+8coBq4KPvxOW0WCOOeL3///MZ3DMAAAA'},
 {id:'garden-user-07',source:'user-photo',data:'data:image/webp;base64,UklGRggCAABXRUJQVlA4IPwBAABwCgCdASpAADAAPxV2rFKsp6Qit/qtUZAiiWMAyNuqOxw0/q9H4hUkFYhoy2QORPyY0U1JtBLDo1Wgy1noyHNyn3zmWbOxjMyTzO8iQKo452qU0wgIFGuMYnagAAD+wdrGcziW9yclw9twgRSPJylX/bpOBsdTeuf71mO8b6qiMAhVJil6us7pCrciLv9WxuzA335qRNkWd+3yR3b7hb1kHlJe5UlGlXCE+1Iw4znhJ3r0SceSDema2IPieWZvtVo6WDF/EIpJmgC4heyjBTakPDI/zSQwRb/wIfNJVm8AI09jwzmipk054seYosINsEmK1fcYR37RzacK5+9yVsW60SBiugQ0aG2FeRV1KHKKItxXW0zxmj3LuwmJpdW/W30dkijEoIMvtttCUEQPGKcyPwBaqohiKV0UDy2NxQUoBc4MhTt3jOzg4/IwxyoxuJcNNoQMM4/thRjsvsHwO24UiDnLWcNADFFWwu4Vlk0W9ijpxGXfkoclDa4VGXL08V2B5A2qud00jOiylrtl+ZPC8FoOwUwkYagiOs8MSu9Vw/AJqEvDwysLylGxcNhV27U6GZyE50ISW6Oc346m5lZyKE2aXqyT7LdBfpRqdTDYkPENwCsxwKslXj8I1lw280YQt/RbVPkWvmj8mOQ3pSXRPmBZHFrLh/q98gAA'},
 {id:'garden-user-08',source:'user-photo',data:'data:image/webp;base64,UklGRkICAABXRUJQVlA4IDYCAACQDACdASpAADAAPzGAuVMuqCWirVzLadAmCWYAxFhgfeVqd4GZ8XXTuZ5JD26TXCQaCg/rnYPHpRBhSyxEWDNU0mDYl9LN66rtfc29laiNBmEZGJuetgph09ZFnXTCpmxyWXaFjsD5SsuDRQvAAP7zWKpF3Q0RczlO0C8wrzwAd6yD5FQKWU2Say/qcLejx8pkM8R4+gbnfAzLRSNSSzN45xTnD79A2YLQrbvIYqgBrHvxAQrNsq5uVzEhNHAG8f50ocTmIfXuwrjr0vEMOdllzaVCqgtBjtZ2/dFLw21exsb3dLb8fB0o63yh0kWN06eviAhTDfmsVBLzJS5BFcTmW7tMwRPJjXlsNlYRr9sbfjQcWR1Ohlgq2fFixB813w09v+3Y/ha756JmhZrOwaLdIgsqIx3m2SKJThXVh2TndWkmwh2zW6mdc6l+iVb/SQQiMixKHYI+0D4A0UUXW7QJJoEI1fZm3qxgQsInBxmhZqKDnqDQfvTnbftiRzhi052e0xNKI8So0VVT2XQEouYf2iltXSz2GfZErmmbz7oa0giCLBR6OXIn1J6vh6lTF8UsdWj79h6Z885NKeki2dkH70XMPVULak///XKxYW+ZZrhixvinxIjzc4g+IySk26l4rBnPo7fYUMzmTHOj0QiQPcd0DAjyqqgjXpgJA3H/sG+JaOHeEKXqUt7K9QiOttz2zeWuvOLzB1V12XPe4UqhgJAg+0s7U/rGykiQJyLUEDglqgAAAA=='},
 {id:'garden-user-09',source:'user-photo',data:'data:image/webp;base64,UklGRmoBAABXRUJQVlA4IF4BAACQCACdASokADAAPyF2slKtJySitV1YAaAkCWUAy+bzNc91OpkCodVpbDNCoEOWSpbOXbQ9HwCRQKyzv85R3oYohxe4Uc7zN1oJlkqkAAD14fUvfdZjMrFN48rL9fiMzsu6zvefREOkHj89+m3eR34aZmTSICx3Qoh+zlOt7hmX52qW2IkSRsxHH384C5NmX+nI63e0wZef+SCiPU474o/4VoJcL9Nku6oNBjYvTzq0srLHqqZcIV3S0zCvQFwkHwfq2/wn+2Yw9EY6fUOMxkYN2e8ePa+kXdaLTEcvrHcncSr/uOjH8ICNjv00cMgR0kx3YvYQ2v5dfNB2Nhtn2YyIkfyaZkCQnM/QqLguDwZXM4IynPQlDaiGTfb1wd/I08MW47ucth4GGIH2zm5ljeGLuRbojQW7t2kJbtBhqdk1w0IgwAkHmY5bxYbjahXsZxt8ao/Nb/z/BwpMd7AAAA=='},
 {id:'garden-user-10',source:'user-photo',data:'data:image/webp;base64,UklGRgABAABXRUJQVlA4IPQAAAAQCACdASokADAAPy12t1KupqWisdzKAdAliWMAv+wRoknkQtcs1jb1jo51nmOHK+vyo41YsiQqChxyzzmrfIRgaQcyRAuZv+wAAP7D1vN4+rsSfBup+LYnbRN4n1Lzw5dT/0WyYI+01AGq90G4yFYFvol/XTqscxZFOFbV6LOoXBmQ8HFGhLvauJPjCfk/EKs1aihx69FQ16ShikjHJ0znhJXiZ6d121sJCEaxLBZExftCxJ3q7m0prUQZYW1NIMHYbNsK+4Eh07YXzrsNSWzOr824EcE0lbwvUgBrqxW/58PwL/JwAtZQMgOfu0iMXRKihsAA'}
]);
function garden3DSceneMaterial(viewer){
 const pos=viewer?.position||SYMMETRIC_FIELD_START_ID;if(pos===SYMMETRIC_FIELD_START_ID)return GARDEN3D_SCENE_MATERIALS[0];
 let h=0;for(let i=0;i<pos.length;i++)h=((h*33)^pos.charCodeAt(i))>>>0;return GARDEN3D_SCENE_MATERIALS[1+(h%10)]
}
function syncGarden3DPhotoStage(viewer){
 const host=$('#battleMap'),stage=$('#garden3dPhotoStage'),on=garden3DFieldActive();host?.classList.toggle('garden3dField',on);if(!stage)return;
 stage.hidden=!on;stage.setAttribute('aria-hidden','true');if(!on){stage.style.backgroundImage='';stage.dataset.scene='';return}
 const scene=garden3DSceneMaterial(viewer);if(stage.dataset.scene!==scene.id){stage.dataset.scene=scene.id;stage.style.backgroundImage=`url("${scene.data}")`}
}
function pushGarden3DSceneGeometry(items,all,viewer){
 const add=(x,y,z,sx,sy,sz,col)=>items.push({x,y,z,sx,sy,sz,col,kind:'box'}),wood=[.23,.16,.09,1],stone=[.34,.36,.32,1],moss=[.18,.32,.16,1],leaf=[.18,.42,.19,1];
 add(-8.55,-.18,-5.8,1.05,6.1,1.05,wood);add(8.55,-.18,-5.8,1.05,6.1,1.05,wood);add(-5.3,2.75,-7.35,6.8,.34,.58,wood);add(5.3,2.75,-7.35,6.8,.34,.58,wood);
 for(const id of all){const w=nodeWorld(id,viewer);if(!w)continue;const f=id.startsWith('F:'),shield=id.includes(':S'),road=id.includes(':R');if(!f&&!shield&&!road)continue;
  const col=f?(id.includes(':U:')||id.includes(':L:')||id.includes(':R:')?leaf:stone):(shield?moss:wood),sx=f?1.12:(shield?1.02:.76),sz=f?1.02:(shield?.88:.72);
  add(w.x,w.y-.16,w.z,sx,.18,sz,col);if(w.y>.42)add(w.x,-.08,w.z,.18,Math.max(.18,w.y-.08),.18,f?stone:wood)
 }
}
"""
render_anchor = 'function renderField3D(){'
if html.count(render_anchor) != 1:
    raise SystemExit('renderField3D anchor missing/duplicate')
html = html.replace(render_anchor, materials + '\n' + render_anchor, 1)
html = replace_once(html, "const viewer=m.players[0],cam=fieldCamera(viewer);", "const viewer=m.players[0],cam=fieldCamera(viewer);syncGarden3DPhotoStage(viewer);", 'garden photo sync')
html = replace_once(html, "if(m.honey?.byNode)", "if(garden3DFieldActive())pushGarden3DSceneGeometry(items,all,viewer);\n if(m.honey?.byNode)", 'garden geometry mount')

# Preserve existing field-10 verification and add field-11 contracts to the approved static-check lane.
garden_checks = r'''
  const garden3DFieldContracts = [
    [/data-field=["']FIELD-11["'][^>]*>立体庭園<\/button>/, 'Garden3D field choice is missing'],
    [/const BATTLE_FIELD_GARDEN3D_ID=['"]FIELD-11['"]/, 'Garden3D field identity is missing'],
    [/function symmetricFieldActive\(\)\{const id=currentBattleFieldId\(\);return id===BATTLE_FIELD_SYMMETRIC_GATE_ID\|\|id===BATTLE_FIELD_GARDEN3D_ID\}/, 'Garden3D does not reuse the symmetric legal topology'],
    [/function garden3DFieldActive\(\)\{return currentBattleFieldId\(\)===BATTLE_FIELD_GARDEN3D_ID\}/, 'Garden3D active-field resolver is missing'],
    [/id=["']garden3dPhotoStage["'][^>]*aria-hidden=["']true["']/, 'Garden3D actual-photo presentation stage is missing'],
    [/const GARDEN3D_SCENE_MATERIALS=Object\.freeze\(\[/, 'Garden3D scene material pack is missing'],
    [/function garden3DSharedHeight\(band,index\)/, 'Garden3D vertical node projection is missing'],
    [/function pushGarden3DSceneGeometry\(items,all,viewer\)/, 'Garden3D rocks/leaves/branches scene geometry is missing'],
    [/syncGarden3DPhotoStage\(viewer\)/, 'Garden3D photo materials are not mounted into the live field renderer'],
    [/if\(garden3DFieldActive\(\)\)pushGarden3DSceneGeometry\(items,all,viewer\)/, 'Garden3D geometry is not mounted into the live WebGL field renderer'],
    [/!==BATTLE_FIELD_CURRENT_ID\?SYMMETRIC_FIELD_START_ID:'C:0:0'/, 'Garden3D does not enter through the accepted shared-field start'],
    [/\.garden3dPhotoStage\{[^}]*pointer-events:none[^}]*\}/, 'Garden3D photo material can intercept battle input'],
  ];
  for (const [pattern, message] of garden3DFieldContracts) if (!pattern.test(html)) errors.push(message);
  const gardenMaterialBlockStart = html.indexOf('const GARDEN3D_SCENE_MATERIALS=Object.freeze([');
  const gardenMaterialBlockEnd = html.indexOf('function garden3DSceneMaterial', gardenMaterialBlockStart);
  const gardenMaterialBlock = gardenMaterialBlockStart >= 0 && gardenMaterialBlockEnd > gardenMaterialBlockStart ? html.slice(gardenMaterialBlockStart, gardenMaterialBlockEnd) : '';
  if ((gardenMaterialBlock.match(/source:'user-photo'/g) ?? []).length !== 10) errors.push('Garden3D must ship exactly ten user-photo materials');
  if ((gardenMaterialBlock.match(/data:image\/webp;base64,/g) ?? []).length !== 11) errors.push('Garden3D material pack must contain ten user photos plus one accepted concept image');
  if ((gardenMaterialBlock.match(/source:'accepted-concept'/g) ?? []).length !== 1) errors.push('Garden3D accepted concept material count is not exactly one');
  if (/THREE\.|new THREE|three\.module/i.test(gardenMaterialBlock)) errors.push('Garden3D introduced a second Three.js engine instead of reusing current WebGL');
'''
static = replace_once(static, '  const symmetricPortsStart = html.indexOf(\'const SYMMETRIC_FIELD_PORTS=Object.freeze({\');', garden_checks + "  const symmetricPortsStart = html.indexOf('const SYMMETRIC_FIELD_PORTS=Object.freeze({');", 'static garden contracts')

HTML.write_text(html, encoding='utf-8')
STATIC.write_text(static, encoding='utf-8')
print('Garden3D R2 mutation complete')
