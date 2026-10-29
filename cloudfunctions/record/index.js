// 训练记录接口：save / get / month / lastAction / delete
// save 按 (_openid, date) 幂等 upsert：先写每日记录，再整体重建当日动作与训练组
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function err(code, message) {
  return { code, message };
}

function ok(data) {
  return { code: 0, message: 'ok', data };
}

function normalizeSet(s) {
  const weight = s.weight === '' || s.weight === null || s.weight === undefined ? null : Number(s.weight);
  const reps = s.reps === '' || s.reps === null || s.reps === undefined ? null : parseInt(s.reps, 10);
  return {
    id: s.id,
    setIndex: Math.max(1, parseInt(s.setIndex, 10) || 1),
    weight: weight !== null && isFinite(weight) ? weight : null,
    reps: reps !== null && isFinite(reps) && reps > 0 ? Math.floor(reps) : null,
    done: !!s.done,
    remark: s.remark || ''
  };
}

// 整日保存
async function save(openid, event) {
  const { date, title, remark, dayActions, clientUpdatedAt } = event;
  if (!DATE_RE.test(date || '')) return err(2001, '日期格式错误');
  if (!Array.isArray(dayActions)) return err(2001, '参数错误');

  const col = db.collection('dailyRecord');
  const existRes = await col.where({ _openid: openid, date }).get();
  const now = Date.now();
  let recId;
  if (existRes.data.length) {
    recId = existRes.data[0]._id;
    await col.doc(recId).update({ data: { title: title || '', remark: remark || '', updatedAt: now } });
  } else {
    const addRes = await col.add({
      data: { _openid: openid, date, title: title || '', remark: remark || '', createdAt: now, updatedAt: now }
    });
    recId = addRes._id;
  }

  // 重建当日动作与训练组（幂等：重复保存不产生重复数据）
  const daCol = db.collection('dayAction');
  const srCol = db.collection('setRecord');
  const oldDa = await daCol.where({ _openid: openid, dailyRecordId: recId }).get();
  const oldIds = oldDa.data.map((d) => d._id);
  if (oldIds.length) {
    await srCol.where({ _openid: openid, dayActionId: _.in(oldIds) }).remove();
    await daCol.where({ _openid: openid, dailyRecordId: recId }).remove();
  }

  for (let i = 0; i < dayActions.length; i++) {
    const da = dayActions[i];
    if (!da.id || !da.snapshot || !da.snapshot.name) continue;
    const daId = da.id;
    await daCol.add({
      data: {
        _id: daId,
        _openid: openid,
        dailyRecordId: recId,
        actionId: da.actionId || '',
        snapshot: {
          name: da.snapshot.name,
          imageFileIds: da.snapshot.imageFileIds || [],
          gym: da.snapshot.gym || '',
          handleType: da.snapshot.handleType || '',
          seat: da.snapshot.seat || '',
          recordType: da.snapshot.recordType === 'seat_reps' ? 'reps_only' : da.snapshot.recordType || 'weight_reps'
        },
        seat: da.seat || '',
        handleType: da.handleType || '',
        sort: i,
        createdAt: now
      }
    });
    const sets = (da.setRecords || []).map(normalizeSet);
    for (let j = 0; j < sets.length; j++) {
      await srCol.add({
        data: {
          _id: sets[j].id,
          _openid: openid,
          dayActionId: daId,
          setIndex: sets[j].setIndex,
          weight: sets[j].weight,
          reps: sets[j].reps,
          done: sets[j].done,
          remark: sets[j].remark,
          createdAt: now
        }
      });
    }
  }

  // 更新动作库最近使用时间（用于"最近使用优先"排序）
  const actionIds = Array.from(new Set(dayActions.map((d) => d.actionId).filter(Boolean)));
  if (actionIds.length) {
    await db
      .collection('action')
      .where({ _openid: openid, _id: _.in(actionIds) })
      .update({ data: { lastUsedAt: now } });
  }

  return ok({ dailyRecordId: recId, updatedAt: clientUpdatedAt || now });
}

// 获取某日记录（含动作与组）
async function get(openid, event) {
  if (!DATE_RE.test(event.date || '')) return err(2001, '日期格式错误');
  const recRes = await db.collection('dailyRecord').where({ _openid: openid, date: event.date }).get();
  if (!recRes.data.length) return ok({ exists: false });
  const record = recRes.data[0];
  const daRes = await db
    .collection('dayAction')
    .where({ _openid: openid, dailyRecordId: record._id })
    .orderBy('sort', 'asc')
    .get();
  const daIds = daRes.data.map((d) => d._id);
  let setsByDa = {};
  if (daIds.length) {
    const srRes = await db.collection('setRecord').where({ _openid: openid, dayActionId: _.in(daIds) }).get();
    srRes.data.sort((a, b) => a.setIndex - b.setIndex);
    srRes.data.forEach((s) => {
      if (!setsByDa[s.dayActionId]) setsByDa[s.dayActionId] = [];
      setsByDa[s.dayActionId].push(s);
    });
  }
  return ok({
    exists: true,
    record: { id: record._id, date: record.date, title: record.title || (record.tags || []).join('·'), remark: record.remark, updatedAt: record.updatedAt },
    dayActions: daRes.data.map((d) => ({
      id: d._id,
      actionId: d.actionId,
      snapshot: d.snapshot,
      seat: d.seat,
      handleType: d.handleType || (d.snapshot && d.snapshot.handleType) || '',
      sort: d.sort,
      sets: setsByDa[d._id] || []
    }))
  });
}

