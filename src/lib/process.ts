import type { Backend } from "./backend";
import { cleanup } from "./cleanup";
import type { Settings } from "./types";

/** Raw speech in, finished text out: local cleanup, then optional polish. */
export async function processTranscript(
  raw: string,
  settings: Settings,
  backend: Backend,
  hasApiKey: boolean,
): Promise<{ text: string; polished: boolean; polishError?: string }> {
  const text = cleanup(raw, settings);
  if (!settings.polishEnabled || !hasApiKey || !text) return { text, polished: false };
  try {
    const polishedText = (await backend.polishText(text)).trim();
    // Re-apply the user's own words in case the model changed them.
    return { text: cleanup(polishedText, { ...settings, removeFillers: false }) || text, polished: true };
  } catch (e) {
    return { text, polished: false, polishError: String(e) };
  }
}

export function hotkeyName(platform: string, hotkey: Settings["hotkey"]): string {
  const opt = platform === "macos" ? "Option" : "Alt";
  switch (hotkey) {
    case "right-option":
      return `right ${opt}`;
    case "left-option":
      return `left ${opt}`;
    case "fn":
      return "Fn";
    default:
      return opt;
  }
}
