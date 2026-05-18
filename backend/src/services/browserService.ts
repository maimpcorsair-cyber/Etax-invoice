import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer';
import { logger } from '../config/logger';

/**
 * Centralized headless-Chrome launcher for PDF + raster work.
 *
 * On Render we ship via a Dockerfile that installs Alpine Chromium and
 * sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`. Puppeteer
 * v22 normally picks that up automatically — but reading it explicitly
 * here means:
 *
 *   - the executable path is visible in logs (one-time debug emission),
 *     so a misconfigured deploy fails loudly instead of silently using
 *     a bundled Chrome that doesn't exist on this image, and
 *
 *   - the four call sites (pdfService, whtCertificatePdf, pdfRasterService,
 *     plus the health probe) share one set of launch flags. Previously
 *     each copy could drift independently.
 */

const BASE_ARGS = [
  '--no-sandbox',           // required for `etax` non-root user inside container
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage', // Render's /dev/shm is small; spill to /tmp
];

let pathLogged = false;

export async function launchBrowser(extra: Partial<LaunchOptions> = {}): Promise<Browser> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!pathLogged) {
    logger.info('[browser] launching headless chrome', {
      executablePath: executablePath ?? '(puppeteer default)',
      argCount: BASE_ARGS.length,
    });
    pathLogged = true;
  }
  try {
    return await puppeteer.launch({
      headless: true,
      args: BASE_ARGS,
      executablePath,
      ...extra,
    });
  } catch (err) {
    logger.error('[browser] failed to launch chrome', {
      error: err instanceof Error ? err.message : String(err),
      executablePath: executablePath ?? '(puppeteer default)',
    });
    throw err;
  }
}
