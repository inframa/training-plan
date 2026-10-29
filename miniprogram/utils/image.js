// 图片压缩与临时地址
// 约束：长边 ≤ 1920px，体积 ≤ 2MB
const LONG_EDGE = 1920;
const MAX_SIZE = 2 * 1024 * 1024;

function getImageInfo(src) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({ src, success: resolve, fail: reject });
  });
}

function compress(src, quality, cw, ch) {
  return new Promise((resolve, reject) => {
    const opt = { src, quality };
    if (cw && ch) {
      opt.compressedWidth = cw;
      opt.compressedHeight = ch;
    }
    wx.compressImage({
      ...opt,
      success: (res) => resolve(res.tempFilePath),
      fail: reject
    });
  });
}

function fileSize(path) {
  return new Promise((resolve) => {
    wx.getFileInfo({
      filePath: path,
      success: (res) => resolve(res.size || 0),
      fail: () => resolve(0)
    });
  });
}

// 压缩单张图片；失败时回退原图
async function compressOne(src) {
  try {
    const info = await getImageInfo(src);
    let cw, ch;
    if (info.width > LONG_EDGE || info.height > LONG_EDGE) {
      if (info.width >= info.height) {
        cw = LONG_EDGE;
        ch = Math.round((info.height * LONG_EDGE) / info.width);
      } else {
        ch = LONG_EDGE;
        cw = Math.round((info.width * LONG_EDGE) / info.height);
      }
    }
    let out = await compress(src, 80, cw, ch).catch(() => src);
    let size = await fileSize(out);
    if (size > MAX_SIZE) {
      out = await compress(src, 50, cw, ch).catch(() => out);
      size = await fileSize(out);
      if (size > MAX_SIZE) out = src; // 仍超限则保留原图，由上传端兜底
    }
    return out;
  } catch (e) {
    return src;
  }
}

// 选择并压缩 count 张图片，返回临时路径数组
function chooseAndCompress(count) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const files = res.tempFiles || [];
        const out = [];
        for (const f of files) {
          out.push(await compressOne(f.tempFilePath));
        }
        resolve(out);
      },
      fail: reject
    });
  });
}

// 云存储 fileID → 临时 https 链接（用于 previewImage）
function tempFileURLs(fileIds) {
  const ids = (fileIds || []).filter(Boolean);
  if (!ids.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    wx.cloud.getTempFileURL({
      fileList: ids,
      success: (res) => resolve((res.fileList || []).map((f) => f.tempFileURL).filter(Boolean)),
      fail: () => resolve([])
    });
  });
}

module.exports = { compressOne, chooseAndCompress, tempFileURLs, LONG_EDGE, MAX_SIZE };
