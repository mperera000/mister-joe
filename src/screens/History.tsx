import { Check, Copy, FolderOpen, MagnifyingGlass, Sparkle, Trash } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MisterJoe } from "../components/MisterJoe";
import { Button } from "../components/ui";
import { backend } from "../lib/backend";
import { hotkeyName } from "../lib/process";
import { useApp } from "../lib/store";
import type { Entry } from "../lib/types";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today, ${time}` : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

const SOURCE_LABEL: Record<string, string> = { sample: "Sample", test: "Mic test", dictation: "Dictation" };

export function HistoryScreen() {
  const { boot, settings } = useApp();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Delete is instant on screen, with an Undo toast; the file goes after 6 s.
  const [pending, setPending] = useState<Entry | null>(null);
  const pendingTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<Entry | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await backend.listHistory());
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    let off: (() => void) | undefined;
    void backend.on("joe://history-changed", () => void load()).then((f) => (off = f));
    return () => off?.();
  }, [load]);

  useEffect(
    () => () => {
      window.clearTimeout(pendingTimer.current);
      if (pendingRef.current) void backend.deleteEntry(pendingRef.current.id);
    },
    [],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (entries ?? []).filter((e) => e.id !== pending?.id && (!q || e.text.toLowerCase().includes(q)));
  }, [entries, query, pending]);

  if (!boot || !settings) return null;

  async function copy(e: Entry) {
    await backend.copyText(e.text);
    setCopiedId(e.id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  async function commitDelete(e: Entry) {
    try {
      await backend.deleteEntry(e.id);
    } catch (error) {
      setErr(String(error));
      void load();
    }
  }

  function remove(e: Entry) {
    if (pendingRef.current) void commitDelete(pendingRef.current);
    window.clearTimeout(pendingTimer.current);
    pendingRef.current = e;
    setPending(e);
    pendingTimer.current = window.setTimeout(() => {
      if (pendingRef.current) void commitDelete(pendingRef.current);
      pendingRef.current = null;
      setPending(null);
    }, 6000);
  }

  function undo() {
    window.clearTimeout(pendingTimer.current);
    pendingRef.current = null;
    setPending(null);
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold tracking-tight">History</h1>
          <p className="mt-1 text-[15px] text-muted">
            Every dictation is a Markdown file in <span className="selectable font-mono text-[13.5px] text-ink">{boot.historyDir}</span>
          </p>
        </div>
        {backend.kind === "app" && (
          <Button icon={<FolderOpen size={18} />} onClick={() => backend.openHistoryFolder()}>
            Open folder
          </Button>
        )}
      </div>

      <div className="relative mt-6">
        <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
        <label htmlFor="history-search" className="sr-only">
          Search your history
        </label>
        <input
          id="history-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search what you said"
          className="h-11 w-full rounded-[10px] border border-line bg-surface pr-3 pl-10 text-[15px] placeholder:text-muted focus:border-accent focus:outline-none clay-well"
        />
      </div>

      {err && (
        <p role="alert" className="mt-4 text-[14px] text-accent-ink">
          {err}
        </p>
      )}

      {entries === null ? (
        <div aria-busy="true" aria-label="Loading history" className="mt-6 animate-pulse space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <MisterJoe mood="thinking" size={110} />
          <h2 className="mt-4 text-[19px] font-bold">{query ? "Nothing matches that" : "Nothing here yet"}</h2>
          <p className="mt-1 max-w-[40ch] text-[15px] text-muted">
            {query
              ? "Try a different word."
              : `Hold ${hotkeyName(boot.platform, settings.hotkey)} in any app and say something, or press Try a sample on Home.`}
          </p>
        </div>
      ) : (
        <ul aria-label="Dictations" className="mt-6 divide-y divide-line clay border border-line bg-surface">
          {shown.map((e) => (
            <li key={e.id} className="group flex gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                  <span className="font-semibold text-ink">{when(e.created)}</span>
                  <span>{SOURCE_LABEL[e.source] ?? e.source}</span>
                  <span className="font-mono">{e.durationSeconds.toFixed(1)} s</span>
                  {e.polished && (
                    <span className="inline-flex items-center gap-1 text-accent-ink">
                      <Sparkle size={12} weight="fill" /> Polished
                    </span>
                  )}
                </div>
                <p className="selectable mt-1.5 line-clamp-3 whitespace-pre-wrap text-[15.5px] leading-relaxed">{e.text}</p>
              </div>
              <div className="flex shrink-0 items-start gap-1.5">
                <Button className="h-9 px-3.5 text-[14px]" icon={copiedId === e.id ? <Check size={15} /> : <Copy size={15} />} onClick={() => copy(e)}>
                  {copiedId === e.id ? "Copied" : "Copy"}
                </Button>
                <Button variant="danger" className="h-9 px-3.5 text-[14px]" icon={<Trash size={15} />} onClick={() => remove(e)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pending && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3.5 rounded-full bg-ink py-2 pr-2 pl-5 text-[14.5px] text-bg shadow-[0_10px_26px_-8px_rgba(42,33,28,0.45)]"
        >
          <span className="max-w-[44ch] truncate">Deleted "{pending.text.slice(0, 40)}{pending.text.length > 40 ? "…" : ""}"</span>
          <button type="button" onClick={undo} className="h-8 rounded-full bg-accent px-3.5 font-extrabold text-on-accent">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
