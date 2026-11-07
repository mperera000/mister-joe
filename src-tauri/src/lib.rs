//! Mister Joe: hold Option, talk, and the words land in whatever app you're using.
//! Speech is transcribed on this computer. Nothing is uploaded.

pub mod audio;
pub mod history;
pub mod hotkey;
pub mod paste;
pub mod polish;
pub mod settings;
pub mod stt;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use settings::Settings;

const SAMPLE_CLIP: &str = "samples/joe-sample.wav";

struct Pending {
    id: u64,
    raw: String,
    duration: f32,
    model: String,
    done: bool,
}

pub struct AppState {
    settings: Arc<Mutex<Settings>>,
    settings_path: PathBuf,
    engine: Mutex<Option<Arc<stt::Engine>>>,
    engine_loading: AtomicBool,
    recording: Mutex<Option<audio::Recording>>,
    /// A recording started from the main window ("Test your mic"), which shows text instead of pasting.
    test_recording: Mutex<Option<audio::Recording>>,
    pending: Mutex<Option<Pending>>,
    next_id: AtomicU64,
    net_calls: AtomicU32,
    hotkey_error: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PhaseEvent {
    phase: &'static str,
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    id: u64,
    raw: String,
    duration_seconds: f32,
    model: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Bootstrap {
    settings: Settings,
    platform: &'static str,
    is_wayland: bool,
    engine_ready: bool,
    model_label: String,
    history_dir: String,
    net_calls: u32,
    version: String,
    accessibility: bool,
    hotkey_error: Option<String>,
    has_api_key: bool,
}

fn platform() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    }
}

fn accessibility_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        handy_keys::check_accessibility()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[cfg(target_os = "macos")]
fn request_accessibility_prompt() -> bool {
    use core_foundation::{base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, string::CFString};
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrustedWithOptions(options: core_foundation::dictionary::CFDictionaryRef) -> bool;
    }
    let key = CFString::new("AXTrustedCheckOptionPrompt");
    let options = CFDictionary::from_CFType_pairs(&[(key.as_CFType(), CFBoolean::true_value().as_CFType())]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

/// Ask macOS for the microphone the official way (AVCaptureDevice). Recording with
/// CoreAudio alone doesn't reliably show the "Allow microphone" question, which left
/// Joe out of the Microphone list after a permission reset.
#[cfg(target_os = "macos")]
fn request_microphone() {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, Bool};
    use objc2_foundation::NSString;
    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {}
    let Some(cls) = AnyClass::get(c"AVCaptureDevice") else { return };
    let audio = NSString::from_str("soun"); // AVMediaTypeAudio
    unsafe {
        let status: isize = msg_send![cls, authorizationStatusForMediaType: &*audio];
        if status == 0 {
            // 0 = not asked yet: this shows the macOS question.
            let done = RcBlock::new(|_granted: Bool| {});
            let _: () = msg_send![cls, requestAccessForMediaType: &*audio, completionHandler: &*done];
        }
    }
}

/// Accessibility is usually granted while Joe is open. Watch for it, then start the
/// Option-key listener and tell the screens, so nobody has to restart the app.
fn watch_accessibility(app: &AppHandle) {
    if accessibility_granted() {
        return;
    }
    // Like Momito: ask at launch, which also registers this exact build in the list.
    #[cfg(target_os = "macos")]
    request_accessibility_prompt();
    let app = app.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(1500));
        if accessibility_granted() {
            start_hotkey(&app);
            let _ = app.emit("joe://permissions", true);
            break;
        }
    });
}

fn emit_phase(app: &AppHandle, phase: &'static str, message: Option<String>) {
    let _ = app.emit("joe://phase", PhaseEvent { phase, message });
}

fn history_dir(s: &Settings) -> PathBuf {
    s.history_dir.as_ref().map(PathBuf::from).unwrap_or_else(history::default_dir)
}

fn model_path(app: &AppHandle, s: &Settings) -> Result<PathBuf, String> {
    if let Some(custom) = s.custom_model_path.as_ref().filter(|p| !p.is_empty()) {
        return Ok(PathBuf::from(custom));
    }
    let file = if s.model == "fast" { "ggml-base.en-q5_1.bin" } else { "ggml-small.en-q5_1.bin" };
    app.path()
        .resolve(format!("models/{file}"), BaseDirectory::Resource)
        .map_err(|e| format!("Speech model missing: {e}"))
}

