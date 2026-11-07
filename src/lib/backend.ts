// One interface, two implementations:
//  - tauriBackend: the real desktop app (on-device speech, paste, Markdown files).
//  - previewBackend: the same screens in a plain browser, used only so Seldon's QA
//    agent can test the UI at http://localhost:1420. Speech is simulated with the
//    real engine's output for the bundled sample clip, and the UI says so.

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Bootstrap, Entry, Settings, Transcript } from "./types";
import { DEFAULT_SETTINGS } from "./types";

export interface NewEntry {
  text: string;
  durationSeconds: number;
  model: string;
  polished: boolean;
  source: "sample" | "test" | "dictation";
}

export interface Backend {
  kind: "app" | "preview";
  bootstrap(): Promise<Bootstrap>;
  saveSettings(s: Settings): Promise<Settings>;
  transcribeSample(): Promise<Transcript>;
  startTestRecording(): Promise<void>;
  stopTestRecording(): Promise<Transcript | null>;
  saveEntry(e: NewEntry): Promise<Entry | null>;
  finalizeDictation(id: number, text: string, polished: boolean): Promise<Entry | null>;
  listHistory(): Promise<Entry[]>;
  deleteEntry(id: string): Promise<void>;
  copyText(text: string): Promise<void>;
  openHistoryFolder(): Promise<void>;
  chooseHistoryFolder(): Promise<string | null>;
  chooseModelFile(): Promise<string | null>;
  openPermissionSettings(which: "accessibility" | "microphone"): Promise<void>;
  permissionStatus(): Promise<{ accessibility: boolean }>;
  setApiKey(key: string): Promise<void>;
  clearApiKey(): Promise<void>;
  polishText(text: string): Promise<string>;
  restartHotkey(): Promise<string | null>;
  on<T>(event: string, cb: (payload: T) => void): Promise<() => void>;
}

const tauriBackend: Backend = {
  kind: "app",
  bootstrap: () => invoke("get_bootstrap"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  transcribeSample: () => invoke("transcribe_sample"),
  startTestRecording: () => invoke("start_test_recording"),
  stopTestRecording: () => invoke("stop_test_recording"),
  saveEntry: (e) => invoke("save_entry", { ...e }),
  finalizeDictation: (id, text, polished) => invoke("finalize_dictation", { id, text, polished }),
  listHistory: () => invoke("list_history"),
  deleteEntry: (id) => invoke("delete_entry", { id }),
  copyText: (text) => invoke("copy_text", { text }),
  openHistoryFolder: () => invoke("open_history_folder"),
  chooseHistoryFolder: () => invoke("choose_history_folder"),
  chooseModelFile: () => invoke("choose_model_file"),
  openPermissionSettings: (which) => invoke("open_permission_settings", { which }),
  permissionStatus: () => invoke("permission_status"),
  setApiKey: (key) => invoke("set_api_key", { key }),
  clearApiKey: () => invoke("clear_api_key"),
  polishText: (text) => invoke("polish_text", { text }),
  restartHotkey: () => invoke("restart_hotkey"),
  on: async (event, cb) => listen(event, (e) => cb(e.payload as never)),
};

// ---------- preview mode (browser only, for QA) ----------

const PREVIEW_SAMPLE_RAW =
  "Hey, it's Mr. Joe, um, remind me to send the budget to Priya by Friday. New paragraph, also, ah, send the notes to my email.";
const LS_SETTINGS = "joe-preview-settings";
const LS_HISTORY = "joe-preview-history";

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function readHistory(): Entry[] {
  try {
    return JSON.parse(localStorage.getItem(LS_HISTORY) ?? "[]") as Entry[];
  } catch {
    return [];
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: preview keeps working in memory */
  }
}

const listeners = new Map<string, Set<(p: unknown) => void>>();
function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((cb) => cb(payload));
}
let memoryHistory: Entry[] | null = null;
function history(): Entry[] {
  if (!memoryHistory) memoryHistory = readHistory();
  return memoryHistory;
}

const previewBackend: Backend = {
  kind: "preview",
  async bootstrap() {
    return {
      settings: readLS(LS_SETTINGS, DEFAULT_SETTINGS),
      platform: navigator.platform.toLowerCase().includes("mac") ? "macos" : "linux",
      isWayland: false,
      engineReady: true,
      modelLabel: "Preview (simulated speech)",
      historyDir: "~/Documents/Mister Joe",
      netCalls: 0,
      version: "preview",
      accessibility: true,
      hotkeyError: null,
      hasApiKey: false,
    };
  },
  async saveSettings(s) {
    writeLS(LS_SETTINGS, s);
    emit("joe://settings-changed", s);
    return s;
  },
  async transcribeSample() {
    await new Promise((r) => setTimeout(r, 450));
    return { id: 0, raw: PREVIEW_SAMPLE_RAW, durationSeconds: 9, model: "Preview (simulated speech)" };
  },
  async startTestRecording() {
    throw new Error("The microphone test needs the Mister Joe app. This preview only simulates speech.");
  },
  async stopTestRecording() {
    return null;
  },
  async saveEntry(e) {
    const s = readLS(LS_SETTINGS, DEFAULT_SETTINGS);
    if (!s.historyEnabled || !e.text.trim()) return null;
    const created = new Date();
    const entry: Entry = {
      id: `${created.toISOString()}-${Math.random().toString(36).slice(2, 7)}`,
      created: created.toISOString(),
      durationSeconds: Math.round(e.durationSeconds * 10) / 10,
      model: e.model,
      polished: e.polished,
      source: e.source,
      text: e.text,
    };
    history().unshift(entry);
    writeLS(LS_HISTORY, history());
    emit("joe://history-changed", null);
    return entry;
  },
  async finalizeDictation() {
    return null;
  },
  async listHistory() {
    return [...history()];
  },
  async deleteEntry(id) {
    memoryHistory = history().filter((e) => e.id !== id);
    writeLS(LS_HISTORY, memoryHistory);
    emit("joe://history-changed", null);
  },
  async copyText(text) {
    await navigator.clipboard?.writeText(text).catch(() => undefined);
  },
  async openHistoryFolder() {},
  async chooseHistoryFolder() {
    return null;
  },
  async chooseModelFile() {
    return null;
  },
  async openPermissionSettings() {},
  async permissionStatus() {
    return { accessibility: true };
  },
  async setApiKey() {
    throw new Error("Keys can only be saved in the Mister Joe app.");
  },
  async clearApiKey() {},
  async polishText(text) {
    return text;
  },
  async restartHotkey() {
    return null;
  },
  async on(event, cb) {
    const set = listeners.get(event) ?? new Set();
    set.add(cb as (p: unknown) => void);
    listeners.set(event, set);
    return () => set.delete(cb as (p: unknown) => void);
  },
};

export const backend: Backend = isTauri() ? tauriBackend : previewBackend;
