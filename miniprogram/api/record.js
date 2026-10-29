// 训练记录接口
const { callCloud } = require('./core');

// 整日记录保存/更新（按 (_openid, date) 幂等 upsert）
function save(payload) {
  return callCloud('record', { type: 'save', ...payload });
}

function get(date) {
  return callCloud('record', { type: 'get', date });
}

// 获取当月有记录的日期与标签：yearMonth = '2026-10'
function month(yearMonth) {
  return callCloud('record', { type: 'month', yearMonth });
}

// 获取动作最近一次历史记录（复制上次训练）
function lastAction(params) {
  return callCloud('record', { type: 'lastAction', ...params });
}

function remove(dailyRecordId) {
  return callCloud('record', { type: 'delete', dailyRecordId });
}

module.exports = { save, get, month, lastAction, remove };
