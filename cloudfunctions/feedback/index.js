// 反馈云函数：submit / list / listAll / markResolved / delete / checkAdmin
// 管理员鉴权：小程序端用 openid 白名单，Web 端用 ADMIN_KEY
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ====== 管理员配置 ======
// 方式 1：小程序端管理员 openid 白名单
const ADMIN_OPENIDS = [
  // 例如：'oXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
];
// 方式 2：Web 端管理台调用密钥（自行生成随机字符串，Web 端和云函数都要配）
const ADMIN_KEY = 'change-me-please-2026';

function isAdmin(openid, key) {
  if (key && key === ADMIN_KEY) return true;
  if (openid && ADMIN_OPENIDS.indexOf(openid) >= 0) return true;
  return false;
}

function requireAdmin(openid, key) {
  if (!isAdmin(openid, key)) return { code: 403, message: '无权限' };
  return null;
}

async function submit(openid, data, submitterOverride) {
  const content = (data.content || '').trim();
  const contact = (data.contact || '').trim();
  const type = data.type || 'other';
  if (!content) return { code: 400, message: '反馈内容不能为空' };
  if (content.length > 1000) return { code: 400, message: '内容过长（最多1000字）' };
  // submitter：优先用 Web 端传入的 submitter，否则用 openid
  const submitter = submitterOverride || openid || 'unknown';
  const r = await db.collection('feedback').add({
    data: {
      _openid: openid || '', // 小程序会自动补，Web 端为空
      submitter,
      type,
      content,
      contact,
      status: 'pending',
      createdAt: Date.now(),
      resolvedAt: null
    }
  });
  return { code: 0, message: 'ok', data: { id: r._id } };
}

async function listMine(openid, submitterOverride) {
  const submitter = submitterOverride || openid;
  if (!submitter) return { code: 0, message: 'ok', data: [] };
  const res = await db.collection('feedback')
    .where({ submitter })
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return { code: 0, message: 'ok', data: res.data };
}

async function listAll(data, key) {
  const denied = requireAdmin(null, key);
  if (denied) return denied;
  const status = data && data.status;
  let query = {};
  if (status) query.status = status;
  const limit = Math.min(500, (data && data.limit) || 100);
  const res = await db.collection('feedback')
    .where(query)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  const list = res.data.map((item) => ({
    ...item,
    openidMask: item.submitter
      ? item.submitter.slice(0, 6) + '…' + item.submitter.slice(-4)
      : (item._openid ? item._openid.slice(0, 6) + '…' + item._openid.slice(-4) : '')
  }));
  return { code: 0, message: 'ok', data: list };
}

async function markResolved(data, key) {
  const denied = requireAdmin(null, key);
  if (denied) return denied;
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  const status = data.status === 'pending' ? 'resolved' : 'pending';
  await db.collection('feedback').doc(data.id).update({
    data: { status, resolvedAt: status === 'resolved' ? Date.now() : null }
  });
  return { code: 0, message: 'ok', data: { status } };
}

async function del(data, key) {
  const denied = requireAdmin(null, key);
  if (denied) return denied;
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  await db.collection('feedback').doc(data.id).remove();
  return { code: 0, message: 'ok' };
}

async function checkAdmin(openid, key) {
  return { code: 0, message: 'ok', data: { isAdmin: isAdmin(openid, key) } };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || event.type || '';
  const payload = event.payload || event.data || {};
  const adminKey = payload.adminKey || event.adminKey || '';

  // 不需要登录的 action
  if (action === 'checkAdmin') return checkAdmin(OPENID, adminKey);

  // submit / list 允许 Web 端无 openid 调用（通过 submitter 字段）
  if (!OPENID && !payload.submitter && !adminKey && action !== 'submit' && action !== 'list') {
    return { code: 1001, message: '未登录' };
  }

  try {
    switch (action) {
      case 'submit': return submit(OPENID, payload, payload.submitter);
      case 'list': return listMine(OPENID, payload.submitter);
      case 'listAll': return listAll(payload, adminKey);
      case 'markResolved': return markResolved(payload, adminKey);
      case 'delete': return del(payload, adminKey);
      default: return { code: 404, message: '未知 action: ' + action };
    }
  } catch (e) {
    console.error('feedback error:', e);
    return { code: 3001, message: '服务异常: ' + e.message };
  }
};
