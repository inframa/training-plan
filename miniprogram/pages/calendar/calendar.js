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
    monthMeta: { trained: 0, untrained: 0 },
    showConsent: false  // 协议同意弹窗
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
      // 检查是否需要展示协议同意弹窗
      if (!store.hasAgreedConsent()) {
        this.setData({ showConsent: true });
      }
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
    let untrained = 0;
    Object.keys(marks).forEach((d) => (marks[d].status === 'trained' ? trained++ : untrained++));
    this.setData({ marks, monthMeta: { trained, untrained } });
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
  },

  // ---------- 协议同意 ----------
  onAgreeConsent() {
    store.markAgreedConsent();
    this.setData({ showConsent: false });
    // 同意后重新走云登录流程，获取正式 openid
    wx.showLoading({ title: '登录中…' });
    store.ready().then(async () => {
      try {
        await store.init(); // init 有缓存，不会重复执行
      } catch (e) { /* ignore */ }
      wx.hideLoading();
      wx.showToast({ title: '欢迎使用！', icon: 'success' });
    });
  },

  onDisagreeConsent() {
    wx.showModal({
      title: '暂不同意',
      content: '不同意协议将无法使用云同步、头像上传等功能，仅可本地使用训练记录。确定继续？',
      confirmText: '继续本地使用',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          this.setData({ showConsent: false });
        }
      }
    });
  },

  onViewTerms() {
    wx.navigateTo({ url: '/pages/terms/terms' });
  },

  onViewPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  }
});
