import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { clearAccountCache, deleteCurrentAccount } from "@/data/profileRepository";
import { flushOutbox } from "@/data/sync";
import { applyAuthCallback } from "@/lib/auth";
import {
  deleteLocalAccount,
  readSession,
  signOutLocally,
  LocalSession,
  subscribeAuth,
} from "@/lib/localAuth";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { clearUserOutbox } from "@/db/outbox";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string | null;
};

type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  supabaseEnabled: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toUser(
  session: import("@supabase/supabase-js").Session | LocalSession | null,
): SessionUser | null {
  if (!session) return null;
  if ("userId" in session) {
    return { id: session.userId, email: session.email, fullName: session.fullName };
  }
  const name = session.user?.user_metadata?.full_name;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    fullName: typeof name === "string" ? name : null,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    if (supabaseConfigured) {
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
          console.error("Unable to restore Supabase session", error);
        }
        if (mounted) {
          setUser(toUser(data.session));
          setIsLoading(false);
        }
      });

      const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
        if (!mounted) return;
        setUser(toUser(nextSession));
        setIsLoading(false);
        if (nextSession?.user.id) {
          void flushOutbox(nextSession.user.id);
        }
      });

      const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
        applyAuthCallback(url)
          .then(({ type }) => {
            if (type === "recovery") {
              router.replace("/reset-password");
            }
          })
          .catch((error: unknown) => {
            console.error("Unable to apply auth callback", error);
          });
      });

      Linking.getInitialURL().then((url) => {
        if (!url) return;
        applyAuthCallback(url)
          .then(({ type }) => {
            if (type === "recovery") {
              router.replace("/reset-password");
            }
          })
          .catch((error: unknown) => {
            console.error("Unable to apply initial auth callback", error);
          });
      });

      return () => {
        mounted = false;
        data.subscription.unsubscribe();
        linkingSubscription.remove();
      };
    }

    readSession().then((session) => {
      if (mounted) {
        setUser(toUser(session));
        setIsLoading(false);
      }
    });

    const unsubscribe = subscribeAuth((session) => {
      if (mounted) {
        setUser(toUser(session));
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      supabaseEnabled: supabaseConfigured,
      signOut: async () => {
        const userId = user?.id;
        if (supabaseConfigured) {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          if (userId) await clearAccountCache(userId);
          return;
        }
        await signOutLocally();
      },
      deleteAccount: async () => {
        if (supabaseConfigured) {
          await deleteCurrentAccount();
          return;
        }
        const userId = user?.id;
        if (userId) {
          await deleteLocalAccount(userId);
          await clearUserOutbox(userId);
        }
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}