import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { login as loginRequest, logout as logoutRequest } from '../api/authApi';
import { clearTokens, hasStoredSession } from '../api/client';
import { getMe } from '../api/meteringApi';
import type { UserProfile } from '../types/metering';

type AuthContextValue = {
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = async () => {
    const nextProfile = await getMe();
    setProfile(nextProfile);
  };

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      try {
        if (!(await hasStoredSession())) {
          if (mounted) setProfile(null);
          return;
        }
        const nextProfile = await getMe();
        if (mounted) setProfile(nextProfile);
      } catch (error) {
        await clearTokens();
        if (mounted) setProfile(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    profile,
    isLoading,
    isAuthenticated: !!profile,
    signIn: async (email: string, password: string) => {
      await loginRequest(email, password);
      await refreshProfile();
    },
    signOut: async () => {
      await logoutRequest();
      setProfile(null);
    },
    refreshProfile,
  }), [profile, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
