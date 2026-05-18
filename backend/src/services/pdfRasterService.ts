import { logger } from '../config/logger';
import { launchBrowser } from './browserService';

const defaultMaxPages = Number(process.env.PDF_RASTER_FALLBACK_MAX_PAGES ?? 2);

export async function rasterizePdfToPngPages(
  pdf: Buffer,
  maxPages = defaultMaxPages,
): Promise<Buffer[]> {
  if (!pdf.length || maxPages <= 0) return [];

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30_000);
    await page.setViewport({
      width: Number(process.env.PDF_RASTER_VIEWPORT_WIDTH ?? 1400),
      height: Number(process.env.PDF_RASTER_VIEWPORT_HEIGHT ?? 1900),
      deviceScaleFactor: Number(process.env.PDF_RASTER_DEVICE_SCALE ?? 1),
    });

    const dataUrl = `data:application/pdf;base64,${pdf.toString('base64')}`;
    await page.goto(dataUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
    await new Promise((resolve) => setTimeout(resolve, 800));

    const pagesToCapture = Math.max(1, maxPages);
    const images: Buffer[] = [];
    for (let i = 0; i < pagesToCapture; i += 1) {
      if (i > 0) {
        await page.keyboard.press('PageDown').catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      const screenshot = await page.screenshot({ type: 'png', fullPage: false });
      images.push(Buffer.from(screenshot));
    }

    return images;
  } catch (err) {
    logger.warn('[PDF Raster] fallback rasterization failed', {
      error: err instanceof Error ? err.message : String(err),
      bytes: pdf.length,
    });
    return [];
  } finally {
    await browser.close();
  }
}
