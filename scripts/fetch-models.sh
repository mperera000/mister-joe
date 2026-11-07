#!/usr/bin/env bash
# Downloads the whisper.cpp speech models that ship inside Mister Joe.
# They are bundled into the installer, so the installed app never goes online for them.
# Used locally and by CI (the files are too big to keep in git).
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="src-tauri/resources/models"
BASE="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
MODELS=("ggml-base.en-q5_1.bin" "ggml-small.en-q5_1.bin")

mkdir -p "$DEST"
for m in "${MODELS[@]}"; do
  if [ -s "$DEST/$m" ]; then
    echo "have: $m"
  else
    curl -sfL --retry 3 "$BASE/$m" -o "$DEST/$m.part" && mv "$DEST/$m.part" "$DEST/$m"
    echo "done: $m ($(du -h "$DEST/$m" | cut -f1))"
  fi
done
