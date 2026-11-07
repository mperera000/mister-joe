//! Hold Option (Alt on Windows and Linux) to talk.
//!
//! Option is also used for accents and shortcuts, so Joe only starts listening when
//! Option is held on its own for a moment. Pressing any other key or clicking while
//! it's held cancels, so Option+E, Option-drag and friends keep working.

use handy_keys::{Key, KeyboardListener, Modifiers};
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use crate::settings::Settings;

pub const HOLD_DELAY: Duration = Duration::from_millis(300);

/// Which Option key started the current dictation: 0 unknown, 1 left, 2 right.
/// The pill uses it to make Joe cup the ear on that side.
static LAST_SIDE: AtomicU8 = AtomicU8::new(0);

pub fn last_side() -> Option<&'static str> {
    match LAST_SIDE.load(Ordering::Relaxed) {
        1 => Some("left"),
        2 => Some("right"),
        _ => None,
    }
}
const TAP_MAX: Duration = Duration::from_millis(400);

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Action {
    Start,
    Stop,
    Cancel,
    Toggle,
}

pub fn target(hotkey: &str) -> Modifiers {
    match hotkey {
        "right-option" => Modifiers::OPT_RIGHT,
        "left-option" => Modifiers::OPT_LEFT,
        "fn" if cfg!(target_os = "macos") => Modifiers::FN,
        _ => Modifiers::OPT,
    }
}

/// The pure decision logic, kept separate from the OS listener so it can be tested.
#[derive(Default)]
pub struct Machine {
    down_since: Option<Instant>,
    spoiled: bool,
    active: bool,
}

pub enum Input {
    TargetDown { others_held: bool },
    TargetUp,
    OtherKeyDown { escape: bool },
    Tick,
}

impl Machine {
    pub fn step(&mut self, input: Input, hold_mode: bool, now: Instant) -> Option<Action> {
        match input {
            Input::TargetDown { others_held } => {
                if self.down_since.is_none() && !others_held {
                    self.down_since = Some(now);
                    self.spoiled = false;
                }
                None
            }
            Input::TargetUp => {
                let since = self.down_since.take()?;
                if hold_mode {
                    if self.active {
                        self.active = false;
                        return Some(if self.spoiled { Action::Cancel } else { Action::Stop });
                    }
                    None
                } else if !self.spoiled && now.duration_since(since) < TAP_MAX {
                    Some(Action::Toggle)
                } else {
                    None
                }
            }
            Input::OtherKeyDown { escape } => {
                if self.down_since.is_some() {
                    self.spoiled = true;
                    if self.active {
                        self.active = false;
                        return Some(Action::Cancel);
                    }
                }
                if escape && !hold_mode {
                    return Some(Action::Cancel);
                }
                None
            }
            Input::Tick => {
                let since = self.down_since?;
                if hold_mode && !self.active && !self.spoiled && now.duration_since(since) >= HOLD_DELAY {
                    self.active = true;
                    return Some(Action::Start);
                }
                None
            }
        }
    }
}

