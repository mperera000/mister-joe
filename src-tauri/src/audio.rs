//! Microphone capture, conversion to 16 kHz mono for Whisper, and a simple
//! "is anyone talking?" check. Audio stays in memory and is never written to disk.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

pub const WHISPER_RATE: u32 = 16_000;

/// A recording in progress. Dropping it without calling `finish` discards the audio.
pub struct Recording {
    stop_tx: mpsc::Sender<()>,
    handle: Option<thread::JoinHandle<Result<(Vec<f32>, u32), String>>>,
    pub started: Instant,
}

impl Recording {
    /// Stops the microphone and returns the audio as 16 kHz mono samples.
    pub fn finish(mut self) -> Result<Vec<f32>, String> {
        let _ = self.stop_tx.send(());
        let handle = self.handle.take().ok_or("recording already finished")?;
        let (samples, rate) = handle.join().map_err(|_| "microphone thread crashed".to_string())??;
        Ok(resample(&samples, rate, WHISPER_RATE))
    }
}

impl Drop for Recording {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(());
    }
}

/// Starts recording from the default microphone. `on_level` receives a 0..1 loudness
/// value about 20 times a second, for the listening pill's meter.
pub fn start(on_level: impl Fn(f32) + Send + 'static) -> Result<Recording, String> {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    // cpal streams are not Send on every platform, so the stream lives on its own thread.
    let handle = thread::spawn(move || -> Result<(Vec<f32>, u32), String> {
        let fail = |msg: String, tx: &mpsc::Sender<Result<(), String>>| {
            let _ = tx.send(Err(msg.clone()));
            Err(msg)
        };
        let host = cpal::default_host();
        let Some(device) = host.default_input_device() else {
            return fail("No microphone found. Plug one in or check your sound settings.".into(), &ready_tx);
        };
        let supported = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => return fail(format!("Couldn't open the microphone: {e}"), &ready_tx),
        };
        let rate = supported.sample_rate();
        let channels = supported.channels() as usize;
        let config = supported.config();
        let buffer = Arc::new(Mutex::new(Vec::<f32>::with_capacity(rate as usize * 30)));

        let stream = match supported.sample_format() {
            SampleFormat::F32 => build::<f32>(&device, config, channels, buffer.clone(), on_level),
            SampleFormat::I16 => build::<i16>(&device, config, channels, buffer.clone(), on_level),
            SampleFormat::I32 => build::<i32>(&device, config, channels, buffer.clone(), on_level),
            SampleFormat::U16 => build::<u16>(&device, config, channels, buffer.clone(), on_level),
            other => Err(format!("This microphone's format ({other:?}) isn't supported yet.")),
        };
        let stream = match stream {
            Ok(s) => s,
            Err(e) => return fail(e, &ready_tx),
        };
        if let Err(e) = stream.play() {
            return fail(format!("Couldn't start the microphone: {e}"), &ready_tx);
        }
        let _ = ready_tx.send(Ok(()));

        // Wait until asked to stop (or the Recording is dropped).
        let _ = stop_rx.recv();
        drop(stream);
        let samples = std::mem::take(&mut *buffer.lock().unwrap());
        Ok((samples, rate))
    });

    match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(())) => Ok(Recording { stop_tx, handle: Some(handle), started: Instant::now() }),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("The microphone didn't respond.".into()),
    }
}

fn build<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    channels: usize,
    buffer: Arc<Mutex<Vec<f32>>>,
    on_level: impl Fn(f32) + Send + 'static,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = channels.max(1);
    let mut last_level = Instant::now();
    let mut peak = 0.0f32;
    device
        .build_input_stream::<T, _, _>(
            config,
            move |data: &[T], _info| {
                let mut buf = buffer.lock().unwrap();
                for frame in data.chunks(channels) {
                    let sum: f32 = frame.iter().map(|s| f32::from_sample(*s)).sum();
                    let v = sum / frame.len() as f32;
                    peak = peak.max(v.abs());
                    buf.push(v);
                }
                drop(buf);
                if last_level.elapsed() >= Duration::from_millis(50) {
                    // Map peak amplitude to a friendly 0..1 meter value.
                    on_level((peak * 4.0).min(1.0));
                    peak = 0.0;
                    last_level = Instant::now();
                }
            },
            |e| log::error!("microphone error: {e}"),
            None,
        )
        .map_err(|e| format!("Couldn't open the microphone stream: {e}"))
}

