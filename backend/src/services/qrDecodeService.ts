import jsQR from 'jsqr';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { logger } from '../config/logger';

export interface QrDecodeResult {
  ok: boolean;
  text?: string;
  format?: 'qr';
  error?: string;
}

function rgbaToClampedArray(data: Uint8Array | Buffer) {
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

export function decodeQrFromImage(buffer: Buffer, mimeType: string): QrDecodeResult {
  try {
    const lowerMime = mimeType.toLowerCase();
    let width = 0;
    let height = 0;
    let rgba: Uint8ClampedArray;

    if (lowerMime.includes('png')) {
      const png = PNG.sync.read(buffer);
      width = png.width;
      height = png.height;
      rgba = rgbaToClampedArray(png.data);
    } else if (lowerMime.includes('jpeg') || lowerMime.includes('jpg')) {
      const jpg = jpeg.decode(buffer, { useTArray: true });
      width = jpg.width;
      height = jpg.height;
      rgba = rgbaToClampedArray(jpg.data);
    } else {
      return { ok: false, error: `QR decode does not support ${mimeType}` };
    }

    const decoded = jsQR(rgba, width, height);
    if (!decoded?.data) {
      return { ok: false, error: 'QR not found' };
    }

    return { ok: true, text: decoded.data, format: 'qr' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('[QR] decode failed', { error: message, mimeType });
    return { ok: false, error: message };
  }
}
