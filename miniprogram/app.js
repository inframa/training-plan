// app.js 全局入口：云开发初始化、登录、离线同步监听
const store = require('./store/store');

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      traceUser: true
      // 不传 env 时使用默认云环境；如有多环境需求，在此填入环境 ID
    });
    // 登录 + 本地缓存恢复 + 待同步数据重试
    store.init();
    // 网络恢复时自动重试未同步数据（整日记录按日期增量推送）
    wx.onNetworkStatusChange((res) => {
      if (res.isConnected) store.retryAll('network');
    });
  }
});
