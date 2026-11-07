import { ArrowRight, Check, Copy, Microphone, Play, ShieldCheck, Sparkle, Stop, Warning } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { MisterJoe } from "../components/MisterJoe";
import { Button, Kbd } from "../components/ui";
import { backend } from "../lib/backend";
import { hotkeyName, processTranscript } from "../lib/process";
import { useApp } from "../lib/store";
import type { JoeMood } from "../lib/joeSvg";

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
  const [busy, setBusy] = useState<"sample" | "recording" | "transcribing" | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [copied, setCopied] = useState(false);
  const [micOk, setMicOk] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    void backend.on<number>("joe://level", setLevel).then((f) => (off = f));
    return () => off?.();
  }, []);

  if (!boot || !settings) return null;
  const key = hotkeyName(boot.platform, settings.hotkey);
  const mood: JoeMood = busy === "recording" ? "listening" : busy ? "thinking" : result ? "happy" : "idle";
  const needsSetup = backend.kind === "app" && (!boot.accessibility || !settings.onboarded);

  async function finish(raw: string, durationSeconds: number, model: string, source: "sample" | "test") {
    const p = await processTranscript(raw, settings!, backend, boot!.hasApiKey);
    const entry = await backend.saveEntry({ text: p.text, durationSeconds, model, polished: p.polished, source });
    setResult({ raw, text: p.text, polished: p.polished, saved: !!entry, polishError: p.polishError });
  }

  async function trySample() {
    setErr(null);
    setBusy("sample");
    try {
      const t = await backend.transcribeSample();
      await finish(t.raw, t.durationSeconds, t.model, "sample");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleMic() {
    setErr(null);
    if (busy === "recording") {
      setBusy("transcribing");
      try {
        const t = await backend.stopTestRecording();
        if (!t || !t.raw) {
          setErr("Joe didn't catch any words. Try again a little closer to the mic.");
        } else {
          setMicOk(true);
          await finish(t.raw, t.durationSeconds, t.model, "test");
        }
      } catch (e) {
        setErr(String(e));
      } finally {
        setBusy(null);
        setLevel(0);
      }
      return;
    }
    try {
      await backend.startTestRecording();
      setResult(null);
      setBusy("recording");
    } catch (e) {
      setErr(String(e));
    }
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
        <MisterJoe mood={mood} size={168} />
        <div>
          <h1 className="text-[34px] font-extrabold leading-[1.08] tracking-tight">
            {settings.mode === "toggle" ? `Tap ${key}, talk, tap again.` : `Hold ${key} and talk.`}
          </h1>
          <p className="mt-3 max-w-[44ch] text-[16px] leading-relaxed text-muted">
            Joe types it wherever your cursor is. Your voice never leaves this computer.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              icon={<Play size={17} weight="fill" />}
              onClick={trySample}
              disabled={busy !== null}
            >
              {busy === "sample" ? "Joe is listening..." : "Try a sample"}
            </Button>
            <Button
              icon={busy === "recording" ? <Stop size={17} weight="fill" /> : <Microphone size={17} />}
              onClick={toggleMic}
              disabled={busy === "sample" || busy === "transcribing"}
            >
              {busy === "recording" ? "Stop and transcribe" : busy === "transcribing" ? "Transcribing..." : "Test your mic"}
            </Button>
          </div>
          {busy === "recording" && <LevelMeter level={level} />}
        </div>
      </div>

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
            className="rounded-2xl border border-line bg-surface p-5"
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
        <section aria-labelledby="setup-title" className="rounded-2xl border border-line bg-surface p-6">
          <h2 id="setup-title" className="text-[19px] font-bold tracking-tight">
            Three quick steps
          </h2>
          <ol className="mt-4 space-y-5">
            <SetupStep
              done={micOk || settings.onboarded}
              title="Let Joe hear you"
              body={
                boot.platform === "macos"
                  ? "Click Test your mic and say a few words. macOS will ask once for microphone access."
                  : "Click Test your mic and say a few words."
              }
            />
            <SetupStep
              done={boot.accessibility}
              title={`Let Joe use the ${key} key and type for you`}
              body="macOS needs to trust Mister Joe in Privacy & Security > Accessibility. Switch it on, then come back."
              action={
                !boot.accessibility && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => backend.openPermissionSettings("accessibility")}>Open Accessibility settings</Button>
                    <Button variant="ghost" onClick={recheckAccess}>
                      Check again
                    </Button>
                  </div>
                )
              }
            />
            <SetupStep
              done={settings.onboarded}
              title="Try it anywhere"
              body={
                <>
                  Click into Notes, Mail or any text box. Hold <Kbd>{key}</Kbd>, say something, then let go. A quick tap or{" "}
                  {key} with another key (like {key}+E for accents) still works as usual.
                </>
              }
              action={
                !settings.onboarded && (
                  <Button className="mt-3" variant="primary" onClick={() => updateSettings({ onboarded: true })}>
                    I'm all set
                  </Button>
                )
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

function LevelMeter({ level }: { level: number }) {
  const bars = 14;
  return (
    <div aria-label="Microphone level" className="mt-4 flex h-6 items-end gap-1">
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
