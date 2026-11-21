// 图片压缩与临时地址
// 约束：体积 ≤ 1MB；长边从 1920px 起逐级缩小直至达标
const QUALITY = 70;
const MAX_SIZE = 1 * 1024 * 1024;
// 长边逐级下调：1920 → 1280 → 960 → 720 → 540 → 360
const LONG_EDGE_STEPS = [1920, 1280, 960, 720, 540, 360];

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

// 压缩单张图片：固定质量 70，长边逐级缩小直至体积 ≤ 1MB
async function compressOne(src) {
  try {
    const info = await getImageInfo(src);
    let cw, ch;
    // 从原始尺寸或最大 step 开始，取更小的那个
    const startEdge = Math.min(info.width, info.height, LONG_EDGE_STEPS[0]);
    if (startEdge === info.width && startEdge === info.height) {
      cw = ch = startEdge;
    } else if (info.width >= info.height) {
      ch = startEdge;
      cw = Math.round((info.width * startEdge) / info.height);
    } else {
      cw = startEdge;
      ch = Math.round((info.height * startEdge) / info.width);
    }

    let out = src;
    let size = Infinity;

    for (const edge of LONG_EDGE_STEPS) {
      // 计算当前 step 下的目标像素
      if (info.width >= info.height) {
        ch = edge;
        cw = Math.round((info.width * edge) / info.height);
      } else {
        cw = edge;
        ch = Math.round((info.height * edge) / info.width);
      }
      out = await compress(src, QUALITY, cw, ch).catch(() => src);
      size = await fileSize(out);
      if (size <= MAX_SIZE) break;
    }
    // 循环结束仍超限（极端情况，如纯黑大图），返回最后一次压缩结果
    return out;
  } catch (e) {
    return src;
  }
}

// 选择并压缩 count 张图片，返回临时路径数组（自动逐级降分辨率，确保 ≤ 1MB）
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

module.exports = { compressOne, chooseAndCompress, tempFileURLs, LONG_EDGE_STEPS, MAX_SIZE };