/// Returns the loaded speech engine, loading (or switching) the model if needed.
fn engine(app: &AppHandle) -> Result<Arc<stt::Engine>, String> {
    let state = app.state::<AppState>();
    let wanted = model_path(app, &state.settings.lock().unwrap())?;
    let mut slot = state.engine.lock().unwrap();
    if let Some(e) = slot.as_ref().filter(|e| e.model_path == wanted) {
        return Ok(e.clone());
    }
    state.engine_loading.store(true, Ordering::SeqCst);
    let _ = app.emit("joe://engine", serde_json::json!({ "ready": false }));
    let loaded = stt::Engine::load(&wanted).map(Arc::new);
    state.engine_loading.store(false, Ordering::SeqCst);
    let loaded = loaded?;
    *slot = Some(loaded.clone());
    let _ = app.emit("joe://engine", serde_json::json!({ "ready": true, "label": loaded.model_label }));
    Ok(loaded)
}

fn vocabulary(s: &Settings) -> Vec<String> {
    s.dictionary.iter().map(|r| r.to.clone()).collect()
}

// ---------- the listening pill ----------

fn show_pill(app: &AppHandle) {
    let Some(pill) = app.get_webview_window("pill") else { return };
    if let Ok(Some(m)) = pill.primary_monitor() {
        let scale = m.scale_factor();
        let (mw, mh) = (m.size().width as f64, m.size().height as f64);
        let (w, h) = (300.0 * scale, 84.0 * scale);
        let x = m.position().x as f64 + (mw - w) / 2.0;
        let y = m.position().y as f64 + mh - h - 96.0 * scale;
        let _ = pill.set_position(PhysicalPosition::new(x as i32, y as i32));
    }
    let _ = pill.show();
}

fn hide_pill_after(app: &AppHandle, ms: u64) {
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(ms));
        // Don't hide if a new dictation started meanwhile.
        if app.state::<AppState>().recording.lock().unwrap().is_none() {
            if let Some(p) = app.get_webview_window("pill") {
                let _ = p.hide();
            }
        }
    });
}

// ---------- dictation flow ----------

fn start_dictation(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut slot = state.recording.lock().unwrap();
    if slot.is_some() {
        return;
    }
    paste::mask_alt_menu();
    let level_app = app.clone();
    match audio::start(move |level| {
        let _ = level_app.emit_to("pill", "joe://level", level);
    }) {
        Ok(rec) => {
            *slot = Some(rec);
            drop(slot);
            emit_phase(app, "listening", None);
            show_pill(app);
        }
        Err(e) => {
            drop(slot);
            emit_phase(app, "error", Some(e));
            show_pill(app);
            hide_pill_after(app, 3500);
        }
    }
}

fn cancel_dictation(app: &AppHandle) {
    let rec = app.state::<AppState>().recording.lock().unwrap().take();
    if rec.is_some() {
        drop(rec);
        emit_phase(app, "idle", None);
        hide_pill_after(app, 0);
    }
}

fn toggle_dictation(app: &AppHandle) {
    let recording = app.state::<AppState>().recording.lock().unwrap().is_some();
    if recording {
        stop_dictation(app);
    } else {
        start_dictation(app);
    }
}

