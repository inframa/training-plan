const store = require('../../store/store');
const dateUtil = require('../../utils/date');

const DEFAULT_AVATAR = ''; // 未设置时的默认头像，空则显示文字头像

Page({
  data: {
    openid: '',
    avatarUrl: '',
    trainingDays: 0,
    totalVolume: '0',
    syncStatus: '',
    lastLogin: '',
    consentAgreed: false  // 协议同意状态
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

  async refresh() {
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
    const patch = {
      openid: openid || '',
      isLocalUser: store.isTempUser() || (openid ? openid.indexOf('local-') === 0 : false),
      trainingDays,
      totalVolume: totalVol.toLocaleString(),
      syncStatus: store.state.pendingDates ? ('待同步 ' + store.state.pendingDates.length + ' 条') : (store.isTempUser() ? '临时账户（不云端同步）' : '已同步'),
      lastLogin: dateUtil.todayStr(),
      consentAgreed: store.hasAgreedConsent()
    };
    // 读取用户头像
    if (openid && !store.isTempUser() && openid.indexOf('local-') !== 0) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('user').where({ _openid: openid }).limit(1).get();
        if (res.data && res.data[0] && res.data[0].avatar) {
          patch.avatarUrl = res.data[0].avatar;
        }
      } catch (e) { /* 忽略 */ }
    }
    this.setData(patch);
  },

  async onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl;
    if (!tempPath) return;
    const openid = this.data.openid;
    if (!openid || this.data.isLocalUser) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '上传中…' });
    try {
      // 1) 上传到云存储（头像按 openid 覆盖，固定路径）
      const cloudPath = 'user-avatars/' + openid + '.jpg';
      const upRes = await wx.cloud.uploadFile({ cloudPath, filePath: tempPath });
      const fileID = upRes.fileID;
      // 2) 通过 login 云函数更新 user 集合（走云函数绕过安全规则）
      const callRes = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'updateProfile', payload: { avatar: fileID } }
      });
      if (!callRes.result || callRes.result.code !== 0) {
        throw new Error(callRes.result && callRes.result.message || '更新失败');
      }
      // 3) 本地刷新
      this.setData({ avatarUrl: fileID });
      wx.hideLoading();
      wx.showToast({ title: '头像已更新', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      console.error('头像上传失败:', e);
      wx.showToast({ title: '上传失败: ' + (e.errMsg || e.message || ''), icon: 'none' });
    }
  },

  onCopyOpenid() {
    if (!this.data.openid || this.data.isLocalUser) {
      wx.showToast({ title: this.data.isLocalUser ? '本地临时用户无 openid' : '暂无 openid', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.openid,
      success: () => wx.showToast({ title: 'openid 已复制', icon: 'none' })
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

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  // 彩蛋：连续点版本号 7 次进入管理后台（无弹窗提示）
  _aboutTaps: 0,
  _aboutTimer: null,
  onAbout() {
    this._aboutTaps++;
    if (this._aboutTimer) clearTimeout(this._aboutTimer);
    this._aboutTimer = setTimeout(() => { this._aboutTaps = 0; }, 2000);
    if (this._aboutTaps >= 7) {
      this._aboutTaps = 0;
      wx.navigateTo({ url: '/pages/admin/admin' });
    }
  },

  // ---------- 协议入口 ----------
  onViewTerms() {
    wx.navigateTo({ url: '/pages/terms/terms' });
  },

  onViewPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy' });
  },

  onReshowConsent() {
    if (this.data.consentAgreed) {
      wx.showModal({
        title: '已同意协议',
        content: '您已同意过协议。如需重新同意或撤回，请清除本地缓存后重新启动小程序。',
        showCancel: false,
        confirmText: '知道了'
      });
    }
  },

  // 手动登录：已同意协议但仍为本地临时用户时使用
  async onManualLogin() {
    if (!this.data.consentAgreed) {
      wx.showToast({ title: '请先在首页同意协议', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '登录中…' });
    const ok = await store.loginAfterConsent();
    wx.hideLoading();
    if (ok) {
      wx.showToast({ title: '登录成功', icon: 'success' });
      this.refresh();
    } else {
      wx.showToast({ title: '登录失败，请检查网络', icon: 'none' });
    }
  }
});
