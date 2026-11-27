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
    });
    // 未同意协议 → 临时账户（仅本地）；已同意 → 正常云登录
    store.init().catch((err) => console.error('store.init 异常:', err));
    wx.onNetworkStatusChange((res) => {
      if (res.isConnected && store.isReady() && !store.isTempUser()) {
        store.retryAll('network');
      }
    });
  }
});
