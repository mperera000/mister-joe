import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { backend } from "./backend";
import type { Bootstrap, Settings } from "./types";

interface AppCtx {
  boot: Bootstrap | null;
  settings: Settings | null;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  refresh: () => Promise<void>;
  error: string | null;
}

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setBoot(await backend.bootstrap());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const offs: Promise<() => void>[] = [
      backend.on<{ ready: boolean; label?: string }>("joe://engine", (p) =>
        setBoot((b) => (b ? { ...b, engineReady: p.ready, modelLabel: p.label ?? b.modelLabel } : b)),
      ),
      backend.on<number>("joe://net-calls", (n) => setBoot((b) => (b ? { ...b, netCalls: n } : b))),
      backend.on<Settings>("joe://settings-changed", (s) => setBoot((b) => (b ? { ...b, settings: s } : b))),
      // Rust spots the moment Accessibility is switched on and starts the Option key.
      backend.on<boolean>("joe://permissions", () => void refresh()),
    ];
    // Accessibility can be granted while the app is open; re-check when the window regains focus.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      offs.forEach((p) => void p.then((off) => off()));
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      if (!boot) return;
      const next = { ...boot.settings, ...patch };
      setBoot({ ...boot, settings: next });
      try {
        const saved = await backend.saveSettings(next);
        setBoot((b) => (b ? { ...b, settings: saved } : b));
      } catch (e) {
        setError(String(e));
      }
    },
    [boot],
  );

  const value = useMemo(
    () => ({ boot, settings: boot?.settings ?? null, updateSettings, refresh, error }),
    [boot, updateSettings, refresh, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}
