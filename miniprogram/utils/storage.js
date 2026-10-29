// 本地缓存封装：key 统一由调用方传入（含 openid 前缀由 store 处理）
function get(key, def) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? def : v;
  } catch (e) {
    return def;
  }
}

function set(key, val) {
  try {
    wx.setStorageSync(key, val);
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) {
    /* ignore */
  }
}

function allKeys() {
  try {
    return wx.getStorageInfoSync().keys || [];
  } catch (e) {
    return [];
  }
}

module.exports = { get, set, remove, allKeys };
