//! Puts text into whatever app you're using: copy it, press Cmd+V / Ctrl+V for you,
//! then put your previous clipboard back.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Pasted,
    /// The text is on the clipboard but couldn't be pasted for you (Wayland, or
    /// auto-paste is off). The user presses Ctrl+V / Cmd+V.
    Copied,
}

// One clipboard handle for the app's lifetime: on Linux the owner has to stay alive
// for the copied text to remain available.
fn clipboard() -> Result<&'static Mutex<arboard::Clipboard>, String> {
    static CB: OnceLock<Result<Mutex<arboard::Clipboard>, String>> = OnceLock::new();
    CB.get_or_init(|| arboard::Clipboard::new().map(Mutex::new).map_err(|e| format!("Clipboard unavailable: {e}")))
        .as_ref()
        .map_err(|e| e.clone())
}

pub fn is_wayland() -> bool {
    cfg!(target_os = "linux")
        && std::env::var("XDG_SESSION_TYPE").map(|v| v.eq_ignore_ascii_case("wayland")).unwrap_or(false)
}

pub fn copy(text: &str) -> Result<(), String> {
    clipboard()?.lock().unwrap().set_text(text.to_string()).map_err(|e| format!("Couldn't copy: {e}"))
}

pub fn deliver(text: &str, auto_paste: bool, restore: bool) -> Result<Outcome, String> {
    if text.trim().is_empty() {
        return Ok(Outcome::Copied);
    }
    if !auto_paste || is_wayland() {
        copy(text)?;
        return Ok(Outcome::Copied);
    }
    let previous = if restore { clipboard()?.lock().unwrap().get_text().ok() } else { None };
    copy(text)?;
    thread::sleep(Duration::from_millis(40));
    if let Err(e) = press_paste() {
        log::warn!("paste keystroke failed: {e}");
        return Ok(Outcome::Copied);
    }
    if let Some(prev) = previous {
        // Give the target app time to read the clipboard before restoring it.
        thread::sleep(Duration::from_millis(350));
        let _ = clipboard()?.lock().unwrap().set_text(prev);
    }
    Ok(Outcome::Pasted)
}

fn press_paste() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let (modifier, v) = (Key::Meta, Key::Other(9)); // kVK_ANSI_V, works on any keyboard layout
    #[cfg(not(target_os = "macos"))]
    let (modifier, v) = (Key::Control, Key::Unicode('v'));
    enigo.key(modifier, Direction::Press).map_err(|e| e.to_string())?;
    let clicked = enigo.key(v, Direction::Click).map_err(|e| e.to_string());
    enigo.key(modifier, Direction::Release).map_err(|e| e.to_string())?;
    clicked
}

/// On Windows, releasing Alt on its own opens the focused app's menu bar. Sending an
/// unassigned key while Alt is held stops that (the same trick AutoHotkey uses).
pub fn mask_alt_menu() {
    #[cfg(target_os = "windows")]
    if let Ok(mut enigo) = Enigo::new(&Settings::default()) {
        let _ = enigo.key(Key::Other(0xE8), Direction::Click);
    }
}
