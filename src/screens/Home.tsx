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

  // Finished states fade back to the hint after 5 s, or when you click back into the box.
  const statusTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(statusTimer.current);
    if (phase === "done" || phase === "nothing" || phase === "error" || phase === "copied" || optionMissed) {
      statusTimer.current = window.setTimeout(() => {
        setPhase("idle");
        setOptionMissed(false);
      }, 5000);
    }
    return () => window.clearTimeout(statusTimer.current);
  }, [phase, optionMissed]);
  function resetStatus() {
    if (phase !== "listening" && phase !== "thinking") {
      setPhase("idle");
      setOptionMissed(false);
    }
  }

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
    <div className="space-y-7">
      <section aria-labelledby="home-title" className="grid grid-cols-[200px_minmax(0,1fr)] items-center gap-8">
        <div className="flex flex-col items-center">
          <MisterJoe mood={mood} size={176} ear={phase === "listening" ? (side ?? "left") : null} level={level} />
          <span aria-hidden className="joe-floor -mt-2 h-4 w-32 rounded-[50%]" />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h1 id="home-title" className="text-[30px] font-extrabold leading-[1.1] tracking-tight">
            {settings.mode === "toggle" ? `Tap ${key}, talk, tap again.` : `Hold ${key} and talk.`}
          </h1>
          {isApp ? (
            <>
              <p className="text-[15.5px] leading-relaxed text-muted">
                Click the box, hold <Kbd>{key}</Kbd>, say a sentence, let go. It works the same in any app.
              </p>
              <div className="practice-box rounded-[14px] border border-line bg-surface px-4 pt-3.5 pb-3">
                <textarea
                  data-testid="practice-box"
                  aria-label="Practice box"
                  value={practice}
                  onChange={(e) => setPractice(e.target.value)}
                  onKeyDown={onPracticeKeyDown}
                  onKeyUp={onPracticeKeyUp}
                  onFocus={resetStatus}
                  rows={2}
                  placeholder={`Click here, then hold ${key} and talk`}
                  className="w-full resize-none border-0 bg-transparent p-0 text-[17px] leading-relaxed text-ink outline-none placeholder:text-muted"
                />
                <div aria-live="polite" className="mt-2 flex min-h-7 items-center border-t border-line pt-2.5 text-[14.5px]">
                  <PracticeStatus
                    phase={phase}
                    message={phaseMsg}
                    level={level}
                    keyName={key}
                    optionMissed={optionMissed}
                    onOpenSettings={(which) => void backend.openPermissionSettings(which)}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-[15.5px] leading-relaxed text-muted">
                Joe types it wherever your cursor is. Your voice never leaves this computer.
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={<Play size={17} weight="fill" />} onClick={trySample} disabled={busy !== null}>
                  {busy === "sample" ? "Joe is listening..." : "Try a sample"}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

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

      <dl className="grid grid-cols-3 gap-4">
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
  // One style for every problem: warning icon, bold red text, one action.
  const problem = (title: string, detail?: string, fix?: { which: "accessibility" | "microphone"; label: string }) => (
    <span className="flex w-full items-center gap-2">
      <Warning size={16} weight="fill" className="shrink-0 text-accent" />
      <span className="font-bold text-accent-ink">{title}</span>
      {detail && <span className="truncate text-muted">{detail}</span>}
      {fix && (
        <button type="button" className="ml-auto shrink-0 font-bold text-accent-ink hover:underline" onClick={() => onOpenSettings(fix.which)}>
          {fix.label}
        </button>
      )}
    </span>
  );
  if (phase === "listening") {
    return (
      <span className="flex w-full items-center gap-2.5">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--accent-soft)]" />
        <span className="font-bold">Listening</span>
        <span className="text-muted">Let go of {keyName} when you're done</span>
        <span className="ml-auto">
          <LevelMeter level={level} />
        </span>
      </span>
    );
  }
  if (phase === "thinking") return <span className="text-muted">Writing it down...</span>;
  if (phase === "error") {
    const mic = /hear|microphone/i.test(message ?? "");
    return mic
      ? problem("Joe can't hear you.", undefined, { which: "microphone", label: "Open Microphone settings" })
      : problem(message ?? "Something went wrong.");
  }
  if (optionMissed) return problem(`Joe didn't notice ${keyName}.`, undefined, { which: "accessibility", label: "Open Accessibility" });
  if (phase === "nothing") return problem("Didn't catch any words.", `Hold ${keyName} a little longer.`);
  if (phase === "copied") return <span className="text-muted">{message}</span>;
  if (phase === "done") {
    return (
      <span className="flex items-center gap-2">
        <Check size={16} weight="bold" className="text-ok" />
        <span className="font-bold text-ok">Typed it.</span>
        <span className="text-muted">Joe works the same in any app.</span>
      </span>
    );
  }
  return <span className="text-muted">Joe will type your words into the box.</span>;
}

function LevelMeter({ level }: { level: number }) {
  const bars = 14;
  return (
    <div aria-label="Microphone level" className="flex h-5 items-end gap-[3px]">
      {Array.from({ length: bars }, (_, i) => {
        const on = level * bars > i;
        return <span key={i} className={`w-1 rounded-full transition-all duration-75 ${on ? "bg-accent" : "bg-line"}`} style={{ height: `${30 + (i % 5) * 14}%` }} />;
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
    <div className="clay border border-line bg-surface px-4.5 py-4">
      <dt className="text-[13px] font-semibold text-muted">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-2 font-bold">
        <span className="flex items-center gap-1.5">
          {icon}
          {value}
        </span>
        {action}
      </dd>
    </div>
  );
}
