// 月历格子：状态区分（今天/选中/有记录/草稿/未来）
const { monthGrid, todayStr } = require('../../utils/date');

Component({
  properties: {
    year: { type: Number, value: 0 },
    month: { type: Number, value: 0 },
    marks: { type: Object, value: {} }, // date -> { tags, status }
    selected: { type: String, value: '' },
    today: { type: String, value: '' }
  },
  data: {
    weeks: [],
    WEEK: ['一', '二', '三', '四', '五', '六', '日']
  },
  observers: {
    'year, month, marks, selected, today'() {
      this.rebuild();
    }
  },
  lifetimes: {
    attached() {
      if (!this.data.today) this.setData({ today: todayStr() });
      this.rebuild();
    }
  },
  methods: {
    rebuild() {
      const { year, month, marks = {}, selected = '', today = '' } = this.data;
      if (!year || !month) return;
      const cells = monthGrid(year, month);
      const weeks = [];
      for (let i = 0; i < cells.length; i += 7) {
        weeks.push({
          idx: i,
          cells: cells.slice(i, i + 7).map((c) => {
            const mark = marks[c.date] || null;
            const title = (mark && mark.title) || '';
            const vol = mark && mark.volume ? ' ' + mark.volume : '';
            return {
              date: c.date,
              day: parseInt(c.date.slice(8, 10), 10),
              inMonth: c.inMonth,
              isFuture: today && c.date > today,
              isToday: c.date === today,
              isSelected: c.date === selected,
              hasMark: !!mark && c.inMonth,
              trained: !!mark && mark.status === 'trained',
              info: title || vol ? (title + vol).trim() : ''
            };
          })
        });
      }
      this.setData({ weeks });
    },
    onTap(e) {
      const { date, future } = e.currentTarget.dataset;
      if (future) {
        this.triggerEvent('futuretap', { date });
        return;
      }
      this.triggerEvent('select', { date });
    }
  }
});
