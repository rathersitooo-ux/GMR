# Human Session Recorder R1

## 逶ｮ逧・螳滄圀縺ｮ莠ｺ髢捺桃菴懊ｒ縲∵里蟄賂AMEROAD Battle Replay / Human Player evidence縺ｨ蜷後§sessionId縺ｧ邨仙粋縺吶ｋ縲らｬｬ莠携ameplay authority繧・､夜ΚSaaS菫晏ｭ倥・菴懊ｉ縺ｪ縺・・
## R1蠅・阜
- local-first縲Ｏetwork upload螳溯｣・縲・- pointer/click縲〔ey遞ｮ蛻･縲（nput/change逋ｺ逕溘《creen/action/id縲∵凾蛻ｻ縺縺代ｒ險倬鹸縲・- input蛟､縺ｯ隱ｭ縺ｾ縺ｪ縺・ょ魂蟄励く繝ｼ縺ｯ `Printable` 縺ｫ荳ｸ繧√ｋ縲Ｑassword蛟､縺ｯ菫晏ｭ倥＠縺ｪ縺・・- Battle Replay縺携ame event authority縲Ｓecorder縺ｯ `battleReplayRef` 繧呈戟縺､縺縺代・- Screen video / DOM replay縺ｯ莉ｻ諢渋rtifact縺ｧ縲〉ecorder縺ｫ縺ｯ蜿ら・縺縺大・繧後ｋ縲・- Human acceptance繧・ameplay truth繧定・蜍募愛螳壹＠縺ｪ縺・・
## 譏守､ｺ襍ｷ蜍・served Browser package縺ｫmodule縺悟ｭ伜惠縺吶ｋbuild縺ｧDevTools Console縺九ｉ譏守､ｺ襍ｷ蜍輔☆繧九・
```js
const { mountHumanSessionRecorder } = await import('/browser/human-session-recorder-core.mjs');
const rec = mountHumanSessionRecorder(window, {
  sessionId: crypto.randomUUID(), buildId: 'CURRENT_BUILD_ID', buildHash: 'CURRENT_BUILD_HASH',
  releaseId: 'CURRENT_RELEASE_ID', inputMode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'pointer',
  stateId: 'SESSION_START', versions: { rules: 'CURRENT_RULES', content: 'CURRENT_CONTENT', state: 'CURRENT_STATE' }
});
rec.start();
```

蠢・ｦ√↑繧芽・逕ｱ險倩ｿｰ繧貞・繧後★neutral marker縺縺題ｿｽ蜉縺吶ｋ縲・```js
rec.mark('state', { stateId: 'BATTLE-PLAN', eventId: 'accepted-event-42' });
```
邨ゆｺ・凾:
```js
rec.stop();
rec.exportJson({ battleReplayRef: 'match:<id>', screenVideoRef: 'local:<file>', domReplayRef: 'local:<rrweb-file>' });
```

## 螟夜Κ繝・・繝ｫ蛟呵｣・- **rrweb**: DOM mutation縺ｨuser interaction縺ｮrecord/replay蜷代￠縲ゆｿ晏ｭ伜・繧団aller蛛ｴ縺ｧ驕ｸ縺ｹ縲［ask/block privacy option縺後≠繧九◆繧∝ｰ・擂縺ｮlocal DOM replay蛟呵｣懊・- **Browser Screen Capture + MediaRecorder**: 譁・ｭ鈴壹ｊ縺ｮ逕ｻ髱｢蜍慕判縲よ・遉ｺpermission縺悟ｿ・ｦ√↑縺ｮ縺ｧ閾ｪ蜍戊ｵｷ蜍輔＠縺ｪ縺・・- **OpenReplay**: self-hosted session replay蛟呵｣懊ょ､ｧ驥峻ession讀懃ｴ｢縺悟ｿ・ｦ√↓縺ｪ縺｣縺滓ｮｵ髫弱〒讀懆ｨ弱１rivate Mode縺ｧvisible text/network/console繧痴ource蛛ｴ縺九ｉ髫縺帙ｋ縲・- **PostHog**: 蟆ら畑GAMEROAD project繝ｻretention繝ｻprivacy譁ｹ驥昴′謌千ｫ九＠縺溷ｴ蜷医□縺大呵｣懊ら樟蝨ｨ謗･邯壻ｸｭ縺ｮ辟｡髢｢菫Ｑroject縺ｸ騾√ｉ縺ｪ縺・・
## Human Player workbook
1 recorder export = 1 SessionID縲・SON/video/DOM replay蜿ら・縺ｯ譌｢蟄・Session Evidence 縺ｮ LogRef / VideoRef縺ｸ謗･邯壹＠縲∬ｦｳ蟇滉ｺ句ｮ溘・Human蜴滓枚縺ｯ蠕捺擂field縺ｸ蛻･菫晏ｭ倥☆繧九・
