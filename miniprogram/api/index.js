// api 统一出口
const { callCloud } = require('./core');
const login = require('./login');
const action = require('./action');
const record = require('./record');
const image = require('./image');
const feedback = require('./feedback');

module.exports = { callCloud, login, action, record, image, feedback };
