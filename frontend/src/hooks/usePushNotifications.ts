// Push notifications were Capacitor-only (FCM on Android via the native
// shell). Native builds were removed when the team committed to web-only;
// this hook is now a no-op so its existing call site in App.tsx keeps
// working without churn. If the team adds Web Push later, wire it here.
export function usePushNotifications(): void {
  // intentionally empty
}