fn stop_dictation(app: &AppHandle) {
    let Some(rec) = app.state::<AppState>().recording.lock().unwrap().take() else { return };
    emit_phase(app, "thinking", None);
    let app = app.clone();
    thread::spawn(move || {
        let result = (|| -> Result<Option<Transcript>, String> {
            let samples = rec.finish()?;
            if audio::is_digital_silence(&samples) {
                return Err(mic_blocked_message());
            }
            if !audio::has_speech(&samples) {
                return Ok(None);
            }
            let engine = engine(&app)?;
            let state = app.state::<AppState>();
            let vocab = vocabulary(&state.settings.lock().unwrap());
            let raw = engine.transcribe(&samples, &vocab)?;
            if raw.is_empty() {
                return Ok(None);
            }
            let id = state.next_id.fetch_add(1, Ordering::SeqCst);
            let duration = samples.len() as f32 / audio::WHISPER_RATE as f32;
            *state.pending.lock().unwrap() =
                Some(Pending { id, raw: raw.clone(), duration, model: engine.model_label.clone(), done: false });
            Ok(Some(Transcript { id, raw, duration_seconds: duration, model: engine.model_label.clone() }))
        })();

        match result {
            Ok(Some(t)) => {
                let id = t.id;
                let _ = app.emit_to("pill", "joe://transcript", t);
                // Safety net: if the pill doesn't finish in time, paste the raw text.
                // Polish goes over the network, so it gets longer.
                let state = app.state::<AppState>();
                let polish_on = state.settings.lock().unwrap().polish_enabled;
                thread::sleep(Duration::from_secs(if polish_on { 15 } else { 5 }));
                let fallback = {
                    let pending = state.pending.lock().unwrap();
                    pending.as_ref().filter(|p| p.id == id && !p.done).map(|p| p.raw.clone())
                };
                if let Some(raw) = fallback {
                    log::warn!("pill didn't answer; pasting raw text");
                    let _ = finalize(&app, id, raw, false);
                }
            }
            Ok(None) => {
                emit_phase(&app, "nothing", None);
                hide_pill_after(&app, 900);
            }
            Err(e) => {
                emit_phase(&app, "error", Some(e));
                hide_pill_after(&app, 4000);
            }
        }
    });
}

fn mic_blocked_message() -> String {
    if cfg!(target_os = "macos") {
        "Joe can't hear you. Allow Mister Joe in System Settings > Privacy & Security > Microphone.".into()
    } else {
        "Joe can't hear you. Check that your microphone is allowed and not muted.".into()
    }
}

fn finalize(app: &AppHandle, id: u64, text: String, polished: bool) -> Result<Option<history::Entry>, String> {
    let state = app.state::<AppState>();
    let (duration, model) = {
        let mut pending = state.pending.lock().unwrap();
        match pending.as_mut() {
            Some(p) if p.id == id && !p.done => {
                p.done = true;
                (p.duration, p.model.clone())
            }
            _ => return Ok(None), // already handled
        }
    };
    let s = state.settings.lock().unwrap().clone();
    let outcome = paste::deliver(&text, s.auto_paste, s.restore_clipboard)?;
    match outcome {
        paste::Outcome::Pasted => emit_phase(app, "done", None),
        paste::Outcome::Copied => emit_phase(
            app,
            "copied",
            Some(if cfg!(target_os = "macos") { "Copied. Press Cmd+V to paste." } else { "Copied. Press Ctrl+V to paste." }.into()),
        ),
    }
    hide_pill_after(app, if outcome == paste::Outcome::Pasted { 700 } else { 2500 });
    save_to_history(app, &s, &text, duration, &model, polished, "dictation")
}

fn save_to_history(
    app: &AppHandle,
    s: &Settings,
    text: &str,
    duration: f32,
    model: &str,
    polished: bool,
    source: &str,
) -> Result<Option<history::Entry>, String> {
    if !s.history_enabled || text.trim().is_empty() {
        return Ok(None);
    }
    let entry = history::save(
        &history_dir(s),
        &history::NewEntry { text, duration_seconds: duration, model, polished, source, created: chrono::Local::now() },
    )?;
    let _ = app.emit("joe://history-changed", ());
    Ok(Some(entry))
}

// ---------- commands for the screens ----------

#[tauri::command]
fn get_bootstrap(app: AppHandle) -> Bootstrap {
    let state = app.state::<AppState>();
    let s = state.settings.lock().unwrap().clone();
    let engine = state.engine.lock().unwrap().clone();
    let hotkey_error = state.hotkey_error.lock().unwrap().clone();
    Bootstrap {
        history_dir: history_dir(&s).display().to_string(),
        settings: s,
        platform: platform(),
        is_wayland: paste::is_wayland(),
        engine_ready: engine.is_some(),
        model_label: engine.map(|e| e.model_label.clone()).unwrap_or_default(),
        net_calls: state.net_calls.load(Ordering::SeqCst),
        version: app.package_info().version.to_string(),
        accessibility: accessibility_granted(),
        hotkey_error,
        has_api_key: polish::has_key(),
    }
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    settings::save(&state.settings_path, &settings)?;
    let model_changed = {
        let mut current = state.settings.lock().unwrap();
        let changed = current.model != settings.model || current.custom_model_path != settings.custom_model_path;
        *current = settings.clone();
        changed
    };
    let _ = app.emit("joe://settings-changed", &settings);
    if model_changed {
        let app = app.clone();
        thread::spawn(move || {
            if let Err(e) = engine(&app) {
                emit_phase(&app, "error", Some(e));
            }
        });
    }
    Ok(settings)
}

