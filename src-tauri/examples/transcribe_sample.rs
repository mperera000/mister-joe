//! Quick check that on-device transcription works:
//!   cargo run --release --example transcribe_sample -- [model.bin] [clip.wav]
use mister_joe_lib::{audio, stt};
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let args: Vec<String> = std::env::args().collect();
    let model = args.get(1).map(PathBuf::from).unwrap_or(root.join("resources/models/ggml-small.en-q5_1.bin"));
    let clip = args.get(2).map(PathBuf::from).unwrap_or(root.join("resources/samples/joe-sample.wav"));

    whisper_rs::install_logging_hooks();
    let t = Instant::now();
    let engine = stt::Engine::load(&model).expect("load model");
    println!("loaded {} in {:?}", engine.model_label, t.elapsed());

    let samples = audio::read_wav(&clip).expect("read clip");
    println!("clip: {:.1} s, speech: {}", samples.len() as f32 / 16_000.0, audio::has_speech(&samples));
    let t = Instant::now();
    let text = engine.transcribe(&samples, &[]).expect("transcribe");
    println!("transcribed in {:?}\n---\n{text}\n---", t.elapsed());
}
