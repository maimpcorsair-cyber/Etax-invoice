import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { buildPlaneUrl, detectSurface, readAuthHandoff, stripAuthHandoff } from '../lib/platform';

export function useAuthBootstrap() {
  const { token, authReady, updateUser, clearAuth, setAuthReady, setAuth } = useAuthStore();
  const [storeHydrated, setStoreHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setStoreHydrated(true);
      return undefined;
    }

    const unsubscribe = useAuthStore.persist.onFinishHydration(() => {
      setStoreHydrated(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handoff = readAuthHandoff();

    if (!handoff) {
      return;
    }

    setAuth(handoff.token, handoff.user);
    window.history.replaceState({}, document.title, stripAuthHandoff());
  }, [setAuth]);

  useEffect(() => {
    let cancelled = false;

    if (!storeHydrated) {
      return () => {
        cancelled = true;
      };
    }

    async function bootstrap() {
      if (!token) {
        setAuthReady(true);
        return;
      }

      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (!cancelled) {
            clearAuth();
          }
          return;
        }

        const user = (await res.json()) as {
          id: string;
          email: string;
          name: string;
          role: 'super_admin' | 'admin' | 'accountant' | 'viewer';
          companyId: string;
          auth?: {
            hasPassword: boolean;
            hasGoogle: boolean;
          };
          company?: {
            nameTh: string;
            nameEn?: string | null;
            taxId: string;
          };
          line?: {
            linked: boolean;
            displayName?: string | null;
            pictureUrl?: string | null;
          };
        };

        if (!cancelled) {
          updateUser(user);
          setAuthReady(true);

          // Public, token-protected pages (share links, portals, invites,
          // verify pages, etc.) intentionally do NOT belong to either the
          // app or ops surface — they get the apex domain so they can be
          // opened by buyers / guests without redirecting them into the
          // seller's workspace. Without this guard a logged-in seller who
          // opens their own share link would bounce to /app/dashboard
          // instead of seeing the public view their customer sees.
          const path = window.location.pathname;
          const isPublicTokenRoute =
            path.startsWith('/share/') ||
            path.startsWith('/portal') ||
            path.startsWith('/intake-edit/') ||
            path.startsWith('/project-portal/') ||
            path.startsWith('/invoices/verify/') ||
            path.startsWith('/join/') ||
            path.startsWith('/account/cancel-delete') ||
            path.startsWith('/accept-invite');

          const surface = detectSurface();
          if (surface === 'apex' && !isPublicTokenRoute) {
            window.location.replace(
              user.role === 'super_admin'
                ? buildPlaneUrl('/ops/overview', 'ops', { token, user })
                : buildPlaneUrl('/app/dashboard', 'app', { token, user }),
            );
            return;
          }

          if (surface === 'ops' && user.role !== 'super_admin') {
            window.location.replace(buildPlaneUrl('/app/dashboard', 'app', { token, user }));
          }
        }
      } catch {
        if (!cancelled) {
          clearAuth();
        }
      }
    }

    if (!authReady) {
      bootstrap();
    }

    return () => {
      cancelled = true;
    };
  }, [token, authReady, updateUser, clearAuth, setAuthReady, storeHydrated]);
}
