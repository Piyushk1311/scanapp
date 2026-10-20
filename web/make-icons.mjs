// Generates PNG icons without dependencies. Run: node make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const s = size / 512;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const X = x / s, Y = y / s;
      let c = [23, 105, 255]; // brand blue background (full bleed so it works as maskable)
      const inPage = X > 150 && X < 362 && Y > 110 && Y < 402 && !(X > 300 && Y < 160 && (X - 300) + (160 - Y) > 60 - 0);
      const fold = X >= 300 && X < 362 && Y >= 110 && Y < 172 && (X - 300) + (172 - Y) > 62;
      if (inPage) c = [255, 255, 255];
      if (fold) c = [200, 218, 255];
      const line = inPage && X > 185 && X < 327 && [230, 262, 294, 326, 358].some((ly) => Math.abs(Y - ly) < 6);
      if (line) c = [23, 105, 255];
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync('icons', { recursive: true });
for (const n of [180, 192, 512]) writeFileSync(`icons/icon-${n}.png`, png(n));
console.log('icons written');
