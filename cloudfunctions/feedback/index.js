// 反馈云函数：submit / list / listAll / markResolved / delete / checkAdmin / reply / stats / listAdmins / addAdmin / removeAdmin
// 管理员鉴权（三级）：
//   1) ADMIN_KEY 匹配 → 直接通过（Web 端管理台 + 小程序彩蛋通用）
//   2) 查 admins 集合 → openid 在列表里 → 通过
//   3) admins 集合为空/不存在 → 默认所有人都是管理员（首次部署场景）
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const ADMIN_KEY = 'change-me-please-2026';

// ---- 管理员 openid 缓存（60s TTL）----
let ADMIN_CACHE = null;
let CACHE_TS = 0;
const CACHE_TTL = 60000; // 60 秒

async function getAdminOpenids() {
  const now = Date.now();
  if (ADMIN_CACHE !== null && (now - CACHE_TS) < CACHE_TTL) return ADMIN_CACHE;
  try {
    const res = await db.collection('admins').limit(100).get();
    ADMIN_CACHE = res.data.map(a => a.openid).filter(Boolean);
    CACHE_TS = now;
  } catch (e) {
    // 集合不存在或查询失败 → 返回空列表（将触发"默认所有人都是管理员"逻辑）
    ADMIN_CACHE = [];
    CACHE_TS = now;
  }
  return ADMIN_CACHE;
}

function invalidateAdminCache() {
  ADMIN_CACHE = null;
  CACHE_TS = 0;
}

async function isAdmin(openid, key) {
  // 1) ADMIN_KEY 始终有效
  if (key && key === ADMIN_KEY) return true;
  if (!openid) return false;
  // 2) 查 admins 集合
  const list = await getAdminOpenids();
  // 3) 集合为空/不存在 → 默认所有人都是管理员（首次部署）
  if (list.length === 0) return true;
  // 4) 集合有内容 → 白名单模式
  return list.indexOf(openid) >= 0;
}

async function requireAdmin(openid, key) {
  if (!(await isAdmin(openid, key))) return { code: 403, message: '无权限' };
  return null;
}

// ==================== 反馈 CRUD ====================

