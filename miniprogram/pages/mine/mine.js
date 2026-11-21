const store = require('../../store/store');
const dateUtil = require('../../utils/date');

Page({
  data: {
    openid: '',
    trainingDays: 0,
    totalVolume: '0',
    syncStatus: '',
    lastLogin: ''
  },
  unsub: null,

  onLoad() {
    this.unsub = store.subscribe(() => this.refresh());
    store.ready().then(() => this.refresh());
  },

  onUnload() {
    if (this.unsub) this.unsub();
  },

  onShow() {
    if (store.isReady()) this.refresh();
  },

  refresh() {
    const openid = store.getOpenid();
    // 累计训练天数：遍历 monthMarks
    const marks = store.state.monthMarks || {};
    let trainingDays = 0;
    let totalVol = 0;
    Object.keys(marks).forEach((ym) => {
      Object.keys(marks[ym]).forEach((d) => {
        const m = marks[ym][d];
        if (m && m.status === 'trained') trainingDays++;
        if (m && m.volume) totalVol += Number(m.volume) || 0;
      });
    });
    this.setData({
      openid: openid ? (openid.indexOf('local-') === 0 ? '本地临时用户' : openid.slice(0, 12) + '…') : '',
      trainingDays,
      totalVolume: totalVol.toLocaleString(),
      syncStatus: store.state.pendingDates ? ('待同步 ' + store.state.pendingDates.length + ' 条') : '已同步',
      lastLogin: dateUtil.todayStr()
    });
  },

  onManagePartTree() {
    wx.navigateTo({ url: '/pages/actionLibrary/actionLibrary' });
  },

  onRetrySync() {
    store.retryAll();
    wx.showToast({ title: '同步中…', icon: 'none' });
  },

  onClearCache() {
    wx.showModal({
      title: '清除本地缓存',
      content: '仅清除本地待同步队列，不影响云端已保存的数据。确定？',
      confirmColor: '#E5484D',
      success: (res) => {
        if (!res.confirm) return;
        try {
          wx.clearStorageSync();
          wx.showToast({ title: '已清除，请重启小程序', icon: 'none' });
        } catch (e) {
          wx.showToast({ title: '清除失败', icon: 'none' });
        }
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于',
      content: '健身容量记录 v1.0\n本地优先 · 自动同步\n\n训练日历、容量追踪、动作库、训练计划模板',
      showCancel: false
    });
  }
});
