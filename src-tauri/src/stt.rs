//! On-device speech to text with whisper.cpp. Runs on the Apple GPU (Metal) on Macs
//! and on the CPU elsewhere. Long audio is handled in 30-second windows by
//! whisper.cpp itself, so there is no session cap.

use std::path::{Path, PathBuf};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct Engine {
    ctx: WhisperContext,
    pub model_path: PathBuf,
    pub model_label: String,
}

impl Engine {
    pub fn load(path: &Path) -> Result<Self, String> {
        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(path, params)
            .map_err(|e| format!("Couldn't load the speech model {}: {e}", path.display()))?;
        Ok(Self { ctx, model_path: path.to_path_buf(), model_label: model_label(path) })
    }

    /// Transcribes 16 kHz mono audio. `vocabulary` (your dictionary's spellings)
    /// nudges Whisper toward the right names.
    pub fn transcribe(&self, audio: &[f32], vocabulary: &[String]) -> Result<String, String> {
        let mut state = self.ctx.create_state().map_err(|e| format!("Speech engine error: {e}"))?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_n_threads(threads());
        params.set_translate(false);
        params.set_no_context(true);
        params.set_suppress_blank(true);
        params.set_temperature(0.0);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_special(false);
        params.set_print_timestamps(false);
        let prompt = vocabulary_prompt(vocabulary);
        if let Some(p) = prompt.as_deref() {
            params.set_initial_prompt(p);
        }

        // whisper.cpp wants at least one second of audio.
        let mut padded;
        let audio = if audio.len() < 16_000 {
            padded = audio.to_vec();
            padded.resize(16_000 + 1_600, 0.0);
            &padded[..]
        } else {
            audio
        };

        state.full(params, audio).map_err(|e| format!("Speech engine error: {e}"))?;
        let mut text = String::new();
        for segment in state.as_iter() {
            if let Ok(s) = segment.to_str_lossy() {
                text.push_str(&s);
            }
        }
        Ok(strip_non_speech(&text))
    }
}

fn threads() -> i32 {
    let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    n.clamp(2, 8) as i32
}

fn model_label(path: &Path) -> String {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("model");
    if name.contains("small") {
        "Accurate (small.en)".into()
    } else if name.contains("base") {
        "Fast (base.en)".into()
    } else {
        name.trim_start_matches("ggml-").trim_end_matches(".bin").to_string()
    }
}

fn vocabulary_prompt(words: &[String]) -> Option<String> {
    let words: Vec<&str> = words.iter().map(|w| w.trim()).filter(|w| !w.is_empty()).take(40).collect();
    if words.is_empty() {
        None
    } else {
        Some(format!("Vocabulary: {}.", words.join(", ")))
    }
}

/// Removes Whisper's non-speech markers such as "[BLANK_AUDIO]" or "(music)".
pub fn strip_non_speech(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth_sq = 0;
    let mut depth_par = 0;
    for c in text.chars() {
        match c {
            '[' => depth_sq += 1,
            ']' if depth_sq > 0 => depth_sq -= 1,
            '(' => depth_par += 1,
            ')' if depth_par > 0 => depth_par -= 1,
            _ if depth_sq == 0 && depth_par == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_markers() {
        assert_eq!(strip_non_speech(" [BLANK_AUDIO] "), "");
        assert_eq!(strip_non_speech(" Hello (laughs) there [Music]"), "Hello there");
    }

    #[test]
    fn builds_vocabulary_prompt() {
        assert_eq!(vocabulary_prompt(&[]), None);
        assert_eq!(
            vocabulary_prompt(&["Mister Joe".into(), " ".into(), "Priya".into()]),
            Some("Vocabulary: Mister Joe, Priya.".into())
        );
    }

    #[test]
    fn labels_models() {
        assert_eq!(model_label(Path::new("/x/ggml-small.en-q5_1.bin")), "Accurate (small.en)");
        assert_eq!(model_label(Path::new("/x/ggml-base.en-q5_1.bin")), "Fast (base.en)");
    }
}
