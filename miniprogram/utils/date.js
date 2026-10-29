// 日期工具：全部使用本地时区 yyyy-MM-dd 字符串
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function fmtDate(y, m, d) {
  return y + '-' + pad(m) + '-' + pad(d);
}

function todayStr() {
  const t = new Date();
  return fmtDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function parseDate(str) {
  const parts = (str || '').split('-').map(Number);
  return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function isFutureDate(str) {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  return parseDate(str).getTime() > today;
}

function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// 月份标题：2026年10月
function monthTitle(year, month) {
  return year + '年' + month + '月';
}

// 月历格子（周一为首），含前后月补位，总长为 7 的倍数
function monthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const lead = (first.getDay() + 6) % 7; // 0 = 周一
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells = [];
  for (let i = lead - 1; i >= 0; i--) {
    cells.push({ date: fmtDate(prevYear, prevMonth, prevDays - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: fmtDate(year, month, d), inMonth: true });
  }
  let next = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push({ date: fmtDate(nextYear, nextMonth, next), inMonth: false });
    next++;
  }
  return cells;
}

function weekDayCN(str) {
  return '日一二三四五六'[parseDate(str).getDay()];
}

module.exports = {
  pad,
  fmtDate,
  todayStr,
  parseDate,
  isFutureDate,
  addDays,
  monthTitle,
  monthGrid,
  weekDayCN
};
