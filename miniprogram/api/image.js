// 图片接口：客户端压缩后直传云存储，返回 fileID
const { uuid } = require('../utils/uuid');
const { chooseAndCompress } = require('../utils/image');

// 选择 + 压缩，返回临时路径数组（供 image-picker 使用）
function pickAndCompress(count) {
  return chooseAndCompress(count);
}

// 上传单张，返回 fileID
function upload(filePath) {
  const cloudPath = 'actions/' + uuid() + '.jpg';
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: reject
    });
  });
}

// 删除未引用图片
function deleteFiles(fileIds) {
  const ids = (fileIds || []).filter(Boolean);
  if (!ids.length) return Promise.resolve(true);
  return new Promise((resolve) => {
    wx.cloud.deleteFile({
      fileList: ids,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

module.exports = { pickAndCompress, upload, deleteFiles };
