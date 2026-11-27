// 登录 + 用户资料更新
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = (event && event.action) || 'login';
  const payload = (event && event.payload) || {};
  if (!OPENID) {
    return { code: 1001, message: '未登录' };
  }

  if (action === 'updateProfile') {
    const allowed = ['avatar', 'nickname']; // 允许更新的字段白名单
    const data = {};
    allowed.forEach((k) => {
      if (payload[k] !== undefined && payload[k] !== null) data[k] = payload[k];
    });
    if (!Object.keys(data).length) {
      return { code: 400, message: '没有可更新的字段' };
    }
    data.updatedAt = Date.now();
    await db.collection('user').where({ _openid: OPENID }).update({ data });
    const user = await db.collection('user').where({ _openid: OPENID }).limit(1).get();
    return { code: 0, message: 'ok', data: user.data[0] };
  }

  // 默认 login
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
    const user = await users.where({ _openid: OPENID }).limit(1).get();
    return { code: 0, message: 'ok', data: { openid: OPENID, isNewUser, user: user.data[0] || null } };
  } catch (e) {
    return { code: 3001, message: '服务异常: ' + e.message };
  }
};
