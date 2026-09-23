import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

/**
 * Local-first identity store. Used when Supabase is not configured so the
 * app remains fully functional offline. Accounts are stored on-device:
 * passwords are salted SHA-256 digests, not plaintext.
 *
 * Notes (honest by design):
 * - The digest is not a slow KDF. This protects against casual reading,
 *   not a determined local attacker with access to the device storage.
 * - There is no server to send reset emails from, so local password
 *   recovery is intentionally not available.
 */

export type LocalUser = {
  id: string;
  email: string;
  fullName: string | null;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

export type LocalSession = {
  userId: string;
  email: string;
  fullName: string | null;
  createdAt: string;
  expiresAt: string;
};

export type AuthSession = {
  user: { id: string; email: string; fullName: string | null } | null;
  isLoading: boolean;
};

const USERS_KEY = "thrivelens:local_users";
const SESSION_KEY = "thrivelens:local_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type Listener = (session: LocalSession | null) => void;

const listeners = new Set<Listener>();

function notify(session: LocalSession | null) {
  for (const listener of listeners) {
    listener(session);
  }
}

export function subscribeAuth(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSessionExpired(session: LocalSession): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

async function readUsers(): Promise<LocalUser[]> {
  const raw = await AsyncStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LocalUser[];
  } catch {
    return [];
  }
}

async function writeUsers(users: LocalUser[]) {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${password}`,
  );
  return digest;
}

export async function readSession(): Promise<LocalSession | null> {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as LocalSession;
    if (isSessionExpired(session)) {
      await AsyncStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export async function signUpLocally(input: {
  email: string;
  password: string;
  fullName: string | null;
}): Promise<LocalSession> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  if (input.password.length < 6) {
    throw new Error("Password must be at least 6 characters.");
  }

  const users = await readUsers();
  if (users.some((user) => user.email === email)) {
    throw new Error("An account with this email already exists.");
  }

  const salt = Crypto.randomUUID();
  const user: LocalUser = {
    id: Crypto.randomUUID(),
    email,
    fullName: input.fullName?.trim() || null,
    passwordSalt: salt,
    passwordHash: await hashPassword(input.password, salt),
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  await writeUsers(users);

  const session = createSession(user);
  await persistSession(session);
  return session;
}

export async function signInLocally(input: {
  email: string;
  password: string;
}): Promise<LocalSession> {
  const email = input.email.trim().toLowerCase();
  const users = await readUsers();
  const user = users.find((candidate) => candidate.email === email);
  if (!user) {
    throw new Error("No account found for this email.");
  }
  const attemptHash = await hashPassword(input.password, user.passwordSalt);
  if (attemptHash !== user.passwordHash) {
    throw new Error("Incorrect password. Try again.");
  }

  const session = createSession(user);
  await persistSession(session);
  return session;
}

async function persistSession(session: LocalSession) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notify(session);
}

export async function signOutLocally() {
  await AsyncStorage.removeItem(SESSION_KEY);
  notify(null);
}

export async function deleteLocalAccount(userId: string) {
  const users = await readUsers();
  await writeUsers(users.filter((user) => user.id !== userId));
  await AsyncStorage.removeItem(SESSION_KEY);
  await AsyncStorage.removeItem(`profile:${userId}`);
  notify(null);
}

function createSession(user: LocalUser): LocalSession {
  const now = Date.now();
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
}