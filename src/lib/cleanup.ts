// Turns what Whisper heard into what you meant to type. Runs on your computer.
// Used by the listening pill (real dictations), "Try a sample", and preview mode.

import type { Replacement, Snippet } from "./types";

export interface CleanupOptions {
  removeFillers: boolean;
  dictionary: Replacement[];
  snippets: Snippet[];
}

const FILLERS = /(^|[\s,])(?:u+m+|u+h+m*|e+r+m+|er|a+h+|h+m+|m{2,}),?(?=[\s.!?]|$)/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase, case-insensitive replacement that respects word edges. */
function replacePhrase(text: string, from: string, to: string): string {
  const phrase = from.trim();
  if (!phrase) return text;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(re, () => to);
}

function voiceCommands(text: string): string {
  return text
    .replace(/[,;:]?\s*\bnew paragraph\b[,.;:!?]?\s*/gi, "\n\n")
    .replace(/[,;:]?\s*\bnew line\b[,.;:!?]?\s*/gi, "\n");
}

function tidy(text: string): string {
  return (
    text
      // spaces around line breaks
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      // repeated spaces
      .replace(/[ \t]{2,}/g, " ")
      // stray comma pairs and commas before sentence ends
      .replace(/,\s*,/g, ",")
      .replace(/,\s*([.!?])/g, "$1")
      // no space before punctuation
      .replace(/[ \t]+([,.!?;:])/g, "$1")
      // lines that start with punctuation left behind by removed words
      .replace(/(^|\n)[,;:]\s*/g, "$1")
      .trim()
  );
}

function capitalize(text: string): string {
  return text.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** Collapses accidental stutters like "the the". */
function dedupeWords(text: string): string {
  return text.replace(/\b(\p{L}+)(?:\s+\1\b)+/giu, "$1");
}

export function cleanup(raw: string, opts: CleanupOptions): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = voiceCommands(text);
  if (opts.removeFillers) {
    text = text.replace(FILLERS, "$1");
    text = dedupeWords(text);
  }
  text = tidy(text);
  text = capitalize(text);
  // Your words win over Joe's guesses: dictionary and snippets run last,
  // so their capitalization is kept exactly as you typed it.
  for (const r of opts.dictionary) text = replacePhrase(text, r.from, r.to);
  for (const s of opts.snippets) text = replacePhrase(text, s.trigger, s.text);
  return text;
}
