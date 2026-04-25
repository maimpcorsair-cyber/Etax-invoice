/**
 * usePushNotifications — Capacitor FCM push notification setup
 *
 * On mount (native only, when the user is authenticated):
 *   1. Requests notification permission from the OS
 *   2. Registers with FCM via Capacitor
 *   3. POSTs the device token to our backend so the server can fan-out pushes
 *   4. Wires up foreground notification and tap (background) handlers
 *
 * Cleans up all listeners on unmount or when the auth token changes.
 */

import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { isNative } from './useNative';

export function usePushNotifications() {
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!isNative() || !token) return;

    let cancelled = false;
    const removers: Array<{ remove: () => void }> = [];

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // ── 1. Request OS permission ──────────────────────────────────────────
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive !== 'granted') {
          console.warn('usePushNotifications: permission not granted');
          return;
        }

        // ── 2. Register with FCM ──────────────────────────────────────────────
        await PushNotifications.register();

        // ── 3. Receive FCM token → POST to backend ────────────────────────────
        const regListener = await PushNotifications.addListener(
          'registration',
          async (regToken) => {
            if (cancelled) return;
            try {
              const res = await fetch('/api/notifications/fcm-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  token: regToken.value,
                  platform: 'android',
                }),
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                console.error('FCM token registration failed', body);
              }
            } catch (err) {
              console.error('FCM token registration fetch error', err);
            }
          },
        );
        removers.push(regListener);

        // ── 4a. Foreground notification received ──────────────────────────────
        const recvListener = await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            // App is in the foreground — log for now; a toast could be added here
            console.log(
              'usePushNotifications: foreground push',
              notification.title,
              notification.body,
            );
          },
        );
        removers.push(recvListener);

        // ── 4b. Notification tapped while app was backgrounded ────────────────
        const actionListener = await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          (action) => {
            const data = action.notification.data as Record<string, string> | undefined;
            if (data?.invoiceId) {
              // We are outside the React Router tree here so use the hash route
              window.location.hash = `/app/invoices/${data.invoiceId}/edit`;
            }
          },
        );
        removers.push(actionListener);
      } catch (err) {
        console.error('usePushNotifications: setup failed', err);
      }
    })();

    return () => {
      cancelled = true;
      removers.forEach((r) => r.remove());
    };
  }, [token]);
}
