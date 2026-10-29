// 训练日历：月历渲染、日期状态、标签展示、日期 → 记录页跳转
const store = require('../../store/store');
const api = require('../../api/index');
const dateUtil = require('../../utils/date');

Page({
  data: {
    year: 0,
    month: 0,
    title: '',
    today: '',
    selected: '',
    marks: {},
    monthMeta: { trained: 0, draft: 0 }
  },
  unsub: null,

  onLoad() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      title: dateUtil.monthTitle(now.getFullYear(), now.getMonth() + 1),
      today: dateUtil.todayStr()
    });
    this.unsub = store.subscribe(() => this.refreshMarks());
    store.ready().then(() => {
      this.refreshMarks();
      this.fetchMonth();
    });
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  onShow() {
    this.setData({ today: dateUtil.todayStr() });
    if (store.isReady()) this.refreshMarks();
  },

  refreshMarks() {
    const ym = this.data.year + '-' + dateUtil.pad(this.data.month);
    const marks = store.getMonthMarks(ym);
    let trained = 0;
    let draft = 0;
    Object.keys(marks).forEach((d) => (marks[d].status === 'trained' ? trained++ : draft++));
    this.setData({ marks, monthMeta: { trained, draft } });
  },

  // 拉取云端当月数据合并
  async fetchMonth() {
    const { year, month } = this.data;
    const ym = year + '-' + dateUtil.pad(month);
    try {
      const res = await api.record.month(ym);
      store.mergeCloudMonth(ym, res.days || []);
    } catch (e) {
      // 离线时使用本地缓存
    }
  },

  onPrevMonth() {
    this.stepMonth(-1);
  },
  onNextMonth() {
    this.stepMonth(1);
  },
  stepMonth(n) {
    let { year, month } = this.data;
    month += n;
    if (month < 1) {
      month = 12;
      year--;
    } else if (month > 12) {
      month = 1;
      year++;
    }
    this.setData({ year, month, title: dateUtil.monthTitle(year, month), selected: '' });
    this.refreshMarks();
    this.fetchMonth();
  },

  onGoToday() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      title: dateUtil.monthTitle(now.getFullYear(), now.getMonth() + 1),
      selected: this.data.today
    });
    this.refreshMarks();
    this.fetchMonth();
  },

  // 点击日期：未来日期不可录入；其余进入对应日期记录页
  onSelect(e) {
    const { date } = e.detail;
    this.setData({ selected: date });
    wx.navigateTo({ url: '/pages/trainRecord/trainRecord?date=' + date });
  },

  onFutureTap() {
    wx.showToast({ title: '未来日期暂不支持录入', icon: 'none' });
  }
});
