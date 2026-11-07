export interface Replacement {
  from: string;
  to: string;
}

export interface Snippet {
  trigger: string;
  text: string;
}

export interface Settings {
  hotkey: "option" | "right-option" | "left-option" | "fn";
  mode: "hold" | "toggle";
  model: "accurate" | "fast";
  customModelPath: string | null;
  autoPaste: boolean;
  restoreClipboard: boolean;
  historyEnabled: boolean;
  historyDir: string | null;
  removeFillers: boolean;
  dictionary: Replacement[];
  snippets: Snippet[];
  polishEnabled: boolean;
  onboarded: boolean;
}

export type Platform = "macos" | "windows" | "linux";

export interface Bootstrap {
  settings: Settings;
  platform: Platform;
  isWayland: boolean;
  engineReady: boolean;
  modelLabel: string;
  historyDir: string;
  netCalls: number;
  version: string;
  accessibility: boolean;
  hotkeyError: string | null;
  hasApiKey: boolean;
}

export interface Transcript {
  id: number;
  raw: string;
  durationSeconds: number;
  model: string;
}

export interface Entry {
  id: string;
  created: string;
  durationSeconds: number;
  model: string;
  polished: boolean;
  source: string;
  text: string;
}

export type Phase = "idle" | "listening" | "thinking" | "done" | "copied" | "nothing" | "error";

export interface PhaseEvent {
  phase: Phase;
  message: string | null;
  /** While listening: which Option key is held, so Joe cups that ear. */
  side?: "left" | "right" | null;
}

export const DEFAULT_SETTINGS: Settings = {
  hotkey: "option",
  mode: "hold",
  model: "accurate",
  customModelPath: null,
  autoPaste: true,
  restoreClipboard: true,
  historyEnabled: true,
  historyDir: null,
  removeFillers: true,
  dictionary: [],
  snippets: [],
  polishEnabled: false,
  onboarded: false,
};
