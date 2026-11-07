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
  const [side, setSide] = useState<"left" | "right" | null>(null);
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
        if (e.phase === "listening") setSide(e.side ?? null);
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

  // Tiny Joe, no capsule. While listening he says nothing: the big ear on the side
  // of the Option key you're holding, the sound waves and his moving mouth say it.
  // Otherwise a small speech bubble under him explains what's happening.
  const bubble: { icon?: "done" | "warn"; text: string } | null =
    phase === "listening"
      ? toggle
        ? { text: `Tap ${key} to finish` }
        : null
      : phase === "thinking"
        ? { text: "Writing it down" }
        : phase === "done"
          ? { icon: "done", text: "Typed it" }
          : phase === "copied"
            ? { icon: "done", text: message ?? "Copied" }
            : phase === "nothing"
              ? { text: "Didn't catch that. Hold a little longer." }
              : phase === "error"
                ? { icon: "warn", text: message ?? "Something went wrong" }
                : null;

  return (
    <div role="status" aria-live="polite" className="flex h-full flex-col items-center justify-end pb-3">
      <span className="sr-only">{phase === "listening" ? "Listening" : (bubble?.text ?? "")}</span>
      <div className="relative flex flex-col items-center">
        <MisterJoe mood={mood} size={62} ear={phase === "listening" ? (side ?? "left") : null} level={level} />
        <span aria-hidden className="pill-shadow -mt-1 h-2.5 w-12 rounded-[50%]" />
      </div>
      {bubble && (
        <div className="pill-bubble mt-1.5 flex max-w-[290px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold leading-snug">
          {bubble.icon === "done" && <Check size={14} weight="bold" className="shrink-0 text-ok" />}
          {bubble.icon === "warn" && <Warning size={14} weight="fill" className="shrink-0 text-accent" />}
          <span className="line-clamp-2">{bubble.text}</span>
          {phase === "thinking" && <Dots />}
        </div>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[4px] w-[4px] rounded-full bg-muted motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
