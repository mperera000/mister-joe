import { FolderOpen, Plus, ShieldCheck, X } from "@phosphor-icons/react";
import { useState, type FormEvent } from "react";
import { Button, IconButton, Section, Segmented, TextField, Toggle } from "../components/ui";
import { backend } from "../lib/backend";
import { useApp } from "../lib/store";
import type { Settings } from "../lib/types";

export function SettingsScreen() {
  const { boot, settings, updateSettings, refresh } = useApp();
  if (!boot || !settings) return null;
  const mac = boot.platform === "macos";
  const opt = mac ? "Option" : "Alt";

  const keyOptions: { value: Settings["hotkey"]; label: string }[] = [
    { value: "option", label: `Either ${opt}` },
    { value: "right-option", label: `Right ${opt}` },
    { value: "left-option", label: `Left ${opt}` },
    ...(mac ? [{ value: "fn" as const, label: "Fn" }] : []),
  ];

  return (
    <div>
      <h1 className="mb-8 text-[28px] font-extrabold tracking-tight">Settings</h1>

      <Section title="Talking to Joe">
        <div className="flex flex-col gap-5">
          <Segmented label="Key" value={settings.hotkey} options={keyOptions} onChange={(hotkey) => updateSettings({ hotkey })} />
          <Segmented
            label="How it works"
            value={settings.mode}
            options={[
              { value: "hold", label: "Hold to talk" },
              { value: "toggle", label: "Tap to start, tap to stop" },
            ]}
            onChange={(mode) => updateSettings({ mode })}
          />
          {boot.platform === "linux" && (
            <p className="text-[14px] leading-relaxed text-muted">
              Linux: the {opt} key needs you in the input group. You can also bind a system shortcut to{" "}
              <span className="selectable font-mono text-ink">mister-joe --toggle</span>.
            </p>
          )}
        </div>
        <Toggle
          label="Type it for me"
          description={`Joe pastes the text where your cursor is. Off: Joe copies it and you paste with ${mac ? "Cmd" : "Ctrl"}+V.`}
          checked={settings.autoPaste}
          onChange={(autoPaste) => updateSettings({ autoPaste })}
        />
        <Toggle
          label="Put my clipboard back"
          description="After pasting, Joe restores whatever you had copied before."
          checked={settings.restoreClipboard}
          onChange={(restoreClipboard) => updateSettings({ restoreClipboard })}
          disabled={!settings.autoPaste}
        />
      </Section>

      <Section title="Speech engine">
        <Segmented
          label="Model"
          value={settings.customModelPath ? ("custom" as const) : settings.model}
          options={[
            { value: "accurate", label: "Accurate" },
            { value: "fast", label: "Fast" },
            ...(settings.customModelPath ? [{ value: "custom" as const, label: "Your file" }] : []),
          ]}
          onChange={(v) => v !== "custom" && updateSettings({ model: v, customModelPath: null })}
        />
        <p className="mt-2 text-[14px] text-muted">
          Both models are inside the app, so nothing downloads. Accurate is best on newer Macs; Fast suits older computers.
          Now using: <span className="font-semibold text-ink">{boot.engineReady ? boot.modelLabel : "loading..."}</span>
        </p>
        {backend.kind === "app" && (
          <Button
            className="mt-3"
            variant="ghost"
            onClick={async () => {
              const path = await backend.chooseModelFile();
              if (path) await updateSettings({ customModelPath: path });
            }}
          >
            Use a whisper.cpp model file...
          </Button>
        )}
      </Section>

      <Section title="Cleanup">
        <Toggle
          label="Remove filler words"
          description={'Drops "um", "uh" and stutters. Say "new line" or "new paragraph" to break lines.'}
          checked={settings.removeFillers}
          onChange={(removeFillers) => updateSettings({ removeFillers })}
        />
      </Section>

      <Section title="Dictionary" id="dictionary">
        <p className="mb-4 text-[14.5px] text-muted">
          Fix words Joe keeps getting wrong. These spellings also help Joe recognize names.
        </p>
        <PairEditor
          fromLabel="When Joe hears"
          toLabel="Type this instead"
          fromPlaceholder="Mr. Joe"
          toPlaceholder="Mister Joe"
          addLabel="Add fix"
          listLabel="Dictionary fixes"
          pairs={settings.dictionary.map((d) => [d.from, d.to])}
          onChange={(pairs) => updateSettings({ dictionary: pairs.map(([from, to]) => ({ from, to })) })}
        />
      </Section>

      <Section title="Snippets" id="snippets">
        <p className="mb-4 text-[14.5px] text-muted">Say a short phrase and Joe types something longer.</p>
        <PairEditor
          fromLabel="When you say"
          toLabel="Joe types"
          fromPlaceholder="my email"
          toPlaceholder="joe@example.com"
          addLabel="Add snippet"
          listLabel="Snippets"
          pairs={settings.snippets.map((s) => [s.trigger, s.text])}
          onChange={(pairs) => updateSettings({ snippets: pairs.map(([trigger, text]) => ({ trigger, text })) })}
        />
      </Section>

      <Section title="History">
        <Toggle
          label="Save my dictations"
          description="Each one becomes a Markdown file on this computer. Nothing is uploaded."
          checked={settings.historyEnabled}
          onChange={(historyEnabled) => updateSettings({ historyEnabled })}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="selectable rounded-[10px] bg-surface-2 px-3 py-2 font-mono text-[13px]">{boot.historyDir}</span>
          {backend.kind === "app" && (
            <Button
              variant="ghost"
              icon={<FolderOpen size={18} />}
              onClick={async () => {
                const dir = await backend.chooseHistoryFolder();
                if (dir) {
                  await updateSettings({ historyDir: dir });
                  await refresh();
                }
              }}
            >
              Change folder
            </Button>
          )}
        </div>
      </Section>

      <PolishSection />

      <Section title="Privacy" id="privacy">
        <div aria-label="Privacy summary" className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-center gap-2 text-[17px] font-bold">
            <ShieldCheck size={22} weight="fill" className="text-ok" />
            {settings.polishEnabled ? "Only polished text leaves this computer" : "Nothing leaves this computer"}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-[14.5px]">
            <Row label="Your voice" value="Turned into text here, then discarded" />
            <Row label="Audio saved" value="Never" />
            <Row label="Network calls this session" value={String(boot.netCalls)} />
            <Row label="AI polish" value={settings.polishEnabled ? "On (text only, your key)" : "Off"} />
            <Row label="Tracking or analytics" value="None" />
            <Row label="Account needed" value="No" />
          </dl>
        </div>
      </Section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function PairEditor({
  fromLabel,
  toLabel,
  fromPlaceholder,
  toPlaceholder,
  addLabel,
  listLabel,
  pairs,
  onChange,
}: {
  fromLabel: string;
  toLabel: string;
  fromPlaceholder: string;
  toPlaceholder: string;
  addLabel: string;
  listLabel: string;
  pairs: [string, string][];
  onChange: (pairs: [string, string][]) => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | undefined>();

  function add(e: FormEvent) {
    e.preventDefault();
    if (!from.trim() || !to.trim()) {
      setError("Fill in both boxes.");
      return;
    }
    if (pairs.some(([f]) => f.toLowerCase() === from.trim().toLowerCase())) {
      setError(`"${from.trim()}" is already in the list.`);
      return;
    }
    onChange([...pairs, [from.trim(), to.trim()]]);
    setFrom("");
    setTo("");
    setError(undefined);
  }

  return (
    <div>
      {pairs.length > 0 && (
        <ul aria-label={listLabel} className="mb-4 divide-y divide-line rounded-2xl border border-line bg-surface">
          {pairs.map(([f, t], i) => (
            <li key={`${f}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate">{f}</span>
              <span aria-hidden className="text-muted">
                &rarr;
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{t}</span>
              <IconButton label={`Remove ${f}`} onClick={() => onChange(pairs.filter((_, j) => j !== i))}>
                <X size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3">
        <TextField label={fromLabel} placeholder={fromPlaceholder} value={from} onChange={(e) => setFrom(e.target.value)} />
        <TextField label={toLabel} placeholder={toPlaceholder} value={to} onChange={(e) => setTo(e.target.value)} />
        <Button type="submit" variant="primary" icon={<Plus size={17} weight="bold" />}>
          {addLabel}
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-accent-ink">
          {error}
        </p>
      )}
    </div>
  );
}

function PolishSection() {
  const { boot, settings, updateSettings, refresh } = useApp();
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  if (!boot || !settings) return null;

  async function saveKey(e: FormEvent) {
    e.preventDefault();
    try {
      await backend.setApiKey(key);
      setKey("");
      setStatus({ ok: true, text: "Key saved in your system's password store." });
      await refresh();
    } catch (error) {
      setStatus({ ok: false, text: String(error) });
    }
  }

  async function removeKey() {
    await backend.clearApiKey();
    await updateSettings({ polishEnabled: false });
    await refresh();
    setStatus({ ok: true, text: "Key removed." });
  }

  return (
    <Section title="Polish with Claude (optional)" id="polish">
      <p className="mb-2 text-[14.5px] leading-relaxed text-muted">
        Off unless you turn it on. Joe sends the finished text (never your audio) to Anthropic with your own API key, and Claude
        tidies grammar and punctuation. This is the only feature that uses the internet.
      </p>
      <Toggle
        label="Polish my dictations"
        description={boot.hasApiKey ? "Uses your saved key." : "Add your API key below first."}
        checked={settings.polishEnabled}
        onChange={(polishEnabled) => updateSettings({ polishEnabled })}
        disabled={!boot.hasApiKey}
      />
      {boot.hasApiKey ? (
        <div className="mt-2 flex items-center gap-3">
          <span className="text-[14.5px] font-semibold">A key is saved.</span>
          <Button variant="danger" onClick={removeKey}>
            Remove key
          </Button>
        </div>
      ) : (
        <form onSubmit={saveKey} className="mt-2 grid grid-cols-[1fr_auto] items-end gap-3">
          <TextField
            label="Claude API key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            hint="Stored in Keychain (Mac), Credential Manager (Windows) or Secret Service (Linux)."
          />
          <Button type="submit" variant="primary" className="mb-[26px]" disabled={!key.trim()}>
            Save key
          </Button>
        </form>
      )}
      {status && (
        <p role="status" className={`mt-2 text-[13.5px] ${status.ok ? "text-ok" : "text-accent-ink"}`}>
          {status.text}
        </p>
      )}
    </Section>
  );
}
