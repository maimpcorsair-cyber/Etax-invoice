import { deflateSync } from 'zlib';
import { logger } from '../config/logger';

const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';

// ── PNG generator (pure Node.js, no deps) ─────────────────────────────────────

function crc32(buf: Buffer): number {
  const table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = (table[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

// 5×9 pixel-art font for A-Z and ฿ (space = 0)
const FONT5X9: Record<string, number[]> = {
  ' ': [0,0,0,0,0,0,0,0,0],
  'T': [0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100,0],
  'A': [0b00100,0b01010,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001,0],
  'X': [0b10001,0b10001,0b01010,0b00100,0b01010,0b10001,0b10001,0b10001,0],
  'E': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000,0b11111,0],
  'S': [0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b00001,0b11110,0],
  'O': [0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110,0],
  'V': [0b10001,0b10001,0b10001,0b10001,0b10001,0b01010,0b01010,0b00100,0],
  'R': [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001,0b10001,0],
  'D': [0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110,0],
  'U': [0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110,0],
  'C': [0b01110,0b10001,0b10000,0b10000,0b10000,0b10000,0b10001,0b01110,0],
  'H': [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001,0b10001,0],
  'L': [0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111,0],
  'P': [0b11110,0b10001,0b10001,0b11110,0b10000,0b10000,0b10000,0b10000,0],
  'Y': [0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100,0b00100,0],
  'I': [0b01110,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100,0b01110,0],
  'N': [0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001,0b10001,0],
  'G': [0b01110,0b10001,0b10000,0b10000,0b10111,0b10001,0b10001,0b01111,0],
  'F': [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b10000,0b10000,0],
  'W': [0b10001,0b10001,0b10001,0b10101,0b10101,0b10101,0b01010,0b01010,0],
  'K': [0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001,0b10001,0],
  'B': [0b11110,0b10001,0b10001,0b11110,0b10001,0b10001,0b10001,0b11110,0],
  'Z': [0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b10000,0b11111,0],
  'M': [0b10001,0b11011,0b10101,0b10001,0b10001,0b10001,0b10001,0b10001,0],
  '฿': [0b01110,0b10101,0b10100,0b01110,0b10101,0b10101,0b10101,0b01110,0],
};

function drawText(
  pixels: Uint8Array, W: number,
  text: string, startX: number, startY: number,
  r: number, g: number, b: number,
  scale = 2,
) {
  let cx = startX;
  for (const ch of text.toUpperCase()) {
    const rows = FONT5X9[ch] ?? FONT5X9[' '];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 5; col++) {
        if (rows[row] & (1 << (4 - col))) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + col * scale + sx;
              const py = startY + row * scale + sy;
              if (px < W && py < W * 10) {
                const idx = (py * W + px) * 3;
                pixels[idx] = r; pixels[idx+1] = g; pixels[idx+2] = b;
              }
            }
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

export function generateRichMenuPNG(): Buffer {
  const W = 1200, H = 810;
  const pixels = new Uint8Array(W * H * 3);

  // 6 block colors (3 cols × 2 rows)
  const blocks = [
    { r: 37,  g: 99,  b: 235, label: 'TAXES'   }, // blue
    { r: 22,  g: 163, b: 74,  label: 'OVERDUE'  }, // green
    { r: 124, g: 58,  b: 237, label: 'SEARCH'   }, // purple
    { r: 234, g: 88,  b: 12,  label: 'UPLOAD'   }, // orange
    { r: 8,   g: 145, b: 178, label: 'HELP'     }, // teal
    { r: 75,  g: 85,  b: 99,  label: 'SYSTEM'   }, // gray
  ];

  const cW = Math.floor(W / 3), cH = Math.floor(H / 2);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const col = Math.min(2, Math.floor(x / cW));
      const row = Math.min(1, Math.floor(y / cH));
      const bi = row * 3 + col;
      const { r, g, b } = blocks[bi];

      const hSep = Math.abs(y - cH) < 3;
      const vSep1 = Math.abs(x - cW) < 3;
      const vSep2 = Math.abs(x - cW * 2) < 3;
      const idx = (y * W + x) * 3;

      if (hSep || vSep1 || vSep2) {
        pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255;
      } else {
        // Slight inner highlight
        const bx = (x % cW) / cW, by = (y % cH) / cH;
        const f = 1 + 0.12 * Math.min(bx, 1-bx) * Math.min(by, 1-by) * 4;
        pixels[idx] = Math.min(255, r * f | 0);
        pixels[idx+1] = Math.min(255, g * f | 0);
        pixels[idx+2] = Math.min(255, b * f | 0);
      }
    }
  }

  // Draw labels (white text, scale 3)
  blocks.forEach((bl, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const textW = bl.label.length * 18; // 6*3 per char
    const cx = col * cW + (cW - textW) / 2;
    const cy = row * cH + (cH - 27) / 2; // 9*3=27 height
    drawText(pixels, W, bl.label, cx | 0, cy | 0, 255, 255, 255, 3);
  });

  // Build PNG
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(W, 0); ihdrData.writeUInt32BE(H, 4);
  ihdrData[8] = 8; ihdrData[9] = 2; // 8-bit RGB
  const ihdr = pngChunk('IHDR', ihdrData);

  // Build scanlines (filter byte 0 + row pixels)
  const scanlines = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    scanlines[y * (1 + W * 3)] = 0; // filter None
    scanlines.set(pixels.subarray(y * W * 3, (y+1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = pngChunk('IDAT', deflateSync(scanlines, { level: 6 }));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── LINE Rich Menu API ────────────────────────────────────────────────────────

interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: string; label: string; text?: string; data?: string; displayText?: string; uri?: string };
}

function buildRichMenuBody(): object {
  const W = 1200, H = 810;
  const cW = W / 3, cH = H / 2;

  const areas: RichMenuArea[] = [
    { bounds: { x: 0,      y: 0,   width: cW, height: cH }, action: { type: 'message', label: 'สรุปภาษี',     text: 'สรุปภาษี' } },
    { bounds: { x: cW,     y: 0,   width: cW, height: cH }, action: { type: 'message', label: 'ใบเกินกำหนด', text: 'ใบเกินกำหนด' } },
    { bounds: { x: cW*2,   y: 0,   width: cW, height: cH }, action: { type: 'message', label: 'ค้นหาใบ',      text: 'วิธีค้นหาใบ' } },
    { bounds: { x: 0,      y: cH,  width: cW, height: cH }, action: { type: 'message', label: 'อัพโหลดเอกสาร', text: 'วิธีอัพโหลดเอกสาร' } },
    { bounds: { x: cW,     y: cH,  width: cW, height: cH }, action: { type: 'message', label: 'วิธีใช้',       text: 'ช่วยเหลือ' } },
    { bounds: { x: cW*2,   y: cH,  width: cW, height: cH }, action: { type: 'uri',     label: 'เปิดระบบ',     uri: 'https://etax-invoice.vercel.app' } },
  ];

  return {
    size: { width: W, height: H },
    selected: true,
    name: 'พี่นุช เมนูหลัก',
    chatBarText: '📋 เมนูพี่นุช',
    areas,
  };
}

async function lineApi(path: string, method: string, body?: object | Buffer, contentType = 'application/json'): Promise<{ ok: boolean; id?: string; error?: string }> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${TOKEN()}`,
    'Content-Type': contentType,
  };
  const res = await fetch(`https://api.line.me${path}`, {
    method,
    headers,
    body: body instanceof Buffer ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, error: `${res.status} ${text}` };
  try {
    const json = JSON.parse(text) as { richMenuId?: string };
    return { ok: true, id: json.richMenuId };
  } catch { return { ok: true }; }
}

export async function setupRichMenu(): Promise<{ ok: boolean; richMenuId?: string; error?: string }> {
  if (!TOKEN()) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not set' };

  // 1. Create rich menu
  const createRes = await lineApi('/v2/bot/richmenu', 'POST', buildRichMenuBody());
  if (!createRes.ok || !createRes.id) {
    logger.error('[RichMenu] Create failed', { error: createRes.error });
    return { ok: false, error: createRes.error };
  }
  const richMenuId = createRes.id;
  logger.info('[RichMenu] Created', { richMenuId });

  // 2. Upload image
  const png = generateRichMenuPNG();
  const uploadRes = await lineApi(
    `/v2/bot/richmenu/${richMenuId}/content`,
    'POST',
    png,
    'image/png',
  );
  if (!uploadRes.ok) {
    logger.error('[RichMenu] Image upload failed', { error: uploadRes.error });
    return { ok: false, error: uploadRes.error };
  }
  logger.info('[RichMenu] Image uploaded');

  // 3. Set as default for all users
  const defaultRes = await lineApi(`/v2/bot/user/all/richmenu/${richMenuId}`, 'POST');
  if (!defaultRes.ok) {
    logger.warn('[RichMenu] Set default failed (non-fatal)', { error: defaultRes.error });
  }

  logger.info('[RichMenu] Setup complete', { richMenuId });
  return { ok: true, richMenuId };
}
