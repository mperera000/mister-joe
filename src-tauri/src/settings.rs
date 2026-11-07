//! Settings live in a plain, readable settings.json in the app's config folder.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Replacement {
    pub from: String,
    pub to: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub trigger: String,
    pub text: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// "option" (either side), "right-option", "left-option" or "fn" (Mac only).
    /// On Windows and Linux "option" means the Alt key.
    pub hotkey: String,
    /// "hold" (hold to talk) or "toggle" (tap to start, tap to stop).
    pub mode: String,
    /// "accurate" (small.en) or "fast" (base.en).
    pub model: String,
    pub custom_model_path: Option<String>,
    pub auto_paste: bool,
    pub restore_clipboard: bool,
    pub history_enabled: bool,
    pub history_dir: Option<String>,
    pub remove_fillers: bool,
    pub dictionary: Vec<Replacement>,
    pub snippets: Vec<Snippet>,
    /// Off by default. When on, text (never audio) goes to Claude with the user's own key.
    pub polish_enabled: bool,
    pub onboarded: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            hotkey: "option".into(),
            mode: "hold".into(),
            model: if cfg!(target_os = "macos") { "accurate".into() } else { "fast".into() },
            custom_model_path: None,
            auto_paste: true,
            restore_clipboard: true,
            history_enabled: true,
            history_dir: None,
            remove_fillers: true,
            dictionary: vec![],
            snippets: vec![],
            polish_enabled: false,
            onboarded: false,
        }
    }
}

pub fn load(path: &Path) -> Settings {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| format!("Couldn't save settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_keep_everything_private() {
        let s = Settings::default();
        assert!(!s.polish_enabled);
        assert_eq!(s.hotkey, "option");
        assert_eq!(s.mode, "hold");
    }

    #[test]
    fn round_trips_and_fills_missing_fields() {
        let dir = std::env::temp_dir().join(format!("joe-settings-{}", std::process::id()));
        let path = dir.join("settings.json");
        let mut s = Settings::default();
        s.dictionary.push(Replacement { from: "Mr. Joe".into(), to: "Mister Joe".into() });
        save(&path, &s).unwrap();
        assert_eq!(load(&path), s);
        std::fs::write(&path, r#"{"mode":"toggle"}"#).unwrap();
        let partial = load(&path);
        assert_eq!(partial.mode, "toggle");
        assert!(partial.auto_paste);
        let _ = std::fs::remove_dir_all(dir);
    }
}
