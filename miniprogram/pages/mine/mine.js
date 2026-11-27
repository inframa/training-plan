const store = require('../../store/store');
const dateUtil = require('../../utils/date');

const DEFAULT_AVATAR = ''; // 未设置时的默认头像，空则显示文字头像

Page({
  data: {
    openid: '',
    avatarUrl: '',
    nickname: '',        // 微信昵称（input type=nickname 自动填充）
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
    // 读取用户资料（头像 + 昵称）
    if (openid && !store.isTempUser() && openid.indexOf('local-') !== 0) {
      try {
        const db = wx.cloud.database();
        const res = await db.collection('user').where({ _openid: openid }).limit(1).get();
        if (res.data && res.data[0]) {
          if (res.data[0].avatar) patch.avatarUrl = res.data[0].avatar;
          if (res.data[0].nickname) patch.nickname = res.data[0].nickname;
        }
      } catch (e) { /* 忽略 */ }
    }
    // 临时用户：从本地 storage 读取昵称（纯本地保存）
    if (!patch.nickname) {
      const local = wx.getStorageSync('local_nickname');
      if (local) patch.nickname = local;
    }
    this.setData(patch);
  },

  // 昵称输入：临时用户存本地，已登录用户存云端
  onNicknameInput(e) {
    const val = (e.detail.value || '').trim();
    if (!val) return;
    this.setData({ nickname: val });
    if (this.data.isLocalUser || store.isTempUser()) {
      // 临时用户 → 仅本地保存
      wx.setStorageSync('local_nickname', val);
    } else {
      // 已登录 → 云端保存
      wx.cloud.callFunction({
        name: 'login',
        data: { action: 'updateProfile', payload: { nickname: val } }
      }).catch(() => {}); // 静默失败，下次重试
    }
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
        content: '您已同意过协议。撤回后下次打开小程序将重新弹出同意窗口，且不会以正式身份登录。确定撤回吗？',
        confirmText: '撤回同意',
        confirmColor: '#e64340',
        cancelText: '再想想',
        success: (res) => {
          if (res.confirm) {
            wx.removeStorageSync('consent_agreed');
            this.setData({ consentAgreed: false });
            wx.showToast({ title: '已撤回，重启生效', icon: 'none', duration: 2000 });
          }
        }
      });
    } else {
      wx.showModal({
        title: '尚未同意',
        content: '您尚未同意用户服务协议和隐私政策。请返回首页完成同意后即可正常使用。',
        showCancel: false,
        confirmText: '好的'
      });
    }
  },

  // 主动登录：未同意协议 → 先弹协议同意框 → 同意后走注册；已同意 → 直接走云登录
  async onManualLogin() {
    if (!store.hasAgreedConsent()) {
      // 未同意 → 引导同意
      wx.showModal({
        title: '请先同意协议',
        content: '使用完整功能需要同意《用户服务协议》和《隐私政策》。同意后将自动为您注册账号。',
        confirmText: '同意并登录',
        confirmColor: '#07c160',
        cancelText: '不同意',
        success: async (res) => {
          if (!res.confirm) {
            wx.showToast({ title: '您仍可匿名使用', icon: 'none' });
            return;
          }
          store.markAgreedConsent();
          this.setData({ consentAgreed: true });
          await this._doLoginAfterAgree();
        }
      });
    } else {
      await this._doLoginAfterAgree();
    }
  },

  // 内部：同意后实际执行云登录 + 迁移本地昵称到云端
  async _doLoginAfterAgree() {
    wx.showLoading({ title: '注册登录中…' });
    store.resetForConsent();
    try {
      await store.ready();
      wx.hideLoading();
      if (store.isTempUser()) {
        wx.showToast({ title: '网络异常，暂以访客模式使用', icon: 'none', duration: 2500 });
        return;
      }
      // 登录成功 → 把之前本地保存的昵称迁移到云端
      const localNickname = wx.getStorageSync('local_nickname');
      if (localNickname) {
        this.setData({ nickname: localNickname });
        wx.cloud.callFunction({
          name: 'login',
          data: { action: 'updateProfile', payload: { nickname: localNickname } }
        }).then(() => wx.removeStorageSync('local_nickname')).catch(() => {});
      }
      wx.showToast({ title: '登录成功！', icon: 'success' });
      this.refresh();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '登录失败，请检查网络', icon: 'none' });
    }
  }
});
