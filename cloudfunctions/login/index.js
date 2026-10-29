// 登录：云函数自动获取 openid，创建/更新用户
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: 1001, message: '未登录' };
  }
  try {
    const users = db.collection('user');
    const exist = await users.where({ _openid: OPENID }).count();
    let isNewUser = false;
    if (exist.total === 0) {
      await users.add({ data: { _openid: OPENID, createdAt: Date.now(), lastSyncAt: Date.now() } });
      isNewUser = true;
    } else {
      await users.where({ _openid: OPENID }).update({ data: { lastSyncAt: Date.now() } });
    }
    return { code: 0, message: 'ok', data: { openid: OPENID, isNewUser } };
  } catch (e) {
    return { code: 3001, message: '服务异常: ' + e.message };
  }
};
