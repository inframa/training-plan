// 初始化：创建业务集合（首次部署执行一次）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  'user', 'action', 'dailyRecord', 'dayAction', 'setRecord',
  'feedback',  // 用户反馈
  'admins'     // 管理员 openid 白名单（为空时默认所有人都是管理员）
];

exports.main = async () => {
  const results = {};
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      // -501001 资源已存在
      results[name] = /exists|-501001/i.test(e.errCode + e.message) ? 'exists' : 'error: ' + e.message;
    }
  }
  return { code: 0, message: 'ok', data: results };
};
