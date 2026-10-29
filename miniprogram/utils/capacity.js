// 容量计算引擎
// 单组容量 = 重量 × 次数；动作容量 = 已完成组之和；当日容量 = 各动作之和
// 仅"已完成且重量、次数完整"的组参与计算；重量支持最多 2 位小数，次数为正整数

function round2(n) {
  return Math.round(n * 100) / 100;
}

// 输入可能是 string（来自输入框）或 number
function toNum(v) {
  if (v === null || v === undefined || v === '') return NaN;
  return typeof v === 'number' ? v : parseFloat(v);
}

function setVolume(set) {
  if (!set || !set.done) return 0;
  const w = toNum(set.weight);
  const r = toNum(set.reps);
  if (!(w > 0) || !(r > 0)) return 0;
  return round2(w * r);
}

function actionVolume(action) {
  if (!action) return 0;
  const sets = action.sets || [];
  return round2(sets.reduce((s, x) => s + setVolume(x), 0));
}

function dayVolume(dayActions) {
  return round2((dayActions || []).reduce((s, a) => s + actionVolume(a), 0));
}

function countDoneSets(sets) {
  return (sets || []).filter((s) => s.done).length;
}

// 已完成动作数：至少有一组已完成
function countDoneActions(dayActions) {
  return (dayActions || []).filter((a) => countDoneSets(a.sets) > 0).length;
}

function countTotalSets(dayActions) {
  return (dayActions || []).reduce((s, a) => s + (a.sets || []).length, 0);
}

// 是否存在"已完成但未计入容量"的组（徒手/档位类或重量缺失）
function hasUncounted(dayActions) {
  return (dayActions || []).some(
    (a) => (a.sets || []).some((s) => s.done && setVolume(s) === 0)
  );
}

// 展示格式：整数不带小数，小数最多 2 位
function fmtVol(n) {
  if (!n) return '0';
  const v = round2(n);
  return String(v);
}

module.exports = {
  round2,
  setVolume,
  actionVolume,
  dayVolume,
  countDoneSets,
  countDoneActions,
  countTotalSets,
  hasUncounted,
  fmtVol
};
