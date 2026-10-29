// 客户端 ID 生成：本地/云端共用同一 ID，保证离线操作幂等
function uuid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

module.exports = { uuid };
