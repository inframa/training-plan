// 动作库接口
const { callCloud } = require('./core');

function list(params) {
  return callCloud('action', { type: 'list', ...params });
}

function detail(actionId) {
  return callCloud('action', { type: 'detail', actionId });
}

function create(action) {
  return callCloud('action', { type: 'create', action });
}

function update(actionId, patch) {
  return callCloud('action', { type: 'update', actionId, patch });
}

function copy(actionId, newId) {
  return callCloud('action', { type: 'copy', actionId, newId });
}

function archive(actionId, archived) {
  return callCloud('action', { type: 'archive', actionId, archived });
}

function remove(actionId) {
  return callCloud('action', { type: 'delete', actionId });
}

module.exports = { list, detail, create, update, copy, archive, remove };
