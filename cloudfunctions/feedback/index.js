// 反馈云函数：submit(提交) / list(我的) / listAll(管理) / markResolved(标记) / delete(删除)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 管理员 openid 白名单 —— 部署后把你的 openid 加进来
const ADMIN_OPENIDS = [
  // 例如：'oXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
];

function isAdmin(openid) {
  return ADMIN_OPENIDS.indexOf(openid) >= 0;
}

async function submit(openid, data) {
  const content = (data.content || '').trim();
  const contact = (data.contact || '').trim();
  const type = data.type || 'other';
  if (!content) return { code: 400, message: '反馈内容不能为空' };
  if (content.length > 1000) return { code: 400, message: '内容过长（最多1000字）' };
  const r = await db.collection('feedback').add({
    data: {
      _openid: openid,
      type,
      content,
      contact,
      status: 'pending', // pending / resolved
      createdAt: Date.now(),
      resolvedAt: null
    }
  });
  return { code: 0, message: 'ok', data: { id: r._id } };
}

async function listMine(openid) {
  const res = await db.collection('feedback')
    .where({ _openid: openid })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return { code: 0, message: 'ok', data: res.data };
}

async function listAll(openid, data) {
  if (!isAdmin(openid)) return { code: 403, message: '无权限' };
  const status = data && data.status;
  let query = {};
  if (status) query.status = status;
  const limit = Math.min(200, (data && data.limit) || 50);
  const res = await db.collection('feedback')
    .where(query)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  // 额外补充用户信息（openid 掩码）
  const list = res.data.map((item) => ({
    ...item,
    openidMask: item._openid ? item._openid.slice(0, 6) + '…' + item._openid.slice(-4) : ''
  }));
  return { code: 0, message: 'ok', data: list };
}

async function markResolved(openid, data) {
  if (!isAdmin(openid)) return { code: 403, message: '无权限' };
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  const status = data.status === 'pending' ? 'resolved' : 'pending';
  await db.collection('feedback').doc(data.id).update({
    data: { status, resolvedAt: status === 'resolved' ? Date.now() : null }
  });
  return { code: 0, message: 'ok', data: { status } };
}

async function del(openid, data) {
  if (!isAdmin(openid)) return { code: 403, message: '无权限' };
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  await db.collection('feedback').doc(data.id).remove();
  return { code: 0, message: 'ok' };
}

async function checkAdmin(openid) {
  return { code: 0, message: 'ok', data: { isAdmin: isAdmin(openid) } };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 1001, message: '未登录' };
  try {
    const action = event.action || event.type || '';
    const payload = event.payload || event.data || {};
    switch (action) {
      case 'submit': return submit(OPENID, payload);
      case 'list': return listMine(OPENID);
      case 'listAll': return listAll(OPENID, payload);
      case 'markResolved': return markResolved(OPENID, payload);
      case 'delete': return del(OPENID, payload);
      case 'checkAdmin': return checkAdmin(OPENID);
      default: return { code: 404, message: '未知 action: ' + action };
    }
  } catch (e) {
    console.error('feedback error:', e);
    return { code: 3001, message: '服务异常: ' + e.message };
  }
};