/// Starts the global key listener on its own thread.
pub fn spawn(settings: Arc<Mutex<Settings>>, on_action: impl Fn(Action) + Send + 'static) -> Result<(), String> {
    let listener = KeyboardListener::new().map_err(|e| format!("Couldn't watch the keyboard: {e}"))?;
    thread::Builder::new()
        .name("joe-hotkey".into())
        .spawn(move || {
            let mut machine = Machine::default();
            loop {
                let (target, hold_mode) = {
                    let s = settings.lock().unwrap();
                    (target(&s.hotkey), s.mode != "toggle")
                };
                let started_wait = Instant::now();
                let input = match listener.recv_timeout(Duration::from_millis(30)) {
                    Ok(ev) => match ev.changed_modifier {
                        Some(changed) if changed.intersects(target) => {
                            if ev.is_key_down {
                                let side = if changed.intersects(Modifiers::OPT_RIGHT) {
                                    2
                                } else if changed.intersects(Modifiers::OPT_LEFT) {
                                    1
                                } else {
                                    0
                                };
                                LAST_SIDE.store(side, Ordering::Relaxed);
                                let ignore = target | Modifiers::OPT | Modifiers::FN;
                                Input::TargetDown { others_held: !(ev.modifiers & !ignore).is_empty() }
                            } else {
                                Input::TargetUp
                            }
                        }
                        Some(_) if ev.is_key_down => Input::OtherKeyDown { escape: false },
                        Some(_) => Input::Tick,
                        None if ev.is_key_down && ev.key.is_some() => {
                            Input::OtherKeyDown { escape: ev.key == Some(Key::Escape) }
                        }
                        None => Input::Tick,
                    },
                    Err(_) => {
                        // A disconnected listener returns instantly; don't spin.
                        if started_wait.elapsed() < Duration::from_millis(5) {
                            thread::sleep(Duration::from_millis(30));
                        }
                        Input::Tick
                    }
                };
                let now = Instant::now();
                if let Some(action) = machine.step(input, hold_mode, now) {
                    on_action(action);
                }
                if let Some(action) = machine.step(Input::Tick, hold_mode, now) {
                    on_action(action);
                }
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(base: Instant, ms: u64) -> Instant {
        base + Duration::from_millis(ms)
    }

    #[test]
    fn hold_talk_release() {
        let t = Instant::now();
        let mut m = Machine::default();
        assert_eq!(m.step(Input::TargetDown { others_held: false }, true, t), None);
        assert_eq!(m.step(Input::Tick, true, at(t, 100)), None);
        assert_eq!(m.step(Input::Tick, true, at(t, 310)), Some(Action::Start));
        assert_eq!(m.step(Input::Tick, true, at(t, 900)), None);
        assert_eq!(m.step(Input::TargetUp, true, at(t, 2000)), Some(Action::Stop));
    }

    #[test]
    fn quick_tap_does_nothing_in_hold_mode() {
        let t = Instant::now();
        let mut m = Machine::default();
        m.step(Input::TargetDown { others_held: false }, true, t);
        assert_eq!(m.step(Input::TargetUp, true, at(t, 120)), None);
        assert_eq!(m.step(Input::Tick, true, at(t, 500)), None);
    }

    #[test]
    fn option_e_types_an_accent_instead() {
        let t = Instant::now();
        let mut m = Machine::default();
        m.step(Input::TargetDown { others_held: false }, true, t);
        assert_eq!(m.step(Input::OtherKeyDown { escape: false }, true, at(t, 80)), None);
        assert_eq!(m.step(Input::Tick, true, at(t, 600)), None);
        assert_eq!(m.step(Input::TargetUp, true, at(t, 700)), None);
    }

    #[test]
    fn key_pressed_while_talking_cancels() {
        let t = Instant::now();
        let mut m = Machine::default();
        m.step(Input::TargetDown { others_held: false }, true, t);
        assert_eq!(m.step(Input::Tick, true, at(t, 350)), Some(Action::Start));
        assert_eq!(m.step(Input::OtherKeyDown { escape: false }, true, at(t, 900)), Some(Action::Cancel));
        assert_eq!(m.step(Input::TargetUp, true, at(t, 1000)), None);
    }

    #[test]
    fn cmd_option_combo_never_starts() {
        let t = Instant::now();
        let mut m = Machine::default();
        m.step(Input::TargetDown { others_held: true }, true, t);
        assert_eq!(m.step(Input::Tick, true, at(t, 800)), None);
    }

    #[test]
    fn toggle_mode_taps() {
        let t = Instant::now();
        let mut m = Machine::default();
        m.step(Input::TargetDown { others_held: false }, false, t);
        assert_eq!(m.step(Input::Tick, false, at(t, 350)), None);
        assert_eq!(m.step(Input::TargetUp, false, at(t, 380)), Some(Action::Toggle));
        assert_eq!(m.step(Input::OtherKeyDown { escape: true }, false, at(t, 5000)), Some(Action::Cancel));
    }

    #[test]
    fn maps_settings_to_keys() {
        assert_eq!(target("option"), Modifiers::OPT);
        assert_eq!(target("right-option"), Modifiers::OPT_RIGHT);
    }
}
