const fs = require('fs');
const zlib = require('zlib');

const GRAY = [154, 163, 174, 255];
const BLUE = [46, 107, 230, 255];
const W = 81, H = 81;

function makePNG(pixels) {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      const p = pixels[y][x];
      const o = y * (1 + W * 4) + 1 + x * 4;
      raw[o] = p[0]; raw[o+1] = p[1]; raw[o+2] = p[2]; raw[o+3] = p[3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  const chunks = [];
  chunks.push(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', compressed));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}
function makeChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function blank() {
  const p = [];
  for (let y = 0; y < H; y++) { p.push([]); for (let x = 0; x < W; x++) p[y].push([0,0,0,0]); }
  return p;
}
function fill(p, x1, y1, x2, y2, c) {
  for (let y = Math.max(0,y1); y <= Math.min(H-1,y2); y++)
    for (let x = Math.max(0,x1); x <= Math.min(W-1,x2); x++) p[y][x] = c.slice();
}
function hline(p, x1, x2, y, c) { fill(p, x1, y, x2, y, c); fill(p, x1, y+1, x2, y+1, c); }
function vline(p, x, y1, y2, c) { fill(p, x, y1, x, y2, c); fill(p, x+1, y1, x+1, y2, c); }

// === 图标 1：训练计划（plan）—— 文档列表 ===
// 简单：文档外框 + 3 条横线
function drawPlan(color) {
  const w = blank();
  // 文档外框（2px 粗）
  const x1=16, y1=18, x2=64, y2=64;
  hline(w, x1, x2, y1, color);
  hline(w, x1, x2, y2, color);
  vline(w, x1, y1, y2, color);
  vline(w, x2, y1, y2, color);
  // 顶部小横线（3 行文字占位）
  hline(w, 22, 58, 30, color);
  hline(w, 22, 52, 42, color);
  hline(w, 22, 56, 54, color);
  return w;
}

// === 图标 2：我的（mine）—— 头像圆形 ===
function drawMine(color) {
  const w = blank();
  // 圆形头像 —— 用朴素的距离判断
  const cx = 40, cy = 28, r = 14;
  for (let y = cy-r-1; y <= cy+r+1; y++)
    for (let x = cx-r-1; x <= cx+r+1; x++) {
      const d = Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
      if (d <= r) w[y][x] = color.slice();
      else if (d <= r+1.2) { w[y][x] = color.slice(); } // 抗锯齿
    }
  // 身体半圆：从 y=50 到 y=75，x 范围随 y 变化
  // 简化：一个实心梯形肩膀
  // 左斜边：(20, 75) -> (32, 50)
  // 右斜边：(48, 50) -> (60, 75)
  for (let y = 50; y <= 75; y++) {
    const t = (y - 50) / 25; // 0..1
    const lx = Math.round(32 - t * 12); // 32 -> 20
    const rx = Math.round(48 + t * 12); // 48 -> 60
    hline(w, lx, rx, y, color);
  }
  return w;
}

const path = 'miniprogram/images/tab';
fs.writeFileSync(path + '/plan.png', makePNG(drawPlan(GRAY)));
fs.writeFileSync(path + '/plan-active.png', makePNG(drawPlan(BLUE)));
fs.writeFileSync(path + '/mine.png', makePNG(drawMine(GRAY)));
fs.writeFileSync(path + '/mine-active.png', makePNG(drawMine(BLUE)));

// 验证像素
function verify() {
  const zlib = require('zlib');
  const fs = require('fs');
  for (const f of ['plan.png','plan-active.png','mine.png','mine-active.png']) {
    const d = fs.readFileSync(path+'/'+f);
    let pos = 8, idat = null;
    while (pos < d.length) {
      const len = d.readUInt32BE(pos); pos += 4;
      const type = d.slice(pos, pos+4).toString(); pos += 4;
      if (type === 'IDAT') { idat = d.slice(pos, pos+len); break; }
      pos += len; pos += 4;
    }
    const raw = zlib.inflateSync(idat);
    let opaque = 0, mainColor = {};
    for (let y = 0; y < H; y++) {
      const rs = y*(1+W*4)+1;
      for (let x = 0; x < W; x++) {
        const o = rs + x*4;
        if (raw[o+3] === 255) {
          opaque++;
          const k = raw[o]+','+raw[o+1]+','+raw[o+2];
          mainColor[k] = (mainColor[k]||0)+1;
        }
      }
    }
    const top = Object.entries(mainColor).sort((a,b)=>b[1]-a[1])[0];
    console.log(f, 'opaque='+opaque, 'mainColor='+ (top?top[0]:'none'));
  }
}
verify();