#[tauri::command]
async fn transcribe_sample(app: AppHandle) -> Result<Transcript, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clip = app.path().resolve(SAMPLE_CLIP, BaseDirectory::Resource).map_err(|e| e.to_string())?;
        let samples = audio::read_wav(&clip)?;
        let engine = engine(&app)?;
        let vocab = vocabulary(&app.state::<AppState>().settings.lock().unwrap());
        let raw = engine.transcribe(&samples, &vocab)?;
        Ok(Transcript {
            id: 0,
            raw,
            duration_seconds: samples.len() as f32 / audio::WHISPER_RATE as f32,
            model: engine.model_label.clone(),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn start_test_recording(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut slot = state.test_recording.lock().unwrap();
    if slot.is_some() {
        return Ok(());
    }
    let level_app = app.clone();
    *slot = Some(audio::start(move |level| {
        let _ = level_app.emit_to("main", "joe://level", level);
    })?);
    Ok(())
}

#[tauri::command]
async fn stop_test_recording(app: AppHandle) -> Result<Option<Transcript>, String> {
    let rec = app.state::<AppState>().test_recording.lock().unwrap().take();
    let Some(rec) = rec else { return Ok(None) };
    tauri::async_runtime::spawn_blocking(move || {
        let samples = rec.finish()?;
        if audio::is_digital_silence(&samples) {
            return Err(mic_blocked_message());
        }
        if !audio::has_speech(&samples) {
            return Ok(None);
        }
        let engine = engine(&app)?;
        let vocab = vocabulary(&app.state::<AppState>().settings.lock().unwrap());
        let raw = engine.transcribe(&samples, &vocab)?;
        Ok(Some(Transcript {
            id: 0,
            raw,
            duration_seconds: samples.len() as f32 / audio::WHISPER_RATE as f32,
            model: engine.model_label.clone(),
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn save_entry(
    app: AppHandle,
    text: String,
    duration_seconds: f32,
    model: String,
    polished: bool,
    source: String,
) -> Result<Option<history::Entry>, String> {
    let s = app.state::<AppState>().settings.lock().unwrap().clone();
    save_to_history(&app, &s, &text, duration_seconds, &model, polished, &source)
}

#[tauri::command]
fn finalize_dictation(app: AppHandle, id: u64, text: String, polished: bool) -> Result<Option<history::Entry>, String> {
    finalize(&app, id, text, polished)
}

#[tauri::command]
fn list_history(app: AppHandle) -> Vec<history::Entry> {
    let s = app.state::<AppState>().settings.lock().unwrap().clone();
    history::list(&history_dir(&s))
}

#[tauri::command]
fn delete_entry(app: AppHandle, id: String) -> Result<(), String> {
    let s = app.state::<AppState>().settings.lock().unwrap().clone();
    history::delete(&history_dir(&s), &id)?;
    let _ = app.emit("joe://history-changed", ());
    Ok(())
}

#[tauri::command]
fn copy_text(text: String) -> Result<(), String> {
    paste::copy(&text)
}

#[tauri::command]
fn open_history_folder(app: AppHandle) -> Result<(), String> {
    let s = app.state::<AppState>().settings.lock().unwrap().clone();
    let dir = history_dir(&s);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener().open_path(dir.display().to_string(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
async fn choose_history_folder(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app.dialog().file().set_title("Where should Mister Joe save your dictations?").blocking_pick_folder();
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()))
}

#[tauri::command]
async fn choose_model_file(app: AppHandle) -> Result<Option<String>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Choose a whisper.cpp model file (.bin)")
        .add_filter("whisper.cpp model", &["bin"])
        .blocking_pick_file();
    Ok(picked.and_then(|p| p.into_path().ok()).map(|p| p.display().to_string()))
}

#[tauri::command]
fn open_permission_settings(app: AppHandle, which: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if which == "accessibility" {
            // Asking with the prompt option makes macOS add this exact copy of Joe to the
            // Accessibility list. Without it, a switch left on for an older build looks
            // granted but doesn't count for this one.
            if !request_accessibility_prompt() {
                return handy_keys::open_accessibility_settings().map_err(|e| e.to_string());
            }
            return Ok(());
        }
        let url = "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
        return app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string());
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, which);
        Ok(())
    }
}

#[tauri::command]
fn permission_status() -> serde_json::Value {
    serde_json::json!({ "accessibility": accessibility_granted() })
}

#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    polish::set_key(&key)
}

#[tauri::command]
fn clear_api_key() -> Result<(), String> {
    polish::clear_key()
}

#[tauri::command]
async fn polish_text(app: AppHandle, text: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let enabled = app.state::<AppState>().settings.lock().unwrap().polish_enabled;
        if !enabled {
            return Err("Polish is off.".into());
        }
        app.state::<AppState>().net_calls.fetch_add(1, Ordering::SeqCst);
        let _ = app.emit("joe://net-calls", app.state::<AppState>().net_calls.load(Ordering::SeqCst));
        polish::polish(&text)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn show_main(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn restart_hotkey(app: AppHandle) -> Option<String> {
    start_hotkey(&app);
    app.state::<AppState>().hotkey_error.lock().unwrap().clone()
}

fn start_hotkey(app: &AppHandle) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    let state = app.state::<AppState>();
    if STARTED.load(Ordering::SeqCst) {
        return;
    }
    if !accessibility_granted() {
        *state.hotkey_error.lock().unwrap() = Some("needs-accessibility".into());
        return;
    }
    let handler_app = app.clone();
    let result = hotkey::spawn(state.settings.clone(), move |action| {
        let app = handler_app.clone();
        match action {
            hotkey::Action::Start => start_dictation(&app),
            hotkey::Action::Stop => stop_dictation(&app),
            hotkey::Action::Cancel => cancel_dictation(&app),
            hotkey::Action::Toggle => toggle_dictation(&app),
        }
    });
    match result {
        Ok(()) => {
            STARTED.store(true, Ordering::SeqCst);
            *state.hotkey_error.lock().unwrap() = None;
        }
        Err(e) => *state.hotkey_error.lock().unwrap() = Some(e),
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Mister Joe", true, None::<&str>)?;
    let talk = MenuItem::with_id(app, "talk", "Start or stop dictation", true, None::<&str>)?;
    let folder = MenuItem::with_id(app, "folder", "Open history folder", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Mister Joe", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &talk, &folder, &quit])?;
    TrayIconBuilder::with_id("joe")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip("Mister Joe")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app.clone()),
            "talk" => toggle_dictation(app),
            "folder" => {
                let _ = open_history_folder(app.clone());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    whisper_rs::install_logging_hooks();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if args.iter().any(|a| a == "--toggle") {
                toggle_dictation(app);
            } else {
                show_main(app.clone());
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            let settings = settings::load(&settings_path);
            app.manage(AppState {
                settings: Arc::new(Mutex::new(settings)),
                settings_path,
                engine: Mutex::new(None),
                engine_loading: AtomicBool::new(false),
                recording: Mutex::new(None),
                test_recording: Mutex::new(None),
                pending: Mutex::new(None),
                next_id: AtomicU64::new(1),
                net_calls: AtomicU32::new(0),
                hotkey_error: Mutex::new(None),
            });
            build_tray(app)?;
            start_hotkey(app.handle());
            watch_accessibility(app.handle());
            #[cfg(target_os = "macos")]
            request_microphone();
            // Warm up the speech model so the first dictation is quick.
            let handle = app.handle().clone();
            thread::spawn(move || {
                if let Err(e) = engine(&handle) {
                    log::error!("{e}");
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the main window keeps Joe running in the menu bar.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_bootstrap,
            save_settings,
            transcribe_sample,
            start_test_recording,
            stop_test_recording,
            save_entry,
            finalize_dictation,
            list_history,
            delete_entry,
            copy_text,
            open_history_folder,
            choose_history_folder,
            choose_model_file,
            open_permission_settings,
            permission_status,
            set_api_key,
            clear_api_key,
            polish_text,
            show_main,
            restart_hotkey,
        ])
        .build(tauri::generate_context!())
        .expect("error while running Mister Joe")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                // whisper.cpp's Metal backend aborts in its cleanup code at exit, which
                // made macOS show "Mister Joe quit unexpectedly" on every quit. Settings
                // and history are already on disk, so leave without that cleanup.
                extern "C" {
                    fn _exit(code: i32) -> !;
                }
                unsafe { _exit(0) }
            }
        });
}
