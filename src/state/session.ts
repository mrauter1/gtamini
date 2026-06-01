import { defaultDistrict, isDistrictId } from "../data/districts";
import type { AppScreen, SessionOptions, SessionState } from "../types";

const STORAGE_KEY = "block-city-run/session";

const defaultOptions: SessionOptions = {
  showControlHints: true,
  reduceMotion: false,
};

const validScreens = new Set<AppScreen>(["menu", "districtSelect", "districtScene"]);

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function createDefaultState(): SessionState {
  return {
    mode: "local",
    screen: "menu",
    selectedDistrictId: defaultDistrict.id,
    paused: false,
    options: { ...defaultOptions },
    lastSavedAt: new Date().toISOString(),
  };
}

function sanitizeOptions(input: unknown): SessionOptions {
  if (!input || typeof input !== "object") {
    return { ...defaultOptions };
  }

  const candidate = input as Partial<SessionOptions>;

  return {
    showControlHints:
      typeof candidate.showControlHints === "boolean"
        ? candidate.showControlHints
        : defaultOptions.showControlHints,
    reduceMotion:
      typeof candidate.reduceMotion === "boolean"
        ? candidate.reduceMotion
        : defaultOptions.reduceMotion,
  };
}

function sanitizeState(input: unknown): SessionState {
  const defaults = createDefaultState();

  if (!input || typeof input !== "object") {
    return defaults;
  }

  const candidate = input as Partial<SessionState>;

  return {
    mode: "local",
    screen: validScreens.has(candidate.screen as AppScreen)
      ? (candidate.screen as AppScreen)
      : defaults.screen,
    selectedDistrictId: isDistrictId(candidate.selectedDistrictId)
      ? candidate.selectedDistrictId
      : defaults.selectedDistrictId,
    paused: typeof candidate.paused === "boolean" ? candidate.paused : defaults.paused,
    options: sanitizeOptions(candidate.options),
    lastSavedAt:
      typeof candidate.lastSavedAt === "string" ? candidate.lastSavedAt : defaults.lastSavedAt,
  };
}

function loadState(): SessionState {
  const storage = getStorage();

  if (!storage) {
    return createDefaultState();
  }

  const raw = storage.getItem(STORAGE_KEY);

  if (!raw) {
    return createDefaultState();
  }

  try {
    return sanitizeState(JSON.parse(raw));
  } catch {
    return createDefaultState();
  }
}

function persistState(state: SessionState): void {
  const storage = getStorage();

  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export interface SessionStore {
  getState(): SessionState;
  setState(updater: SessionState | ((current: SessionState) => SessionState)): void;
  subscribe(listener: (state: SessionState) => void): () => void;
}

export function createSessionStore(): SessionStore {
  let state = loadState();
  const listeners = new Set<(state: SessionState) => void>();

  const commit = (nextState: SessionState): void => {
    state = {
      ...nextState,
      lastSavedAt: new Date().toISOString(),
    };

    persistState(state);
    listeners.forEach((listener) => listener(state));
  };

  return {
    getState() {
      return state;
    },
    setState(updater) {
      const candidate = typeof updater === "function" ? updater(state) : updater;
      commit(sanitizeState(candidate));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
