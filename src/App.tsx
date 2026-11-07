import { ClockCounterClockwise, GearSix, House, WifiSlash } from "@phosphor-icons/react";
import { useState } from "react";
import { MisterJoe } from "./components/MisterJoe";
import { backend } from "./lib/backend";
import { useApp } from "./lib/store";
import { HistoryScreen } from "./screens/History";
import { HomeScreen } from "./screens/Home";
import { SettingsScreen } from "./screens/Settings";

type Screen = "home" | "history" | "settings";

const NAV: { id: Screen; label: string; icon: typeof House }[] = [
  { id: "home", label: "Home", icon: House },
  { id: "history", label: "History", icon: ClockCounterClockwise },
  { id: "settings", label: "Settings", icon: GearSix },
];

export default function App() {
  const { boot, error } = useApp();
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div className="flex h-full">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-line bg-surface/70 px-3 pt-5 pb-4">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <MisterJoe size={34} label="Mister Joe logo" />
          <span className="text-[19px] font-extrabold tracking-tight">Mister Joe</span>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              aria-current={screen === id ? "page" : undefined}
              className={`flex h-10 items-center gap-3 rounded-full px-3 text-[15px] font-semibold transition ${
                screen === id ? "clay-btn bg-surface text-accent-ink" : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              <Icon size={19} weight={screen === id ? "fill" : "regular"} />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 text-[13px] leading-snug text-muted">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <WifiSlash size={16} />
            No internet needed
          </div>
          <p className="mt-1">Speech is turned into text on this computer.</p>
          <p className="mt-2 font-mono text-[12px]">
            {backend.kind === "preview" ? "Preview mode" : `v${boot?.version ?? ""}`}
          </p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {backend.kind === "preview" && (
          <div role="note" className="flex items-center gap-2.5 border-b border-line bg-accent-soft px-8 py-2 text-[14px] text-accent-ink">
            <MisterJoe size={26} label="" />
            <span>
              <strong>Preview.</strong> Joe's real screens with simulated speech. Download the app to dictate.
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className="border-b border-line bg-accent-soft px-8 py-2.5 text-[14px] text-accent-ink">
            {error}
          </div>
        )}
        <div className="mx-auto max-w-[760px] px-8 py-8">
          {!boot ? (
            <LoadingSkeleton />
          ) : screen === "home" ? (
            <HomeScreen onOpenSettings={() => setScreen("settings")} onOpenHistory={() => setScreen("history")} />
          ) : screen === "history" ? (
            <HistoryScreen />
          ) : (
            <SettingsScreen />
          )}
        </div>
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse space-y-4">
      <div className="h-40 rounded-2xl bg-surface-2" />
      <div className="h-6 w-2/3 rounded-full bg-surface-2" />
      <div className="h-6 w-1/2 rounded-full bg-surface-2" />
    </div>
  );
}
