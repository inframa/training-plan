// 登录接口：云函数自动换取 openid
const { callCloud } = require('./core');

function login() {
  return callCloud('login', {});
}

module.exports = { login };
