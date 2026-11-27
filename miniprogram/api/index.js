// api 统一出口
const { callCloud } = require('./core');
const { login } = require('./login');    // 直接解构出 login 函数（不是整个模块对象）
const action = require('./action');
const record = require('./record');
const image = require('./image');
const feedback = require('./feedback');

module.exports = { callCloud, login, action, record, image, feedback };
// 现在 api.login() 直接是函数
// api.action.list() / api.record.month() 保持嵌套（因为这俩有多个方法）