async function submit(openid, data, submitterOverride) {
  const content = (data.content || '').trim();
  const contact = (data.contact || '').trim();
  const type = data.type || 'other';
  if (!content) return { code: 400, message: '反馈内容不能为空' };
  if (content.length > 1000) return { code: 400, message: '内容过长（最多1000字）' };
  const submitter = submitterOverride || openid || 'unknown';
  const r = await db.collection('feedback').add({
    data: {
      _openid: openid || '',
      submitter,
      type,
      content,
      contact,
      status: 'pending',
      createdAt: Date.now(),
      resolvedAt: null,
      adminReply: '',
      repliedAt: null
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

async function listAll(openid, data, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  const status = data && data.status;
  const type = data && data.type;
  const keyword = data && data.keyword;
  let query = {};
  if (status) query.status = status;
  if (type) query.type = type;
  if (keyword) query.content = db.RegExp({ regexp: keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), options: 'i' });
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

async function markResolved(openid, data, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  const status = data.status === 'pending' ? 'resolved' : 'pending';
  const updateData = { status, resolvedAt: status === 'resolved' ? Date.now() : null };
  // 如果标记已处理但还没有回复，自动补一条默认回复
  if (status === 'resolved' && !data.skipAutoReply) {
    const cur = await db.collection('feedback').doc(data.id).get().catch(() => null);
    if (cur && cur.data && !cur.data.adminReply) {
      updateData.adminReply = '感谢你的反馈，已处理！';
      updateData.repliedAt = Date.now();
    }
  }
  await db.collection('feedback').doc(data.id).update({ data: updateData });
  return { code: 0, message: 'ok', data: { status } };
}

async function reply(openid, data, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  const replyText = (data.reply || '').trim();
  if (!replyText) return { code: 400, message: '回复内容不能为空' };
  if (replyText.length > 500) return { code: 400, message: '回复过长（最多500字）' };
  await db.collection('feedback').doc(data.id).update({
    data: {
      adminReply: replyText,
      repliedAt: Date.now(),
      // 有回复自动标记已处理
      status: 'resolved',
      resolvedAt: Date.now()
    }
  });
  return { code: 0, message: 'ok' };
}

async function del(openid, data, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  if (!data || !data.id) return { code: 400, message: '缺少 id' };
  await db.collection('feedback').doc(data.id).remove();
  return { code: 0, message: 'ok' };
}

async function stats(openid, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  const countAll = (await db.collection('feedback').count()).total;
  const countPending = (await db.collection('feedback').where({ status: 'pending' }).count()).total;
  const countResolved = (await db.collection('feedback').where({ status: 'resolved' }).count()).total;
  const types = ['bug', 'feature', 'experience', 'other'];
  const typeStats = {};
  for (const t of types) {
    typeStats[t] = (await db.collection('feedback').where({ type: t }).count()).total;
  }
  return {
    code: 0, message: 'ok',
    data: { total: countAll, pending: countPending, resolved: countResolved, byType: typeStats }
  };
}

// ==================== 管理员管理 ====================

async function checkAdmin(openid, key) {
  return { code: 0, message: 'ok', data: { isAdmin: await isAdmin(openid, key), keyConfigured: true } };
}

async function listAdmins(openid, key) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  const list = await getAdminOpenids();
  // 如果集合为空，返回空列表并标记 isDefaultOpen 说明是"默认所有人管理员"状态
  const isDefaultOpen = list.length === 0;
  return { code: 0, message: 'ok', data: { list, isDefaultOpen } };
}

async function addAdmin(openid, key, targetOpenid, remark) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  if (!targetOpenid || !/^o[a-zA-Z0-9]{10,}$/.test(targetOpenid)) {
    return { code: 400, message: 'openid 格式不正确' };
  }
  // 检查是否已存在
  const exist = await db.collection('admins').where({ openid: targetOpenid }).count();
  if (exist.total > 0) {
    return { code: 400, message: '该用户已是管理员' };
  }
  await db.collection('admins').add({
    data: {
      openid: targetOpenid,
      remark: (remark || '').slice(0, 50),
      addedBy: openid || key ? 'ADMIN_KEY' : 'unknown',
      addedAt: Date.now()
    }
  });
  invalidateAdminCache();
  return { code: 0, message: 'ok' };
}

async function removeAdmin(openid, key, targetOpenid) {
  const denied = await requireAdmin(openid, key);
  if (denied) return denied;
  if (!targetOpenid) return { code: 400, message: '缺少 openid' };
  await db.collection('admins').where({ openid: targetOpenid }).remove();
  invalidateAdminCache();
  return { code: 0, message: 'ok' };
}

// ==================== 入口 ====================

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = event.action || event.type || '';
  const payload = event.payload || event.data || {};
  const adminKey = payload.adminKey || event.adminKey || '';

  // 公共：checkAdmin 免 openid 要求
  if (action === 'checkAdmin') return checkAdmin(OPENID, adminKey);

  if (!OPENID && !payload.submitter && !adminKey && action !== 'submit' && action !== 'list') {
    return { code: 1001, message: '未登录' };
  }

  try {
    switch (action) {
      case 'submit':     return submit(OPENID, payload, payload.submitter);
      case 'list':       return listMine(OPENID, payload.submitter);
      case 'listAll':    return listAll(OPENID, payload, adminKey);
      case 'markResolved': return markResolved(OPENID, payload, adminKey);
      case 'reply':      return reply(OPENID, payload, adminKey);
      case 'delete':     return del(OPENID, payload, adminKey);
      case 'stats':      return stats(OPENID, adminKey);
      case 'listAdmins': return listAdmins(OPENID, adminKey);
      case 'addAdmin':   return addAdmin(OPENID, adminKey, payload.openid, payload.remark);
      case 'removeAdmin': return removeAdmin(OPENID, adminKey, payload.openid);
      default: return { code: 404, message: '未知 action: ' + action };
    }
  } catch (e) {
    console.error('feedback error:', e);
    return { code: 3001, message: '服务异常: ' + e.message };
  }
};
