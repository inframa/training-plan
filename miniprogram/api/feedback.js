// feedback API
const { callCloud } = require('./core');

function submit(content, contact, type) {
  return callCloud('feedback', { action: 'submit', payload: { content, contact, type } });
}

function listMine() {
  return callCloud('feedback', { action: 'list' });
}

function listAll(opts) {
  return callCloud('feedback', { action: 'listAll', payload: opts || {} });
}

function markResolved(id, status, skipAutoReply) {
  return callCloud('feedback', { action: 'markResolved', payload: { id, status, skipAutoReply: !!skipAutoReply } });
}

function reply(id, reply) {
  return callCloud('feedback', { action: 'reply', payload: { id, reply } });
}

function del(id) {
  return callCloud('feedback', { action: 'delete', payload: { id } });
}

function stats() {
  return callCloud('feedback', { action: 'stats' });
}

function checkAdmin() {
  return callCloud('feedback', { action: 'checkAdmin' });
}

function listAdmins() {
  return callCloud('feedback', { action: 'listAdmins' });
}

function addAdmin(openid, remark) {
  return callCloud('feedback', { action: 'addAdmin', payload: { openid, remark: remark || '' } });
}

function removeAdmin(openid) {
  return callCloud('feedback', { action: 'removeAdmin', payload: { openid } });
}

function getMyOpenid() {
  return callCloud('feedback', { action: 'listMine', payload: {} }).then(() => {
    // 从 login 云函数获取，更可靠
    return callCloud('login', {});
  }).then(r => r && r.openid);
}

module.exports = { submit, listMine, listAll, markResolved, reply, del, stats, checkAdmin, listAdmins, addAdmin, removeAdmin };
