import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LEGACY_ONCLICK = "$('#readyPlan').onclick=()=>{commitPlans().catch(e=>console.error(e))};";
const COMMIT_EXPORT = 'globalThis.GAMEROAD_READY_PLAN_COMMIT=commitPlans;';
const MODULE_ID = 'gameroad-ui-feedback-ready-plan-production-r9';

const exactReplacements = [
  [
    'async function commitPlans(){const m=state.match;if(m.busy)return;',
    'async function commitPlans(){const m=state.match;if(m.busy)return false;',
  ],
  [
    "if(!me.plan?.roadId||!me.plan?.battleId){toast('ロードカードとバトルカードを選択してください');return}",
    "if(!me.plan?.roadId||!me.plan?.battleId){toast('ロードカードとバトルカードを選択してください');return false}",
  ],
  [
    "if(me.plan.roadId===me.plan.battleId){toast('別の札を選択してください');return}",
    "if(me.plan.roadId===me.plan.battleId){toast('別の札を選択してください');return false}",
  ],
  [
    "if(path.length-1>normalMoveLimitForRoad(me.plan.roadId)){toast('通常移動可能歩数を超えています');return}",
    "if(path.length-1>normalMoveLimitForRoad(me.plan.roadId)){toast('通常移動可能歩数を超えています');return false}",
  ],
  [
    "if(!neighbors(path[i-1],me).includes(path[i])||path.slice(0,i).includes(path[i])){toast('経路が連続していません');return}",
    "if(!neighbors(path[i-1],me).includes(path[i])||path.slice(0,i).includes(path[i])){toast('経路が連続していません');return false}",
  ],
  [
    'if(!act.human){autoTarget(act);await resolveBattle()}}catch(e){',
    'if(!act.human){autoTarget(act);await resolveBattle()}return true}catch(e){',
  ],
];

const mountMarkup = `
<script type="module" id="${MODULE_ID}">
import { createReadyPlanFeedbackAdapter, bindReadyPlanFeedbackControl } from "./ui-state-feedback-ready-plan-adapter.mjs";

const target = document.getElementById("readyPlan");
const commit = globalThis.GAMEROAD_READY_PLAN_COMMIT;
if (!target) throw new Error("UI_FEEDBACK_READY_PLAN_TARGET_MISSING");
if (typeof commit !== "function") throw new Error("UI_FEEDBACK_READY_PLAN_COMMIT_MISSING");

let operationSequence = 0;
let binding = null;
const adapter = createReadyPlanFeedbackAdapter({
  config: { holdMs: 500, moveCancelDistance: 20, rightSwipeDistance: 45 },
  commit(command) {
    Promise.resolve()
      .then(() => commit())
      .then((accepted) => binding.acknowledge({
        operationToken: command.operationToken,
        accepted: accepted === true,
        reason: accepted === true ? "ready_plan_commit_applied" : "ready_plan_commit_rejected",
      }))
      .catch((error) => {
        try {
          binding.acknowledge({
            operationToken: command.operationToken,
            accepted: false,
            reason: "ready_plan_commit_error",
          });
        } catch (ackError) {
          console.error(ackError);
        }
        console.error(error);
      });
    return command.operationToken;
  },
  reducedMotion: Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches),
  lowPerf: document.body.classList.contains("lowPerf"),
});

const render = (feedback) => {
  target.dataset.uiFeedback = feedback.feedback;
  target.dataset.uiFeedbackReason = feedback.reason;
  target.setAttribute("aria-busy", feedback.pending ? "true" : "false");
};

binding = bindReadyPlanFeedbackControl({
  target,
  adapter,
  operationTokenFactory: () => \`ready-plan:\${++operationSequence}\`,
  render,
});

globalThis.GAMEROAD_READY_PLAN_FEEDBACK_BINDING = binding;
globalThis.addEventListener("pagehide", () => binding.destroy(), { once: true });
</script>`;

function countOf(source, token) {
  return source.split(token).length - 1;
}

function requireCount(source, token, expected, label = token) {
  const actual = countOf(source, token);
  if (actual !== expected) {
    throw new Error(`UI_FEEDBACK_R9_ANCHOR_COUNT ${label}: expected=${expected} actual=${actual}`);
  }
}

function replaceExactlyOnce(source, from, to, label) {
  requireCount(source, from, 1, label);
  return source.replace(from, to);
}

export function transformReadyPlanProductionHtml(source) {
  if (typeof source !== 'string' || source.length === 0) throw new Error('UI_FEEDBACK_R9_SOURCE_REQUIRED');
  requireCount(source, LEGACY_ONCLICK, 1, 'legacy-readyPlan-onclick');
  requireCount(source, COMMIT_EXPORT, 0, 'commit-export-precondition');
  requireCount(source, MODULE_ID, 0, 'module-marker-precondition');
  requireCount(source, '</body>', 1, 'body-close');

  let next = source;
  for (const [from, to] of exactReplacements) {
    next = replaceExactlyOnce(next, from, to, from.slice(0, 80));
  }
  next = replaceExactlyOnce(next, LEGACY_ONCLICK, COMMIT_EXPORT, 'legacy-readyPlan-onclick');
  next = replaceExactlyOnce(next, '</body>', `${mountMarkup}\n</body>`, 'body-close');

  requireCount(next, LEGACY_ONCLICK, 0, 'legacy-readyPlan-onclick-post');
  requireCount(next, COMMIT_EXPORT, 1, 'commit-export-post');
  requireCount(next, MODULE_ID, 1, 'module-marker-post');
  requireCount(next, 'bindReadyPlanFeedbackControl({', 1, 'binder-mount-post');
  requireCount(next, 'accepted: accepted === true,', 1, 'ack-settle-post');
  requireCount(next, 'return true}catch(e){', 1, 'commit-success-result-post');
  return next;
}

async function main(argv) {
  const path = argv[0] || 'browser/GAMEROAD.html';
  const checkOnly = argv.includes('--check-only');
  const input = await readFile(path, 'utf8');
  const output = transformReadyPlanProductionHtml(input);
  if (checkOnly) {
    process.stdout.write(`UI_FEEDBACK_R9_CHECK_OK path=${path} bytes=${Buffer.byteLength(output)}\n`);
    return;
  }
  await writeFile(path, output, 'utf8');
  process.stdout.write(`UI_FEEDBACK_R9_APPLIED path=${path} bytes=${Buffer.byteLength(output)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
