// feedback API
const { callCloud } = require('./core');

function submit(content, contact, type) {
  return callCloud('feedback', { action: 'submit', payload: { content, contact, type } });
}

function listMine() {
  return callCloud('feedback', { action: 'list' });
}

function listAll(status) {
  return callCloud('feedback', { action: 'listAll', payload: { status } });
}

function markResolved(id, status) {
  return callCloud('feedback', { action: 'markResolved', payload: { id, status } });
}

function del(id) {
  return callCloud('feedback', { action: 'delete', payload: { id } });
}

function checkAdmin() {
  return callCloud('feedback', { action: 'checkAdmin' });
}

module.exports = { submit, listMine, listAll, markResolved, del, checkAdmin };
