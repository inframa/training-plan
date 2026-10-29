// 初始化：创建业务集合（首次部署执行一次）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = ['user', 'action', 'dailyRecord', 'dayAction', 'setRecord'];

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
