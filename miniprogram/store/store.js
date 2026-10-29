// 全局状态 + 同步模块（同步策略：本地优先，整日记录按日期增量推送，服务端按 (_openid,date) 幂等 upsert）
// 离线时写本地并标记"待同步"，网络恢复/启动时自动重试
const api = require('../api/index');
const storage = require('../utils/storage');
const { uuid } = require('../utils/uuid');
const { todayStr } = require('../utils/date');
const capacity = require('../utils/capacity');
const { DEFAULT_PART_TREE } = require('../utils/constants');

const state = {
  openid: '',
  ready: false,
  today: '',
  library: [],        // 动作库缓存
  monthMarks: {},     // { '2026-10': { '2026-10-15': {title, volume, status} } }
  pendingDates: [],   // 待同步的记录日期
  pendingDeletes: [], // 待同步的整日删除 { dailyRecordId, date }
  pendingActions: [], // 待同步的动作操作 { type, id, action? }
  pendingAddActionId: '', // 动作编辑页 → 训练记录页 回写
  syncing: false
};

let listeners = [];
let K = null; // 当前用户的存储 key 前缀

function notify() {
  listeners.slice().forEach((fn) => {
    try {
      fn();
    } catch (e) {
      /* ignore */
    }
  });
}

function subscribe(fn) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

// ---------- key 管理 ----------
function setPrefix(openid) {
  K = {
    library: 'u_' + openid + '_library',
    monthMarks: 'u_' + openid + '_month_marks',
    record: 'u_' + openid + '_record_',
    pendingDates: 'u_' + openid + '_pending_dates',
    pendingDeletes: 'u_' + openid + '_pending_deletes',
    pendingActions: 'u_' + openid + '_pending_actions'
  };
}

// 首次离线使用临时 ID，登录成功后迁移本地数据
function migrateIfNeeded(newOpenid) {
  const last = wx.getStorageSync('last_openid');
  if (last && last !== newOpenid && last.indexOf('local-') === 0) {
    const oldPrefix = 'u_' + last + '_';
    const newPrefix = 'u_' + newOpenid + '_';
    storage.allKeys().forEach((key) => {
      if (key.indexOf(oldPrefix) === 0) {
        const val = wx.getStorageSync(key);
        wx.setStorageSync(newPrefix + key.slice(oldPrefix.length), val);
        wx.removeStorageSync(key);
      }
    });
  }
  wx.setStorageSync('last_openid', newOpenid);
}

// ---------- 初始化 ----------
async function init() {
  if (state.readyPromise) return state.readyPromise;
  state.today = todayStr();
  state.readyPromise = (async () => {
    try {
      const res = await api.login();
      state.openid = res.openid;
      migrateIfNeeded(res.openid);
    } catch (e) {
      // 离线兜底：使用本地临时 ID
      state.openid = wx.getStorageSync('local_openid') || 'local-' + Date.now();
      wx.setStorageSync('local_openid', state.openid);
    }
    setPrefix(state.openid);
    state.library = storage.get(K.library, []);
    state.monthMarks = storage.get(K.monthMarks, {});
    state.pendingDates = storage.get(K.pendingDates, []);
    state.pendingDeletes = storage.get(K.pendingDeletes, []);
    state.pendingActions = storage.get(K.pendingActions, []);
    state.ready = true;
    notify();
    // 后台刷新动作库 + 重试待同步数据
    refreshLibrary();
    retryAll('launch');
  })();
  return state.readyPromise;
}

function ready() {
  return state.readyPromise || init();
}

// ---------- 动作库 ----------
function normalizeAction(a) {
  if (!a) return a;
  return {
    ...a,
    id: a.id || a._id,
    lastUsedAt: a.lastUsedAt || 0,
    createdAt: a.createdAt || 0,
    updatedAt: a.updatedAt || 0
  };
}

function sortLibrary(list) {
  return list.slice().sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0));
}

function getLibrary() {
  return state.library;
}

function findAction(id) {
  return state.library.find((a) => a.id === id) || null;
}

function setLibrary(list) {
  state.library = sortLibrary(list);
  if (K) storage.set(K.library, state.library);
  notify();
}

