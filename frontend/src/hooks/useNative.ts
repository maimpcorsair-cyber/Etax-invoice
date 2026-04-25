/**
 * useNative — Capacitor native feature utilities
 *
 * Detects whether the app is running inside a Capacitor native shell
 * (Android / iOS) and provides platform-aware helpers for:
 *   - Camera / photo picker
 *   - Save PDF to device filesystem
 *   - Share PDF via native share sheet (LINE, Email, etc.)
 *   - Android back-button handling
 *
 * Falls back gracefully to web behaviour when running in the browser.
 */

import { useEffect, useCallback } from 'react';

// Lazy-import Capacitor plugins so the web bundle doesn't break when
// the native shell is absent.
const isNative = (): boolean =>
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform === 'function' &&
  ((window as unknown as { Capacitor: { isNativePlatform: () => boolean } })
    .Capacitor.isNativePlatform() ?? false);

/* ─── Camera / Photo picker ─── */
export async function pickImageNative(): Promise<string | null> {
  if (!isNative()) return null;
  try {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt, // lets user pick Camera OR Photos
    });
    return image.dataUrl ?? null;
  } catch {
    // User cancelled or permission denied
    return null;
  }
}

/* ─── Save PDF to device Downloads / Files ─── */
export async function savePdfNative(
  pdfBlob: Blob,
  filename: string,
): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Convert blob → base64
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // strip "data:application/pdf;base64," prefix
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Documents,
      // Encoding omitted for binary (base64) files
    } as Parameters<typeof Filesystem.writeFile>[0]);

    return true;
  } catch (e) {
    console.error('savePdfNative error', e);
    return false;
  }
}

/* ─── Share PDF via native share sheet ─── */
export async function sharePdfNative(
  pdfBlob: Blob,
  filename: string,
  title: string,
): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    // Write temp file first, then share its URI
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    const tempPath = `tmp_${filename}`;
    await Filesystem.writeFile({
      path: tempPath,
      data: base64,
      directory: Directory.Cache,
    } as Parameters<typeof Filesystem.writeFile>[0]);

    const { uri } = await Filesystem.getUri({
      path: tempPath,
      directory: Directory.Cache,
    });

    await Share.share({
      title,
      url: uri,
      dialogTitle: title,
    });

    return true;
  } catch (e) {
    console.error('sharePdfNative error', e);
    return false;
  }
}

/* ─── Android back-button handler ─── */
export function useAndroidBackButton(onBack: () => void) {
  const handler = useCallback(onBack, [onBack]);

  useEffect(() => {
    if (!isNative()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      const { App } = await import('@capacitor/app');
      const listener = await App.addListener('backButton', handler);
      cleanup = () => listener.remove();
    })();

    return () => {
      cleanup?.();
    };
  }, [handler]);
}

export { isNative };
