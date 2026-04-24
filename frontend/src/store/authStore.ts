import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  authReady: boolean;
  setAuth: (token: string, user: User) => void;
  clearAuth: () => void;
  updateUser: (user: Partial<User>) => void;
  setAuthReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      authReady: false,
      setAuth: (token, user) => set({ token, user, authReady: true }),
      clearAuth: () => set({ token: null, user: null, authReady: true }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      setAuthReady: (ready) => set({ authReady: ready }),
    }),
    {
      name: 'etax_auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
