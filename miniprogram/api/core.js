// 云函数调用基础封装
// 统一响应结构 { code, message, data }，code=0 成功
// 网络异常统一映射为 code=4001，由上层进入离线缓存重试

function callCloud(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud
      .callFunction({ name, data })
      .then((r) => {
        const res = r && r.result;
        if (res && res.code === 0) {
          resolve(res.data);
        } else {
          reject({
            code: (res && res.code) || 3001,
            message: (res && res.message) || '服务异常'
          });
        }
      })
      .catch((err) => {
        reject({ code: 4001, message: '网络异常', detail: err });
      });
  });
}

module.exports = { callCloud };
