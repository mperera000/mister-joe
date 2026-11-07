import { ArrowRight, Check, Copy, Play, ShieldCheck, Sparkle, Warning } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MisterJoe } from "../components/MisterJoe";
import { Button, Kbd } from "../components/ui";
import { backend } from "../lib/backend";
import { hotkeyName, processTranscript } from "../lib/process";
import { useApp } from "../lib/store";
import type { JoeMood } from "../lib/joeSvg";
import type { Phase, PhaseEvent } from "../lib/types";

interface Result {
  raw: string;
  text: string;
  polished: boolean;
  saved: boolean;
  polishError?: string;
}

export function HomeScreen({ onOpenSettings, onOpenHistory }: { onOpenSettings: () => void; onOpenHistory: () => void }) {
  const { boot, settings, refresh, updateSettings } = useApp();
  const reduce = useReducedMotion();
  const [busy, setBusy] = useState<"sample" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  // "Try it here": the live state of a real hold-Option dictation into the practice box.
  const [phase, setPhase] = useState<Phase>("idle");
  const [phaseMsg, setPhaseMsg] = useState<string | null>(null);
  const [side, setSide] = useState<"left" | "right" | null>(null);
  const [practice, setPractice] = useState("");
  const [optionMissed, setOptionMissed] = useState(false);
  const optionDown = useRef<{ at: number; spoiled: boolean } | null>(null);
  const sawListening = useRef(false);

  useEffect(() => {
    const offs = [
      backend.on<number>("joe://level", setLevel),
      backend.on<PhaseEvent>("joe://phase", (e) => {
        setPhase(e.phase);
        setPhaseMsg(e.message);
        if (e.phase === "listening") {
          setSide(e.side ?? null);
          sawListening.current = true;
          setOptionMissed(false);
          setResult(null);
        }
        if (e.phase !== "listening") setLevel(0);
      }),
      backend.on<{ raw: string; text: string; polished: boolean }>("joe://dictated", (d) => {
        setResult({ raw: d.raw, text: d.text, polished: d.polished, saved: true });
      }),
    ];
    return () => offs.forEach((p) => void p.then((off) => off()));
  }, []);

  // The first successful dictation means setup is done.
  useEffect(() => {
    if (phase === "done" && settings && !settings.onboarded) void updateSettings({ onboarded: true });
  }, [phase, settings, updateSettings]);

  if (!boot || !settings) return null;
  const key = hotkeyName(boot.platform, settings.hotkey);
  const isApp = backend.kind === "app";
  const mood: JoeMood =
    phase === "listening" ? "listening" : busy || phase === "thinking" ? "thinking" : result ? "happy" : "idle";
  const needsSetup = isApp && !boot.accessibility;

  async function finish(raw: string, durationSeconds: number, model: string, source: "sample" | "test") {
    const p = await processTranscript(raw, settings!, backend, boot!.hasApiKey);
    const entry = await backend.saveEntry({ text: p.text, durationSeconds, model, polished: p.polished, source });
    setResult({ raw, text: p.text, polished: p.polished, saved: !!entry, polishError: p.polishError });
  }

  async function trySample() {
    setErr(null);
    setBusy("sample");
    // Play the clip out loud while Joe transcribes it, so you hear what he's typing.
    const clip = new Audio("/joe-sample.wav");
    void clip.play().catch(() => {});
    try {
      const t = await backend.transcribeSample();
      await finish(t.raw, t.durationSeconds, t.model, "sample");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  // If Option is held in the practice box but Joe never starts listening, the key
  // isn't reaching him: almost always the Accessibility switch.
  function onPracticeKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Alt") {
      if (!optionDown.current) {
        optionDown.current = { at: Date.now(), spoiled: false };
        sawListening.current = false;
      }
    } else if (optionDown.current) {
      optionDown.current.spoiled = true;
    }
  }
  function onPracticeKeyUp(e: React.KeyboardEvent) {
    if (e.key !== "Alt" || !optionDown.current) return;
    const { at, spoiled } = optionDown.current;
    optionDown.current = null;
    if (!spoiled && Date.now() - at > 700 && !sawListening.current) setOptionMissed(true);
  }

  async function copy() {
    if (!result) return;
    await backend.copyText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function recheckAccess() {
    await backend.restartHotkey();
    await refresh();
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[auto_1fr] items-center gap-8">
        <div className="flex flex-col items-center">
          <MisterJoe mood={mood} size={168} ear={phase === "listening" ? (side ?? "left") : null} level={level} />
          <span aria-hidden className="joe-floor -mt-2 h-4 w-32 rounded-[50%]" />
        </div>
        <div>
          <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-tight">
            {settings.mode === "toggle" ? `Tap ${key}, talk, tap again.` : `Hold ${key} and talk.`}
          </h1>
          <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed text-muted">
            Joe types it wherever your cursor is. Your voice never leaves this computer.
          </p>
          {!isApp && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={<Play size={17} weight="fill" />} onClick={trySample} disabled={busy !== null}>
                {busy === "sample" ? "Joe is listening..." : "Try a sample"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {isApp && (
        <section aria-labelledby="practice-title" className="clay border border-line bg-surface p-5">
          <h2 id="practice-title" className="text-[19px] font-bold tracking-tight">
            Try it here
          </h2>
          <p className="mt-1 text-[14.5px] leading-relaxed text-muted">
            Click the box, hold <Kbd>{key}</Kbd>, say a sentence, then let go. It works the same in any app.
          </p>
          <textarea
            data-testid="practice-box"
            aria-label="Practice box"
            value={practice}
            onChange={(e) => setPractice(e.target.value)}
            onKeyDown={onPracticeKeyDown}
            onKeyUp={onPracticeKeyUp}
            rows={3}
            placeholder={`Click here, then hold ${key} and talk`}
            className="clay-well mt-3 w-full resize-none rounded-[12px] border border-line bg-bg px-3.5 py-3 text-[16px] leading-relaxed outline-none focus:border-accent"
          />
          <div aria-live="polite" className="mt-2 min-h-6 text-[14.5px]">
            <PracticeStatus
              phase={phase}
              message={phaseMsg}
              level={level}
              keyName={key}
              optionMissed={optionMissed}
              onOpenSettings={(which) => void backend.openPermissionSettings(which)}
            />
          </div>
        </section>
      )}

      {err && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-[15px] text-accent-ink">
          <Warning size={20} className="mt-0.5 shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.section
            aria-label="Latest result"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="clay border border-line bg-surface p-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h2 className="text-[13px] font-semibold text-muted">Joe heard</h2>
                <p className="selectable mt-2 whitespace-pre-wrap font-mono text-[13.5px] leading-relaxed text-muted">{result.raw}</p>
              </div>
              <div>
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  Joe typed
                  {result.polished && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent-ink">
                      <Sparkle size={12} weight="fill" /> Polished
                    </span>
                  )}
                </h2>
                <p data-testid="typed-text" className="selectable mt-2 whitespace-pre-wrap text-[16px] leading-relaxed">
                  {result.text}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <Button variant="ghost" icon={copied ? <Check size={17} /> : <Copy size={17} />} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
              {result.saved && (
                <Button variant="ghost" icon={<ArrowRight size={17} />} onClick={onOpenHistory}>
                  Saved to history
                </Button>
              )}
              {result.polishError && <span className="text-[13px] text-muted">Polish skipped: {result.polishError}</span>}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {needsSetup && (
        <section aria-labelledby="setup-title" className="clay border border-line bg-surface p-6">
          <h2 id="setup-title" className="text-[19px] font-bold tracking-tight">
            One quick step
          </h2>
          <ol className="mt-4 space-y-5">
            <SetupStep
              done={boot.accessibility}
              title={`Let Joe use the ${key} key and type for you`}
              body="Switch on Mister Joe in System Settings > Privacy & Security > Accessibility. Joe restarts by himself once it's on."
              action={
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => backend.openPermissionSettings("accessibility")}>Open Accessibility settings</Button>
                  <Button variant="ghost" onClick={recheckAccess}>
                    Check again
                  </Button>
                </div>
              }
            />
          </ol>
        </section>
      )}

      {boot.hotkeyError && boot.hotkeyError !== "needs-accessibility" && (
        <div role="alert" className="rounded-2xl bg-warn-soft px-4 py-3 text-[15px] text-warn">
          The {key} key isn't working yet: {boot.hotkeyError}
          {boot.platform === "linux" && " On Linux, add yourself to the input group (sudo usermod -aG input $USER), then log out and back in."}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-6 border-t border-line pt-6">
        <Fact label="Speech engine" value={boot.engineReady ? boot.modelLabel : "Getting ready..."} />
        <Fact
          label="Leaves this computer"
          value={boot.netCalls === 0 ? "Nothing" : `${boot.netCalls} polish request${boot.netCalls === 1 ? "" : "s"} (text only)`}
          icon={<ShieldCheck size={17} weight="fill" className="text-ok" />}
        />
        <Fact
          label="Your history"
          value={settings.historyEnabled ? "Markdown files" : "Paused"}
          action={
            <button type="button" className="text-[13px] font-semibold text-accent-ink hover:underline" onClick={onOpenSettings}>
              Change
            </button>
          }
        />
      </dl>
    </div>
  );
}

function PracticeStatus({
  phase,
  message,
  level,
  keyName,
  optionMissed,
  onOpenSettings,
}: {
  phase: Phase;
  message: string | null;
  level: number;
  keyName: string;
  optionMissed: boolean;
  onOpenSettings: (which: "accessibility" | "microphone") => void;
}) {
  const fix = (which: "accessibility" | "microphone", label: string) => (
    <button type="button" className="ml-1 font-semibold text-accent-ink hover:underline" onClick={() => onOpenSettings(which)}>
      {label}
    </button>
  );
  if (phase === "listening") {
    return (
      <div className="flex items-center gap-3">
        <span className="font-semibold">Listening. Let go of {keyName} when you're done.</span>
        <LevelMeter level={level} />
      </div>
    );
  }
  if (phase === "thinking") return <span className="text-muted">Writing it down...</span>;
  if (phase === "error") {
    const mic = /hear|microphone/i.test(message ?? "");
    return (
      <span className="text-accent-ink">
        {message ?? "Something went wrong."}
        {mic && fix("microphone", "Open Microphone settings")}
      </span>
    );
  }
  if (optionMissed) {
    return (
      <span className="text-accent-ink">
        Joe didn't notice {keyName}. Switch on Mister Joe in Privacy &amp; Security &gt; Accessibility.
        {fix("accessibility", "Open Accessibility settings")}
      </span>
    );
  }
  if (phase === "nothing") return <span className="text-muted">Joe didn't catch any words. Hold {keyName} a little longer and speak up.</span>;
  if (phase === "copied") return <span className="text-muted">{message}</span>;
  if (phase === "done") return <span className="font-semibold text-ok">That's it. Joe works the same way in any app.</span>;
  return <span className="text-muted">Joe will type your words into the box.</span>;
}

function LevelMeter({ level }: { level: number }) {
  const bars = 14;
  return (
    <div aria-label="Microphone level" className="flex h-5 items-end gap-1">
      {Array.from({ length: bars }, (_, i) => {
        const on = level * bars > i;
        return <span key={i} className={`w-1.5 rounded-full transition-all duration-75 ${on ? "bg-accent" : "bg-line"}`} style={{ height: `${30 + (i % 5) * 14}%` }} />;
      })}
    </div>
  );
}

function SetupStep({ done, title, body, action }: { done: boolean; title: string; body: React.ReactNode; action?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_1fr] gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ${done ? "bg-ok-soft text-ok" : "border-2 border-line"}`}
      >
        {done && <Check size={15} weight="bold" />}
      </span>
      <div>
        <h3 className="font-bold">
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </h3>
        <p className="mt-1 text-[14.5px] leading-relaxed text-muted">{body}</p>
        {action}
      </div>
    </li>
  );
}

function Fact({ label, value, icon, action }: { label: string; value: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-1.5 font-semibold">
        {icon}
        {value}
      </dd>
      {action && <dd className="mt-1">{action}</dd>}
    </div>
  );
}
