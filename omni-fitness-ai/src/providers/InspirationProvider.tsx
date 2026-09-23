import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { MOTIVATIONS, type Motivation } from '../data/motivations';

const STORAGE_KEY = 'thrivelens.inspiration.v1';
const RETURN_AFTER_MS = 30 * 60 * 1000;
const VALID_IDS = new Set(MOTIVATIONS.map((item) => item.id));

type StoredInspiration = {
  version: 1;
  currentId: string;
  date: string;
  history: string[];
};

type InspirationSnapshot = {
  message: Motivation;
  ready: boolean;
  /** Changes for cold starts and returns after 30 minutes, never for manual next. */
  launchRevision: number;
};

type InspirationContextValue = InspirationSnapshot & { nextMessage: () => void };

// This is the only persistence boundary. Blocked browser storage or unavailable
// native storage gracefully leaves inspiration working for the current session.
const inspirationStorage = {
  async read(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        const storage = (globalThis as typeof globalThis & {
          localStorage?: { getItem: (key: string) => string | null };
        }).localStorage;
        return storage?.getItem(STORAGE_KEY) ?? null;
      }
      return await SecureStore.getItemAsync(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async write(value: StoredInspiration): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (Platform.OS === 'web') {
        const storage = (globalThis as typeof globalThis & {
          localStorage?: { setItem: (key: string, value: string) => void };
        }).localStorage;
        storage?.setItem(STORAGE_KEY, serialized);
      } else {
        await SecureStore.setItemAsync(STORAGE_KEY, serialized);
      }
    } catch {
      // Persistence is optional; reading a message must always work offline.
    }
  },
};

function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function readStoredInspiration(raw: string | null): StoredInspiration | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const saved = value as Partial<StoredInspiration>;
    if (saved.version !== 1 || typeof saved.currentId !== 'string' ||
        !VALID_IDS.has(saved.currentId) || typeof saved.date !== 'string' ||
        !Array.isArray(saved.history)) return null;
    const history = [...new Set(saved.history.filter(
      (id): id is string => typeof id === 'string' && VALID_IDS.has(id),
    ))];
    if (!history.includes(saved.currentId)) history.push(saved.currentId);
    return { version: 1, currentId: saved.currentId, date: saved.date, history };
  } catch {
    return null;
  }
}

// Keep one session outside React so effect replay, navigation, and provider
// remounts cannot select a second "cold start" message or race storage writes.
let snapshot: InspirationSnapshot = {
  message: MOTIVATIONS[0], ready: false, launchRevision: 0,
};
let stored: StoredInspiration | null = null;
let initialization: Promise<void> | null = null;
let workQueue: Promise<void> = Promise.resolve();
const listeners = new Set<(value: InspirationSnapshot) => void>();

function enqueue(operation: () => Promise<void>): Promise<void> {
  const pending = workQueue.then(operation);
  workQueue = pending.catch(() => undefined);
  return pending;
}

async function rotateMessage(announceLaunch: boolean): Promise<void> {
  const previousId = stored?.currentId;
  let history = stored?.history ?? [];
  let available = MOTIVATIONS.filter((item) => !history.includes(item.id) && item.id !== previousId);
  if (available.length === 0) {
    // Finish the whole catalog before repeating; retain the previous selection
    // at a cycle boundary so two consecutive messages can never be identical.
    history = previousId ? [previousId] : [];
    available = MOTIVATIONS.filter((item) => item.id !== previousId);
  }
  const message = available[Math.floor(Math.random() * available.length)] ?? MOTIVATIONS[0];
  stored = {
    version: 1,
    currentId: message.id,
    date: localDateKey(),
    history: [...history, message.id],
  };
  snapshot = {
    message,
    ready: true,
    launchRevision: snapshot.launchRevision + (announceLaunch ? 1 : 0),
  };
  listeners.forEach((listener) => listener(snapshot));
  await inspirationStorage.write(stored);
}

function initialize(): Promise<void> {
  if (!initialization) {
    initialization = enqueue(async () => {
      stored = readStoredInspiration(await inspirationStorage.read());
      await rotateMessage(true);
    });
  }
  return initialization;
}

async function refreshForDateOrReturn(longReturn = false): Promise<void> {
  await initialize();
  await enqueue(async () => {
    if (longReturn || stored?.date !== localDateKey()) await rotateMessage(longReturn);
  });
}

function nextMessage(): void {
  void initialize().then(() => enqueue(() => rotateMessage(false)));
}

const InspirationContext = createContext<InspirationContextValue | null>(null);

export function InspirationProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<InspirationSnapshot>(snapshot);

  useEffect(() => {
    let disposed = false;
    let appState = AppState.currentState;
    let leftAt: number | null = null;
    let midnightTimer: ReturnType<typeof setTimeout> | undefined;

    const onChange = (next: InspirationSnapshot) => {
      if (!disposed) setValue(next);
    };
    listeners.add(onChange);
    void initialize();

    const scheduleMidnight = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      if (disposed || appState === 'background' || appState === 'inactive') return;
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = setTimeout(() => {
        // A calendar rollover refreshes the card without interrupting activity
        // with a launch overlay. No short-interval text carousel is used.
        void refreshForDateOrReturn().finally(scheduleMidnight);
      }, midnight.getTime() - now.getTime() + 250);
    };
    scheduleMidnight();

    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasActive = appState === 'active' || appState == null;
      if (nextState !== 'active' && wasActive && leftAt === null) leftAt = Date.now();
      if (nextState === 'active' && !wasActive) {
        const longReturn = leftAt !== null && Date.now() - leftAt >= RETURN_AFTER_MS;
        leftAt = null;
        void refreshForDateOrReturn(longReturn);
      }
      appState = nextState;
      scheduleMidnight();
    });

    return () => {
      disposed = true;
      listeners.delete(onChange);
      subscription.remove();
      if (midnightTimer) clearTimeout(midnightTimer);
    };
  }, []);

  return (
    <InspirationContext.Provider value={{ ...value, nextMessage }}>
      {children}
    </InspirationContext.Provider>
  );
}

export function useInspiration(): InspirationContextValue {
  const value = useContext(InspirationContext);
  if (!value) throw new Error('useInspiration must be used inside InspirationProvider.');
  return value;
}
