'use strict';
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

// ── PNG reader ────────────────────────────────────────────────────────────────
function readPNG(buf) {
  const sig = [137,80,78,71,13,10,26,10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error('Not a PNG');

  let offset = 8, width, height, bitDepth, colorType;
  const idatChunks = [];

  while (offset < buf.length) {
    const len  = buf.readUInt32BE(offset); offset += 4;
    const type = buf.slice(offset, offset + 4).toString('ascii'); offset += 4;
    const data = buf.slice(offset, offset + len); offset += len + 4;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (data[12] !== 0) throw new Error('Interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') break;
  }

  // channels per color type: 0=gray, 2=RGB, 4=gray+A, 6=RGBA
  const channels = [1, 0, 3, 0, 2, 0, 4][colorType];
  const bpp      = Math.ceil(channels * bitDepth / 8);
  const rowBytes = Math.ceil(width * channels * bitDepth / 8);

  const raw  = zlib.inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);

  function paeth(a, b, c) {
    const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  }

  let prevLine = new Uint8Array(rowBytes);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (rowBytes + 1)];
    const line   = new Uint8Array(rowBytes);

    for (let i = 0; i < rowBytes; i++) {
      const raw_b = raw[y * (rowBytes + 1) + 1 + i];
      const a = i >= bpp ? line[i - bpp]     : 0;
      const b = prevLine[i];
      const c = i >= bpp ? prevLine[i - bpp] : 0;
      switch (filter) {
        case 0: line[i] = raw_b;                              break;
        case 1: line[i] = (raw_b + a)          & 0xFF;       break;
        case 2: line[i] = (raw_b + b)          & 0xFF;       break;
        case 3: line[i] = (raw_b + ((a+b)>>1)) & 0xFF;       break;
        case 4: line[i] = (raw_b + paeth(a,b,c)) & 0xFF;     break;
      }
    }
    prevLine = line;

    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 4;
      const li = x * channels;
      switch (colorType) {
        case 2: rgba[pi]=line[li]; rgba[pi+1]=line[li+1]; rgba[pi+2]=line[li+2]; rgba[pi+3]=255; break;
        case 6: rgba[pi]=line[li]; rgba[pi+1]=line[li+1]; rgba[pi+2]=line[li+2]; rgba[pi+3]=line[li+3]; break;
        case 0: rgba[pi]=rgba[pi+1]=rgba[pi+2]=line[li]; rgba[pi+3]=255; break;
        case 4: rgba[pi]=rgba[pi+1]=rgba[pi+2]=line[li]; rgba[pi+3]=line[li+1]; break;
      }
    }
  }
  return { width, height, rgba };
}

// ── Center-crop to square ─────────────────────────────────────────────────────
function centerCrop(rgba, srcW, srcH) {
  const size = Math.min(srcW, srcH);
  const ox   = Math.floor((srcW - size) / 2);
  const oy   = Math.floor((srcH - size) / 2);
  const out  = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const si = ((oy + y) * srcW + (ox + x)) * 4;
      const di = (y * size + x) * 4;
      out[di]=rgba[si]; out[di+1]=rgba[si+1]; out[di+2]=rgba[si+2]; out[di+3]=rgba[si+3];
    }
  return { rgba: out, size };
}

// ── Bilinear resize ───────────────────────────────────────────────────────────
function resize(src, srcS, dstS) {
  const dst   = new Uint8Array(dstS * dstS * 4);
  const ratio = srcS / dstS;
  for (let y = 0; y < dstS; y++)
    for (let x = 0; x < dstS; x++) {
      const sx = (x + 0.5) * ratio - 0.5, sy = (y + 0.5) * ratio - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(srcS-1, x0+1);
      const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(srcS-1, y0+1);
      const fx = sx - x0, fy = sy - y0;
      const di = (y * dstS + x) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = src[(y0*srcS+x0)*4+c], tr = src[(y0*srcS+x1)*4+c];
        const bl = src[(y1*srcS+x0)*4+c], br = src[(y1*srcS+x1)*4+c];
        dst[di+c] = Math.round(tl*(1-fx)*(1-fy) + tr*fx*(1-fy) + bl*(1-fx)*fy + br*fx*fy);
      }
    }
  return dst;
}

// ── BMP-format ICO image data ─────────────────────────────────────────────────
function makeBMPData(rgba, size) {
  const andRowBytes = Math.ceil(size / 32) * 4; // 1-bit mask, DWORD-aligned
  const buf = Buffer.alloc(40 + size * size * 4 + andRowBytes * size);

  // BITMAPINFOHEADER
  buf.writeUInt32LE(40,      0);  // biSize
  buf.writeInt32LE(size,     4);  // biWidth
  buf.writeInt32LE(size * 2, 8);  // biHeight doubled — ICO spec requirement
  buf.writeUInt16LE(1,      12);  // biPlanes
  buf.writeUInt16LE(32,     14);  // biBitCount (32-bit BGRA)
  // remaining header fields stay 0 (BI_RGB, no compression)

  // XOR mask: BGRA pixels, rows stored bottom-to-top
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sy = size - 1 - y;
      const si = (sy * size + x) * 4;
      const di = 40 + (y * size + x) * 4;
      buf[di]     = rgba[si + 2]; // B
      buf[di + 1] = rgba[si + 1]; // G
      buf[di + 2] = rgba[si];     // R
      buf[di + 3] = rgba[si + 3]; // A
    }
  }
  // AND mask: all zeros — alpha channel in XOR data handles transparency

  return buf;
}

// ── ICO writer ────────────────────────────────────────────────────────────────
function makeICO(entries) {
  const n   = entries.length;
  const dir = Buffer.alloc(6 + 16 * n);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(n, 4);

  let offset = 6 + 16 * n;
  entries.forEach(({ data, size }, i) => {
    const b = 6 + i * 16;
    dir[b] = dir[b + 1] = size >= 256 ? 0 : size;
    dir[b + 2] = dir[b + 3] = 0;
    dir.writeUInt16LE(1,  b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(data.length, b + 8);
    dir.writeUInt32LE(offset,      b + 12);
    offset += data.length;
  });

  return Buffer.concat([dir, ...entries.map(e => e.data)]);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const srcPath = path.join(__dirname, 'assets', 'pmp-frog.png');
const { width, height, rgba } = readPNG(fs.readFileSync(srcPath));
const { rgba: square, size: squareSize } = centerCrop(rgba, width, height);

const outDir = path.join(__dirname, 'assets');
fs.mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 256];
const entries = sizes.map(s => ({ data: makeBMPData(resize(square, squareSize, s), s), size: s }));
fs.writeFileSync(path.join(outDir, 'icon.ico'), makeICO(entries));
console.log('Icon written to assets/icon.ico');
