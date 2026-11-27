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

    // store.init() 不管同意与否都会成功（同意=正式用户, 不同意=临时账户）
    store.ready().then(() => {
      this.refreshMarks();
      this.fetchMonth();
    });

    // 未同意协议 → 弹提示窗，告知临时账户模式（用户可随时回来同意注册）
    if (!store.hasAgreedConsent()) {
      this.setData({ showConsent: true });
    }
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

  // 拉取云端当月数据合并（临时账户跳过）
  async fetchMonth() {
    if (store.isTempUser()) return; // 临时账户不读云端
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
    // 临时账户模式：关闭弹窗，允许继续使用（仅本地存储）
    this.setData({ showConsent: false });
    wx.showToast({ title: '当前为临时账户，数据仅存本地', icon: 'none', duration: 2000 });
  },

  onViewTerms() {
    wx.navigateTo({ url: '/pages/terms/terms' });
  },

  onViewPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  }
});
