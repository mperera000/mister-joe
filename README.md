<p align="center"><img src="public/mister-joe.svg" width="120" alt="Mister Joe, a cartoon guy in a red ball cap"></p>

# Mister Joe

**Hold Option, talk, let go. Joe types it wherever your cursor is.**

Mister Joe is a free dictation app for Mac, Windows and Linux. Your voice is turned into text **on your own computer**. Nothing is uploaded, it works with Wi-Fi off, there's no account, no subscription and no time limit on how long you talk.

Built at Ship Happens (Seldon hackathon, San Francisco, Nov 7 2026) as a replacement for a $15/month cloud dictation subscription.

## Why

| | Typical cloud dictation | Mister Joe |
|---|---|---|
| Where speech is processed | Their servers | Your computer |
| Works offline | No | Yes |
| Cost | Monthly subscription | Free |
| Session limit | Minutes per dictation | None |
| Your history | Their database | Plain Markdown files in a folder you choose |
| Linux | Not supported | Supported |
| Account | Required | None |

## Install

Download the installer for your computer from the [Releases](../../releases) page. It's about 240 MB because both speech models are inside it, so the app never needs to download anything after this.

### Mac (Apple Silicon)

1. Open the `.dmg` and drag **Mister Joe** into **Applications**.
2. Open it. Joe isn't notarized by Apple yet, so macOS says it "could not verify" the app. Click **Done**.
3. Go to **System Settings > Privacy & Security**, scroll down to the message about Mister Joe and click **Open Anyway**. You only do this once.

(Right-click > Open no longer skips this check on macOS 15 and later. If you're comfortable in Terminal, `xattr -dr com.apple.quarantine "/Applications/Mister Joe.app"` does the same thing.)

### Windows

Run the `-setup.exe` (or the `.msi`). The installer isn't signed yet, so if Windows says "Windows protected your PC", click **More info**, then **Run anyway**.

### Linux

- **AppImage:** make it runnable with `chmod +x Mister*.AppImage`, then double-click it.
- **Debian or Ubuntu:** `sudo apt install ./Mister*.deb`

## First run

1. Click **Test your mic** and say something. Your computer will ask once for microphone access.
2. **Mac:** turn Joe on in System Settings > Privacy & Security > **Accessibility**. Joe needs this to notice the Option key and to type for you.
3. Click into any text box, **hold Option** (Alt on Windows and Linux), talk, and let go.

Things that keep working as before: a quick tap of Option, and Option with another key (like Option+E for accents). Joe only listens when Option is held on its own for a moment.

Prefer tapping? In Settings, switch to **Tap to start, tap to stop**, and press Esc to cancel.

### Linux notes

- The hold-Alt key reads the keyboard directly, so it works on both X11 and Wayland. Add yourself to the `input` group once: `sudo usermod -aG input $USER`, then log out and back in.
- On Wayland, apps can't type for each other, so Joe copies the text and shows "Press Ctrl+V".
- You can also bind any system shortcut to `mister-joe --toggle`.

## What Joe does with your words

1. Records only while you hold the key. Audio stays in memory and is thrown away after transcription.
2. Transcribes with [whisper.cpp](https://github.com/ggml-org/whisper.cpp) on your Apple GPU (Metal) or CPU. Two models are included: **Accurate** (small.en) and **Fast** (base.en). You can also point Joe at any whisper.cpp model file.
3. Cleans up: removes "um" and "uh", handles "new line" and "new paragraph", applies your **Dictionary** fixes and **Snippets**.
4. Pastes into the app you're using, then puts your clipboard back.
5. Saves a Markdown file in `~/Documents/Mister Joe/` (you can change the folder or turn history off).

**Optional:** *Polish with Claude* sends the finished text (never audio) to Anthropic using your own API key, which is kept in your system's password store. It's off unless you turn it on, and it's the only part of Joe that uses the internet.

## Build from source

You need Node 22+, Rust (stable) and cmake.

```bash
npm install
./scripts/fetch-models.sh      # downloads the two speech models into src-tauri/resources/models
npm run tauri dev              # run the app
npm run tauri build            # make an installer for this computer
```

Tests:

```bash
npm test                       # text cleanup rules
cd src-tauri && cargo test     # audio, hotkey logic, history files, settings, polish request
```

## QA preview mode

`npm run dev` serves Joe's screens at http://localhost:1420 in a normal browser. In a browser there's no speech engine, so "Try a sample" uses the real engine's output for the bundled sample clip, and the screen says it's a preview. `seldon.yml` holds the Seldon QA cases that run against it.

## Tech

Tauri v2 (Rust + system webview), React 19, TypeScript, Tailwind v4, whisper-rs, cpal, handy-keys, enigo, arboard. Mister Joe is an original character.

## License

MIT