/// Converts audio between sample rates. Downsampling averages each output window
/// (a simple low-pass that avoids aliasing); upsampling interpolates linearly.
pub fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to || input.is_empty() || from == 0 || to == 0 {
        return input.to_vec();
    }
    let ratio = from as f64 / to as f64;
    let out_len = (input.len() as f64 / ratio).floor() as usize;
    let mut out = Vec::with_capacity(out_len);
    if ratio > 1.0 {
        for i in 0..out_len {
            let start = (i as f64 * ratio) as usize;
            let end = (((i + 1) as f64 * ratio) as usize).min(input.len()).max(start + 1);
            let window = &input[start..end];
            out.push(window.iter().sum::<f32>() / window.len() as f32);
        }
    } else {
        for i in 0..out_len {
            let pos = i as f64 * ratio;
            let idx = pos.floor() as usize;
            let frac = (pos - idx as f64) as f32;
            let a = input[idx];
            let b = *input.get(idx + 1).unwrap_or(&a);
            out.push(a + (b - a) * frac);
        }
    }
    out
}

/// True when the clip contains at least ~0.25 s of sound above a quiet-room level.
/// Used to throw away accidental Option holds and silent recordings.
pub fn has_speech(samples: &[f32]) -> bool {
    const FRAME: usize = 480; // 30 ms at 16 kHz
    const THRESHOLD: f32 = 0.012; // roughly -38 dBFS RMS
    let loud_frames = samples
        .chunks(FRAME)
        .filter(|f| {
            let rms = (f.iter().map(|s| s * s).sum::<f32>() / f.len() as f32).sqrt();
            rms > THRESHOLD
        })
        .count();
    loud_frames * FRAME >= (WHISPER_RATE as usize) / 4
}

/// True when every sample is exactly zero: macOS delivers pure silence when
/// microphone access has been denied.
pub fn is_digital_silence(samples: &[f32]) -> bool {
    !samples.is_empty() && samples.iter().all(|s| *s == 0.0)
}

/// Reads a WAV file (any rate, any channel count) as 16 kHz mono.
pub fn read_wav(path: &std::path::Path) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| format!("Couldn't open {}: {e}", path.display()))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader.samples::<f32>().filter_map(Result::ok).collect(),
        hound::SampleFormat::Int => {
            let scale = (1i64 << (spec.bits_per_sample - 1)) as f32;
            reader.samples::<i32>().filter_map(Result::ok).map(|s| s as f32 / scale).collect()
        }
    };
    let mono: Vec<f32> = raw.chunks(channels).map(|f| f.iter().sum::<f32>() / f.len() as f32).collect();
    Ok(resample(&mono, spec.sample_rate, WHISPER_RATE))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_48k_to_16k_keeps_duration() {
        let one_second = vec![0.5f32; 48_000];
        let out = resample(&one_second, 48_000, 16_000);
        assert_eq!(out.len(), 16_000);
        assert!(out.iter().all(|v| (v - 0.5).abs() < 1e-6));
    }

    #[test]
    fn resample_44k1_to_16k_length() {
        let out = resample(&vec![0.0f32; 44_100], 44_100, 16_000);
        assert!((out.len() as i64 - 16_000).abs() <= 1);
    }

    #[test]
    fn resample_upsamples() {
        let out = resample(&[0.0, 1.0], 8_000, 16_000);
        assert_eq!(out, vec![0.0, 0.5, 1.0, 1.0]);
    }

    #[test]
    fn silence_has_no_speech() {
        assert!(!has_speech(&vec![0.0f32; 16_000]));
        assert!(!has_speech(&vec![0.005f32; 16_000]));
    }

    #[test]
    fn loud_tone_counts_as_speech() {
        let tone: Vec<f32> = (0..16_000).map(|i| (i as f32 * 0.05).sin() * 0.3).collect();
        assert!(has_speech(&tone));
    }

    #[test]
    fn detects_denied_microphone() {
        assert!(is_digital_silence(&vec![0.0f32; 100]));
        assert!(!is_digital_silence(&[0.0, 0.001]));
        assert!(!is_digital_silence(&[]));
    }
}
