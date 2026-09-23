import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Provider, Session } from "@supabase/supabase-js";
import { readSession, signInLocally, signUpLocally } from "./localAuth";
import { supabase, supabaseConfigured } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export async function currentUser(): Promise<CurrentUser | null> {
  if (supabaseConfigured) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const name = data.user.user_metadata?.full_name;
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      fullName: typeof name === "string" ? name : null,
    };
  }
  const session = await readSession();
  if (!session) return null;
  return { id: session.userId, email: session.email, fullName: session.fullName };
}

export async function currentUserId(): Promise<string | null> {
  const user = await currentUser();
  return user?.id ?? null;
}

export type AuthResult = {
  error: { message: string } | null;
  needsEmailConfirmation?: boolean;
};

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  if (supabaseConfigured) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? { message: error.message } : null };
  }
  try {
    await signInLocally({ email, password });
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Unable to sign in.",
      },
    };
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string,
): Promise<AuthResult> {
  if (supabaseConfigured) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) return { error: { message: error.message } };
    return { error: null, needsEmailConfirmation: !data.session };
  }
  try {
    await signUpLocally({ email, password, fullName });
    return { error: null };
  } catch (error) {
    return {
      error: {
        message: error instanceof Error ? error.message : "Unable to create account.",
      },
    };
  }
}

/**
 * Honest reset behavior: hosted Supabase sends a real email; local-only
 * accounts are stored on-device and cannot receive email, so we refuse
 * instead of pretending to send.
 */
export async function sendPasswordResetEmail(
  email: string,
): Promise<{ error: { message: string } | null }> {
  if (supabaseConfigured) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl,
    });
    return { error: error ? { message: error.message } : null };
  }
  return {
    error: {
      message:
        "Local accounts live on this device and can't receive reset emails. " +
        "Use Sign in with the email and password you chose at sign up.",
    },
  };
}

export async function updatePassword(
  password: string,
): Promise<{ error: { message: string } | null }> {
  if (supabaseConfigured) {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? { message: error.message } : null };
  }
  return {
    error: {
      message: "Local accounts are stored on this device only.",
    },
  };
}

export const authRedirectUrl = Linking.createURL("auth/callback", {
  scheme: "thrivelens",
});

function getCallbackParams(url: string) {
  const parsed = Linking.parse(url);
  const fragment = url.split("#")[1] ?? "";
  const fragmentParams = new URLSearchParams(fragment);
  const queryParams = new URLSearchParams(parsed.queryParams as Record<string, string>);

  return {
    accessToken: fragmentParams.get("access_token") ?? queryParams.get("access_token"),
    refreshToken: fragmentParams.get("refresh_token") ?? queryParams.get("refresh_token"),
    type: fragmentParams.get("type") ?? queryParams.get("type"),
  };
}

export async function applyAuthCallback(url: string): Promise<{
  session: Session | null;
  type: string | null;
}> {
  const { accessToken, refreshToken, type } = getCallbackParams(url);

  if (!accessToken || !refreshToken) {
    return { session: null, type };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    throw error;
  }

  return { session: data.session, type };
}

export async function signInWithProvider(provider: Provider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: authRedirectUrl,
      skipBrowserRedirect: true,
    },
  });

  if (error) {
    throw error;
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUrl);

  if (result.type !== "success") {
    return null;
  }

  const { session } = await applyAuthCallback(result.url);
  return session;
}