async function refreshLibrary() {
  try {
    const res = await api.action.list({ page: 1, pageSize: 200 });
    const serverList = (res.list || []).map(normalizeAction);
    // 合并本地未同步的操作，避免刷新丢失离线改动
    const map = {};
    serverList.forEach((a) => (map[a.id] = a));
    state.pendingActions.forEach((op) => {
      if (op.type === 'delete') delete map[op.id];
      else if (op.action) map[op.id] = normalizeAction(op.action);
    });
    setLibrary(Object.values(map));
  } catch (e) {
    // 离线：保留本地缓存
  }
}

function upsertAction(action) {
  const idx = state.library.findIndex((a) => a.id === action.id);
  if (idx >= 0) state.library[idx] = action;
  else state.library.unshift(action);
  setLibrary(state.library);
}

function removeAction(id) {
  setLibrary(state.library.filter((a) => a.id !== id));
}

function queueActionOp(type, id, action) {
  state.pendingActions = state.pendingActions.filter((op) => op.id !== id || op.type === 'delete');
  if (type !== 'delete') {
    state.pendingActions.push({ type, id, action });
  }
  if (K) storage.set(K.pendingActions, state.pendingActions);
}

// ---------- 训练记录（本地优先） ----------
function getLocalRecord(date) {
  if (!K) return null;
  return storage.get(K.record + date, null);
}

function saveLocalRecord(record) {
  if (!K) return;
  record.updatedAt = Date.now();
  storage.set(K.record + record.date, record);
  setMonthMark(record.date, markOf(record));
  notify();
}

function deleteLocalRecord(date) {
  if (!K) return;
  storage.remove(K.record + date);
  setMonthMark(date, null);
  notify();
}

// 日历标记：有动作且无已完成组 → 草稿；有已完成组 → 已训练
// 标记内容为训练标题 + 当日容量（旧数据无标题时回退用标签拼接）
function markOf(record) {
  if (!record || !record.dayActions || !record.dayActions.length) return null;
  const done = record.dayActions.some((a) => (a.sets || []).some((s) => s.done));
  const title = record.title || (record.tags || []).join('·');
  return { title: title || '', volume: capacity.dayVolume(record.dayActions), status: done ? 'trained' : 'draft' };
}

// ---------- 月历标记 ----------
function getMonthMarks(ym) {
  return (state.monthMarks && state.monthMarks[ym]) || {};
}

function setMonthMark(date, mark) {
  const ym = date.slice(0, 7);
  if (!state.monthMarks[ym]) state.monthMarks[ym] = {};
  if (mark) state.monthMarks[ym][date] = mark;
  else delete state.monthMarks[ym][date];
  if (K) storage.set(K.monthMarks, state.monthMarks);
}

// 云端月历数据合并（云端为准，待同步日期以本地为准）
function mergeCloudMonth(ym, days) {
  const marks = {};
  (days || []).forEach((d) => {
    const title = d.title || (d.tags || []).join('·');
    marks[d.date] = { title: title || '', volume: d.volume || 0, status: d.status || 'draft' };
  });
  (state.pendingDates || []).forEach((date) => {
    if (date.indexOf(ym) === 0) {
      const rec = getLocalRecord(date);
      const m = markOf(rec);
      if (m) marks[date] = m;
      else delete marks[date];
    }
  });
  state.monthMarks[ym] = marks;
  if (K) storage.set(K.monthMarks, state.monthMarks);
  notify();
}

// ---------- 待同步队列 ----------
function markPendingDate(date) {
  if (state.pendingDates.indexOf(date) < 0) state.pendingDates.push(date);
  if (K) storage.set(K.pendingDates, state.pendingDates);
}

function clearPendingDate(date) {
  state.pendingDates = state.pendingDates.filter((d) => d !== date);
  if (K) storage.set(K.pendingDates, state.pendingDates);
}

function isPending(date) {
  return state.pendingDates.indexOf(date) >= 0;
}

function buildRecordPayload(record) {
  return {
    date: record.date,
    title: record.title || '',
    remark: record.remark || '',
    dayActions: (record.dayActions || []).map((a, i) => ({
      id: a.id,
      actionId: a.actionId || '',
      sort: i,
      snapshot: a.snapshot,
      seat: a.seat || '',
      handleType: a.handleType || '',
      setRecords: (a.sets || []).map((s, j) => ({
        id: s.id,
        setIndex: j + 1,
        weight: s.weight,
        reps: s.reps,
        done: !!s.done,
        remark: s.remark || ''
      }))
    }))
  };
}