// 当月有记录的日期与训练标题/容量（区分已训练/草稿）
async function month(openid, event) {
  const ym = event.yearMonth || '';
  if (!/^\d{4}-\d{2}$/.test(ym)) return err(2001, '参数错误');
  const recRes = await db
    .collection('dailyRecord')
    .where({ _openid: openid, date: db.RegExp({ regexp: '^' + ym + '-' }) })
    .limit(31)
    .get();
  const records = recRes.data;
  if (!records.length) return ok({ days: [] });
  const recIds = records.map((r) => r._id);
  const daRes = await db.collection('dayAction').where({ _openid: openid, dailyRecordId: _.in(recIds) }).get();
  const daIds = daRes.data.map((d) => d._id);
  const doneDaIds = {};
  const daHasSets = {};
  const daVolume = {};
  if (daIds.length) {
    const srRes = await db.collection('setRecord').where({ _openid: openid, dayActionId: _.in(daIds) }).get();
    srRes.data.forEach((s) => {
      daHasSets[s.dayActionId] = true;
      if (s.done) {
        doneDaIds[s.dayActionId] = true;
        if (s.weight > 0 && s.reps > 0) {
          daVolume[s.dayActionId] = (daVolume[s.dayActionId] || 0) + Math.round(s.weight * s.reps * 100) / 100;
        }
      }
    });
  }
  const recHasActions = {};
  daRes.data.forEach((d) => (recHasActions[d.dailyRecordId] = true));
  const days = records.map((r) => {
    const hasActions = !!recHasActions[r._id];
    const done = daRes.data.some((d) => d.dailyRecordId === r._id && doneDaIds[d._id]);
    const volume = daRes.data.reduce((sum, d) => sum + (d.dailyRecordId === r._id ? daVolume[d._id] || 0 : 0), 0);
    return {
      date: r.date,
      title: r.title || (r.tags || []).join('·') || '',
      volume: Math.round(volume * 100) / 100,
      status: !hasActions ? 'draft' : done ? 'trained' : 'draft'
    };
  });
  return ok({ days });
}

// 动作最近一次历史记录（复制上次训练）
async function lastAction(openid, event) {
  const { actionId, snapshotName, beforeDate } = event;
  if (!actionId && !snapshotName) return err(2001, '参数错误');
  if (!DATE_RE.test(beforeDate || '')) return err(2001, '参数错误');
  const where = { _openid: openid };
  if (actionId) where.actionId = actionId;
  else where['snapshot.name'] = snapshotName;
  const daRes = await db.collection('dayAction').where(where).orderBy('createdAt', 'desc').limit(50).get();
  if (!daRes.data.length) return ok({ found: false });
  const recIds = Array.from(new Set(daRes.data.map((d) => d.dailyRecordId)));
  const recRes = await db.collection('dailyRecord').where({ _openid: openid, _id: _.in(recIds) }).get();
  const dateOfRec = {};
  recRes.data.forEach((r) => (dateOfRec[r._id] = r.date));
  // 过滤早于目标日期的记录，取最近一天
  let best = null;
  daRes.data.forEach((d) => {
    const date = dateOfRec[d.dailyRecordId];
    if (!date || date >= beforeDate) return;
    if (!best || date > best.date) best = { date, da: d };
  });
  if (!best) return ok({ found: false });
  const srRes = await db.collection('setRecord').where({ _openid: openid, dayActionId: best.da._id }).get();
  srRes.data.sort((a, b) => a.setIndex - b.setIndex);
  return ok({
    found: true,
    date: best.date,
    dayAction: {
      id: best.da._id,
      actionId: best.da.actionId,
      snapshot: best.da.snapshot,
      seat: best.da.seat,
      sets: srRes.data.map((s) => ({ setIndex: s.setIndex, weight: s.weight, reps: s.reps, done: s.done, remark: s.remark }))
    }
  });
}

// 删除整日记录（含动作与组）
async function removeDay(openid, event) {
  if (!event.dailyRecordId) return err(2001, '参数错误');
  const recRes = await db.collection('dailyRecord').where({ _id: event.dailyRecordId, _openid: openid }).get();
  if (!recRes.data.length) return err(1002, '无权限或不存在');
  const daRes = await db.collection('dayAction').where({ _openid: openid, dailyRecordId: event.dailyRecordId }).get();
  const daIds = daRes.data.map((d) => d._id);
  if (daIds.length) {
    await db.collection('setRecord').where({ _openid: openid, dayActionId: _.in(daIds) }).remove();
  }
  await db.collection('dayAction').where({ _openid: openid, dailyRecordId: event.dailyRecordId }).remove();
  await db.collection('dailyRecord').doc(event.dailyRecordId).remove();
  return ok({ id: event.dailyRecordId });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return err(1001, '未登录');
  try {
    switch (event.type) {
      case 'save':
        return await save(OPENID, event);
      case 'get':
        return await get(OPENID, event);
      case 'month':
        return await month(OPENID, event);
      case 'lastAction':
        return await lastAction(OPENID, event);
      case 'delete':
        return await removeDay(OPENID, event);
      default:
        return err(2001, '未知接口');
    }
  } catch (e) {
    return err(3001, '服务异常: ' + e.message);
  }
};
