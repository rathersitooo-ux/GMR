import { normalizeBrainTrainingExerciseBank } from './brain-training-core.mjs';
import { LEARNING_SUBJECTS } from './learning-event-core.mjs';

export const BRAIN_TRAINING_EXERCISE_BANK_VERSION = 'gameroad.brain-training-bank.v1';

const SOURCE = Object.freeze({
  sourceId: 'gameroad_brain_training_authored',
  sourceVersion: 'v1.20260830',
  provenance: 'gameroad_authored',
});

const option = (id, label) => ({ id, label });
const source = () => ({ ...SOURCE });

const RAW_EXERCISES = [
  {
    id: 'brain_v1_math_identify_01',
    subject: LEARNING_SUBJECTS.MATH_LOGIC,
    cognitiveAxis: 'identify',
    prompt: '4・8・12・15 の中で、4の倍数ではないものはどれ？',
    options: [option('a', '4'), option('b', '8'), option('c', '12'), option('d', '15')],
    correctOptionId: 'd',
    source: source(),
  },
  {
    id: 'brain_v1_math_compute_01',
    subject: LEARNING_SUBJECTS.MATH_LOGIC,
    cognitiveAxis: 'compute',
    prompt: '7 + 6 × 2 はいくつ？',
    options: [option('a', '19'), option('b', '26'), option('c', '20'), option('d', '14')],
    correctOptionId: 'a',
    source: source(),
  },
  {
    id: 'brain_v1_strategy_analyze_01',
    subject: LEARNING_SUBJECTS.STRATEGY_DECISION,
    cognitiveAxis: 'analyze',
    prompt: 'CはAより先、AはBより先に動く。3人の中で最初に動くのは？',
    options: [option('a', 'A'), option('b', 'B'), option('c', 'C'), option('d', '決められない')],
    correctOptionId: 'c',
    source: source(),
  },
  {
    id: 'brain_v1_strategy_visualize_01',
    subject: LEARNING_SUBJECTS.STRATEGY_DECISION,
    cognitiveAxis: 'visualize',
    prompt: '北を向いている。右、右、左の順に90度ずつ回った。最後に向いている方角は？',
    options: [option('a', '北'), option('b', '東'), option('c', '南'), option('d', '西')],
    correctOptionId: 'b',
    source: source(),
  },
  {
    id: 'brain_v1_language_memorize_01',
    subject: LEARNING_SUBJECTS.LANGUAGE_COMMUNICATION,
    cognitiveAxis: 'memorize',
    prompt: '対応を覚える：ルナ=鍵、ソル=森、ナキ=星。ソルに対応するものは？',
    options: [option('a', '鍵'), option('b', '森'), option('c', '星'), option('d', '船')],
    correctOptionId: 'b',
    source: source(),
  },
  {
    id: 'brain_v1_language_identify_01',
    subject: LEARNING_SUBJECTS.LANGUAGE_COMMUNICATION,
    cognitiveAxis: 'identify',
    prompt: '「猫は静かに眠る。」で、動作を表す語はどれ？',
    options: [option('a', '猫'), option('b', 'は'), option('c', '静かに'), option('d', '眠る')],
    correctOptionId: 'd',
    source: source(),
  },
  {
    id: 'brain_v1_science_analyze_01',
    subject: LEARNING_SUBJECTS.NATURAL_SCIENCE,
    cognitiveAxis: 'analyze',
    prompt: '同じ種類の植物を2鉢用意し、水の量は同じにして、光の量だけ変えた。比較している条件は？',
    options: [option('a', '植物の種類'), option('b', '水の量'), option('c', '光の量'), option('d', '鉢の数')],
    correctOptionId: 'c',
    source: source(),
  },
  {
    id: 'brain_v1_science_compute_01',
    subject: LEARNING_SUBJECTS.NATURAL_SCIENCE,
    cognitiveAxis: 'compute',
    prompt: '0秒、10秒、20秒、30秒と同じ間隔で4回観察した。観察間隔は何秒？',
    options: [option('a', '5秒'), option('b', '10秒'), option('c', '20秒'), option('d', '30秒')],
    correctOptionId: 'b',
    source: source(),
  },
  {
    id: 'brain_v1_life_memorize_01',
    subject: LEARNING_SUBJECTS.LIFE_SCIENCE,
    cognitiveAxis: 'memorize',
    prompt: '手順を覚える：洗う→切る→加熱する→盛り付ける。加熱する直前は？',
    options: [option('a', '洗う'), option('b', '切る'), option('c', '盛り付ける'), option('d', '片付ける')],
    correctOptionId: 'b',
    source: source(),
  },
  {
    id: 'brain_v1_life_analyze_01',
    subject: LEARNING_SUBJECTS.LIFE_SCIENCE,
    cognitiveAxis: 'analyze',
    prompt: '同じ100gで、Aはたんぱく質8g、Bは4gと表示されている。表示値だけを比べると多いのは？',
    options: [option('a', 'A'), option('b', 'B'), option('c', '同じ'), option('d', '表示値からは決められない')],
    correctOptionId: 'a',
    source: source(),
  },
  {
    id: 'brain_v1_creative_visualize_01',
    subject: LEARNING_SUBJECTS.CREATIVE,
    cognitiveAxis: 'visualize',
    prompt: '中央から、上→右→右→下と1マスずつ進む。最後は開始位置から見てどこ？',
    options: [option('a', '左に2マス'), option('b', '右に2マス'), option('c', '上に2マス'), option('d', '開始位置')],
    correctOptionId: 'b',
    source: source(),
  },
  {
    id: 'brain_v1_creative_identify_01',
    subject: LEARNING_SUBJECTS.CREATIVE,
    cognitiveAxis: 'identify',
    prompt: '並び「▲ ● ▲ ● ▲」の規則を続けると、次は？',
    options: [option('a', '▲'), option('b', '●'), option('c', '■'), option('d', '★')],
    correctOptionId: 'b',
    source: source(),
  },
];

export const BRAIN_TRAINING_EXERCISE_BANK = normalizeBrainTrainingExerciseBank(RAW_EXERCISES);

export function getBrainTrainingExerciseBank() {
  return BRAIN_TRAINING_EXERCISE_BANK;
}