// 推送整日记录，成功返回 true，失败标记待同步
async function pushRecord(record) {
  try {
    await api.record.save(buildRecordPayload(record));
    clearPendingDate(record.date);
    return true;
  } catch (e) {
    if (e.code !== 4001 && e.code !== 3001) {
      // 参数/权限类错误不重试
      clearPendingDate(record.date);
      return false;
    }
    markPendingDate(record.date);
    return false;
  }
}

async function pushDeleteDay(dailyRecordId, date) {
  try {
    await api.record.remove(dailyRecordId);
    return true;
  } catch (e) {
    if (e.code === 1002) return true; // 云端本就不存在
    state.pendingDeletes.push({ dailyRecordId, date });
    if (K) storage.set(K.pendingDeletes, state.pendingDeletes);
    return false;
  }
}

// 启动/网络恢复时执行：删除队列 → 动作操作队列 → 记录推送队列
async function retryAll() {
  if (state.syncing || !state.ready) return;
  state.syncing = true;
  try {
    // 整日删除
    if (state.pendingDeletes.length) {
      const deletes = state.pendingDeletes;
      state.pendingDeletes = [];
      if (K) storage.set(K.pendingDeletes, state.pendingDeletes);
      for (const op of deletes) {
        await pushDeleteDay(op.dailyRecordId, op.date);
      }
    }
    // 动作 create/update/delete
    if (state.pendingActions.length) {
      const ops = state.pendingActions;
      state.pendingActions = [];
      if (K) storage.set(K.pendingActions, state.pendingActions);
      for (const op of ops) {
        try {
          if (op.type === 'create') await api.action.create(op.action);
          else if (op.type === 'update') {
            try {
              await api.action.update(op.id, op.action);
            } catch (e2) {
              // 云端不存在（如离线新建后编辑）→ 退化为创建
              if (e2.code === 1002) await api.action.create(op.action);
              else throw e2;
            }
          } else if (op.type === 'delete') await api.action.remove(op.id);
        } catch (e) {
          if (e.code === 1002 && op.type === 'delete') continue;
          // 仍失败：回滚进队列
          state.pendingActions.push(op);
        }
      }
      if (K) storage.set(K.pendingActions, state.pendingActions);
    }
    // 记录推送
    if (state.pendingDates.length) {
      const dates = state.pendingDates.slice();
      for (const date of dates) {
        const rec = getLocalRecord(date);
        if (!rec) {
          clearPendingDate(date);
          continue;
        }
        await pushRecord(rec);
      }
    }
    notify();
  } finally {
    state.syncing = false;
  }
}

// ---------- 跨页面回写 ----------
function takePendingAddActionId() {
  const id = state.pendingAddActionId;
  state.pendingAddActionId = '';
  return id;
}

// 新建空白记录
function blankRecord(date) {
  return {
    id: uuid(),
    date,
    title: '',
    remark: '',
    updatedAt: 0,
    dayActions: []
  };
}

// ---------- 自定义分类树（设备级偏好，本地存储） ----------
const PART_TREE_KEY = 'part_tree_v1';

function getPartTree() {
  const custom = wx.getStorageSync(PART_TREE_KEY);
  if (custom && Array.isArray(custom.tree) && custom.tree.length) return custom.tree;
  return JSON.parse(JSON.stringify(DEFAULT_PART_TREE));
}

// tree 结构与 DEFAULT_PART_TREE 一致：[{ label, children: [{label}] }]；传 null 恢复默认
function setPartTree(tree) {
  if (!tree || !tree.length) {
    wx.removeStorageSync(PART_TREE_KEY);
    return;
  }
  wx.setStorageSync(PART_TREE_KEY, { tree, updatedAt: Date.now() });
}

module.exports = {
  state,
  init,
  ready,
  subscribe,
  getOpenid: () => state.openid,
  isReady: () => state.ready,
  // 动作库
  getLibrary,
  findAction,
  refreshLibrary,
  upsertAction,
  removeAction,
  queueActionOp,
  // 记录
  getLocalRecord,
  saveLocalRecord,
  deleteLocalRecord,
  blankRecord,
  pushRecord,
  pushDeleteDay,
  isPending,
  // 月历
  getMonthMarks,
  mergeCloudMonth,
  setMonthMark,
  markOf,
  // 自定义分类树
  getPartTree,
  setPartTree,
  // 同步
  retryAll,
  // 回写
  takePendingAddActionId
};
