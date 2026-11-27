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

    // 第一优先级：未同意协议 → 直接弹，不经过 store（最可靠，不依赖 promise 链路）
    if (!store.hasAgreedConsent()) {
      this.setData({ showConsent: true });
      return;
    }

    // 已同意 → 正常初始化
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

  // ---------- 协议同意（强制模式）----------
  async onAgreeConsent() {
    store.markAgreedConsent();
    this.setData({ showConsent: false });
    wx.showLoading({ title: '注册登录中…' });
    // 清除 init 缓存，让 store 重新走云登录流程
    store.resetForConsent();
    try {
      await store.ready();
      wx.hideLoading();
      wx.showToast({ title: '注册成功！', icon: 'success' });
      this.refreshMarks();
      this.fetchMonth();
    } catch (e) {
      wx.hideLoading();
      wx.showModal({
        title: '登录失败',
        content: '网络异常导致无法完成注册，请检查网络后重新打开小程序。',
        showCancel: false,
        confirmText: '退出'
      });
    }
  },

  onDisagreeConsent() {
    wx.showModal({
      title: '退出小程序',
      content: '不同意协议将无法使用本小程序。您可以查看协议内容后再做决定，或直接退出。',
      confirmText: '退出小程序',
      cancelText: '再看看',
      success: (res) => {
        if (res.confirm) {
          // 用户确认退出
          wx.exitMiniProgram({ fail: () => { /* 兜底 */ } });
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
