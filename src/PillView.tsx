// The floating "Joe is listening" pill. It also finishes each dictation:
// cleanup (and optional polish) run here, then Rust pastes and saves.

import { Check, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { MisterJoe } from "./components/MisterJoe";
import { backend } from "./lib/backend";
import { hotkeyName, processTranscript } from "./lib/process";
import type { JoeMood } from "./lib/joeSvg";
import type { Bootstrap, Phase, PhaseEvent, Settings, Transcript } from "./lib/types";

export default function PillView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const boot = useRef<Bootstrap | null>(null);

  useEffect(() => {
    void backend.bootstrap().then((b) => (boot.current = b));
    const offs = [
      backend.on<Settings>("joe://settings-changed", (s) => {
        if (boot.current) boot.current = { ...boot.current, settings: s };
      }),
      backend.on<PhaseEvent>("joe://phase", (e) => {
        setPhase(e.phase);
        setMessage(e.message);
        if (e.phase !== "listening") setLevel(0);
      }),
      backend.on<number>("joe://level", setLevel),
      backend.on<Transcript>("joe://transcript", async (t) => {
        setPhase("thinking");
        const b = boot.current ?? (boot.current = await backend.bootstrap());
        const { text, polished } = await processTranscript(t.raw, b.settings, backend, b.settings.polishEnabled);
        await backend.finalizeDictation(t.id, text, polished);
      }),
    ];
    return () => offs.forEach((p) => void p.then((off) => off()));
  }, []);

  const key = boot.current ? hotkeyName(boot.current.platform, boot.current.settings.hotkey) : "Option";
  const toggle = boot.current?.settings.mode === "toggle";
  const mood: JoeMood = phase === "listening" ? "listening" : phase === "thinking" ? "thinking" : phase === "done" ? "happy" : "idle";

  const titles: Record<Phase, string> = {
    idle: "Mister Joe",
    listening: "Listening",
    thinking: "Writing it down",
    done: "Typed it",
    copied: "Copied",
    nothing: "Didn't catch that",
    error: "Hmm",
  };
  const sub =
    phase === "listening"
      ? toggle
        ? `Tap ${key} to finish`
        : `Let go of ${key} to finish`
      : phase === "error" || phase === "copied"
        ? message
        : phase === "nothing"
          ? "Hold a little longer and speak up"
          : null;

  return (
    <div className="flex h-full items-center justify-center p-2">
      <div
        role="status"
        aria-live="polite"
        className="flex h-[68px] w-full items-center gap-3 rounded-full bg-joe pr-5 pl-2 text-[#f4f2ef] shadow-[0_10px_30px_rgba(20,18,30,0.35)]"
      >
        <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full bg-[#3a3944]">
          <MisterJoe mood={mood} size={44} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[15px] font-bold">
            {phase === "done" && <Check size={16} weight="bold" className="text-[#7fdca4]" />}
            {phase === "error" && <Warning size={16} weight="fill" className="text-[#ffb199]" />}
            {titles[phase]}
            {phase === "thinking" && <Dots />}
          </div>
          {sub && <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-[#c9c7d1]">{sub}</div>}
        </div>
        {phase === "listening" && <Bars level={level} />}
      </div>
    </div>
  );
}

function Bars({ level }: { level: number }) {
  return (
    <div aria-hidden className="flex h-8 items-center gap-[3px]">
      {[0.55, 0.85, 1, 0.75, 0.5].map((w, i) => (
        <span
          key={i}
          className="w-[4px] rounded-full bg-[#ff7a5c] transition-[height] duration-75"
          style={{ height: `${Math.max(18, Math.min(100, level * w * 140))}%` }}
        />
      ))}
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[5px] w-[5px] rounded-full bg-[#c9c7d1] motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
