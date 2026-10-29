// 动作库接口：list / detail / create / update / copy / archive / delete
// 数据按 openid 强制隔离
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const RECORD_TYPES = ['weight_reps', 'reps_only'];

function err(code, message) {
  return { code, message };
}

function ok(data) {
  return { code: 0, message: 'ok', data };
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 白名单字段（器械位置描述/把手连接握持位置已删除；档位×次数记录类型已下线）
function pickActionFields(src) {
  const keys = ['name', 'bodyParts', 'imageFileIds', 'gym', 'handleType', 'defaultSeat', 'otherSettings', 'recordType', 'remark'];
  const out = {};
  keys.forEach((k) => {
    if (src[k] !== undefined) out[k] = src[k];
  });
  return out;
}

function validate(action) {
  if (!action || typeof action.name !== 'string' || !action.name.trim()) return '动作名称必填';
  if (!Array.isArray(action.bodyParts) || !action.bodyParts.length) return '训练部位必填';
  if (RECORD_TYPES.indexOf(action.recordType) < 0) return '记录类型不合法';
  if (action.imageFileIds !== undefined && !Array.isArray(action.imageFileIds)) return '图片字段不合法';
  if (action.imageFileIds && action.imageFileIds.length > 3) return '图片最多 3 张';
  return null;
}

function shape(doc) {
  return { ...doc, id: doc._id };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err(1001, '未登录');
  const col = db.collection('action');
  const { type } = event;

  try {
    // ---- 列表：搜索/筛选/分页，最近使用优先 ----
    if (type === 'list') {
      const where = { _openid: OPENID };
      if (!event.showArchived) where.archived = false;
      if (event.keyword) where.name = db.RegExp({ regexp: escapeReg(event.keyword), options: 'i' });
      if (event.bodyPart) where.bodyParts = event.bodyPart;
      if (event.gym) where.gym = event.gym;
      const page = Math.max(1, parseInt(event.page, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(event.pageSize, 10) || 50));
      const countRes = await col.where(where).count();
      const res = await col
        .where(where)
        .orderBy('lastUsedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      return ok({ list: res.data.map(shape), total: countRes.total });
    }

    // ---- 详情 ----
    if (type === 'detail') {
      if (!event.actionId) return err(2001, '参数错误');
      const res = await col.where({ _id: event.actionId, _openid: OPENID }).get();
      if (!res.data.length) return err(1002, '无权限或不存在');
      return ok(shape(res.data[0]));
    }

    // ---- 新建（客户端生成 _id，保证离线创建幂等）----
    if (type === 'create') {
      const action = event.action || {};
      const invalid = validate(action);
      if (invalid) return err(2001, invalid);
      const now = Date.now();
      const data = {
        ...pickActionFields(action),
        name: action.name.trim(),
        archived: !!action.archived,
        imageFileIds: action.imageFileIds || [],
        lastUsedAt: action.lastUsedAt || now,
        createdAt: now,
        updatedAt: now
      };
      const _id = action.id || undefined;
      if (_id) {
        const exist = await col.where({ _id, _openid: OPENID }).count();
        if (exist.total > 0) return ok({ id: _id }); // 幂等：已存在直接成功
        data._id = _id;
      }
      const addRes = await col.add({ data });
      return ok({ id: _id || addRes._id });
    }

    // ---- 更新（白名单字段；用于编辑动作与"同步默认档位"）----
    if (type === 'update') {
      if (!event.actionId) return err(2001, '参数错误');
      const patch = pickActionFields(event.patch || {});
      if (patch.name !== undefined && !patch.name.trim()) return err(2001, '动作名称必填');
      if (patch.recordType === 'seat_reps') patch.recordType = 'reps_only'; // 旧类型归一
      const res = await col.where({ _id: event.actionId, _openid: OPENID }).update({
        data: { ...patch, updatedAt: Date.now() }
      });
      if (!res.stats.updated) return err(1002, '无权限或不存在');
      return ok({ id: event.actionId });
    }

    // ---- 复制（保留全部器械信息，重名不拦截）----
    if (type === 'copy') {
      if (!event.actionId) return err(2001, '参数错误');
      const res = await col.where({ _id: event.actionId, _openid: OPENID }).get();
      if (!res.data.length) return err(1002, '无权限或不存在');
      const src = res.data[0];
      const now = Date.now();
      const data = {
        ...pickActionFields(src),
        name: (src.name || '') + ' 副本',
        archived: false,
        lastUsedAt: now,
        createdAt: now,
        updatedAt: now
      };
      const _id = event.newId || undefined;
      if (_id) data._id = _id;
      await col.add({ data });
      return ok({ id: _id || data._id });
    }

    // ---- 归档 / 恢复 ----
    if (type === 'archive') {
      if (!event.actionId) return err(2001, '参数错误');
      const res = await col.where({ _id: event.actionId, _openid: OPENID }).update({
        data: { archived: !!event.archived, updatedAt: Date.now() }
      });
      if (!res.stats.updated) return err(1002, '无权限或不存在');
      return ok({ id: event.actionId });
    }

    // ---- 删除：历史 dayAction 快照保留，仅解除 actionId 关联 ----
    if (type === 'delete') {
      if (!event.actionId) return err(2001, '参数错误');
      const del = await col.where({ _id: event.actionId, _openid: OPENID }).remove();
      if (!del.stats.removed) return err(1002, '无权限或不存在');
      await db
        .collection('dayAction')
        .where({ _openid: OPENID, actionId: event.actionId })
        .update({ data: { actionId: '' } });
      return ok({ id: event.actionId });
    }

    return err(2001, '未知接口');
  } catch (e) {
    return err(3001, '服务异常: ' + e.message);
  }
};
