# Mister Joe: 2-minute demo

## 1. The problem (20 s)

"I pay $15 a month for Wispr Flow, a voice dictation app. Every word I say goes to their servers. It doesn't work offline, there's a cap on how long I can talk, there's no Linux app, and privacy settings like model training are on by default. Reviews point to outages and memory use as the biggest complaints."

## 2. Who it's for (10 s)

People who type all day: writers, PMs, support agents, developers, and anyone with RSI. Plus people who can't send audio to a cloud: lawyers, clinicians, anyone under NDA.

## 3. Live demo (60 s)

1. **Turn Wi-Fi off on stage.** Say so out loud.
2. Open Notes. **Hold Option**: Joe's pill pops up and the level bars move. Say: *"Hey, it's Mister Joe, um, remind me to send the budget to Priya by Friday. New paragraph. Also send the notes to my email."* Let go.
3. The text lands in Notes with "um" removed, a new paragraph, "Mister Joe" spelled right (dictionary) and `joe@example.com` filled in (snippet).
4. Show **History**: click **Open folder**. Every dictation is a Markdown file you own.
5. Show **Settings > Privacy**: "Nothing leaves this computer, 0 network calls."
6. Quick tap of Option, then Option+E: neither starts Joe, because Option shortcuts keep working.

## 4. How it's built (15 s)

Tauri desktop app with whisper.cpp running on the Mac's GPU. The speech models ship inside the installer. One codebase builds for Mac, Windows and Linux.

## 5. What I learned (15 s), the PM case study

- **Original scope:** a website. **Changed** to a downloadable app once "never rely on Wi-Fi" became the core promise. A website can't keep that promise.
- **Trade-off:** Option is the most natural key, but people use it for accents. I fixed that with a hold delay and cancel-on-other-key rather than picking an obscure key.
- **Quality bar:** 25 Rust tests and 9 cleanup tests, plus Seldon QA on the core flows.
- **Next:** signed and notarized builds, more languages, per-app tone.

## Backup if the live mic fails

Click **Try a sample** on Home. It runs a recorded clip through the same on-device engine and shows "Joe heard" next to "Joe typed".
