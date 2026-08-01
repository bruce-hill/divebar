//! Background thread that gathers system stats and pushes them to the
//! frontend as `divebar://stats` events. Widgets subscribe to this single
//! event stream; adding a new stat means extending the payload here and
//! reading it from a widget on the JS side.
//!
//! Besides the periodic poll, watcher threads subscribe to PipeWire sink
//! events (pactl) and udev backlight/power events so volume, brightness,
//! and charger changes show up immediately instead of on the next tick.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use sysinfo::System;
use tauri::{AppHandle, Emitter};

const REFRESH_INTERVAL: Duration = Duration::from_secs(2);
/// Don't recompute CPU usage more often than this — sysinfo needs a gap
/// between refreshes to produce meaningful numbers.
const CPU_MIN_INTERVAL: Duration = Duration::from_millis(900);

static TRIGGER: OnceLock<Sender<()>> = OnceLock::new();

/// Asks the stats thread to refresh and emit immediately.
pub fn request_refresh() {
    if let Some(tx) = TRIGGER.get() {
        let _ = tx.send(());
    }
}

pub fn spawn_stats_emitter(app: AppHandle) {
    let (tx, rx) = channel();
    let _ = TRIGGER.set(tx);
    spawn_change_watchers();

    std::thread::spawn(move || {
        let mut sys = System::new();
        let mut last_cpu = 0.0f32;
        let mut last_cpu_at: Option<Instant> = None;
        loop {
            if last_cpu_at.is_none_or(|t| t.elapsed() >= CPU_MIN_INTERVAL) {
                sys.refresh_cpu_usage();
                last_cpu = sys.global_cpu_usage();
                last_cpu_at = Some(Instant::now());
            }
            sys.refresh_memory();

            let payload = json!({
                "cpu": {
                    "usagePercent": last_cpu,
                },
                "memory": {
                    "usedBytes": sys.used_memory(),
                    "totalBytes": sys.total_memory(),
                },
                "battery": read_battery(),
                "volume": crate::readers::read_volume(),
                "brightness": crate::readers::read_brightness(),
                "wifi": crate::readers::read_wifi(),
            });

            if app.emit("divebar://stats", payload).is_err() {
                break; // app is shutting down
            }

            match rx.recv_timeout(REFRESH_INTERVAL) {
                Ok(()) => {
                    // Coalesce bursts (e.g. holding a volume key) into one
                    // refresh per ~30ms.
                    std::thread::sleep(Duration::from_millis(30));
                    while rx.try_recv().is_ok() {}
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

/// Watches for external changes and requests immediate refreshes:
/// - `pactl subscribe` for volume/mute (PipeWire's pulse interface)
/// - `udevadm monitor` for backlight and power-supply events
fn spawn_change_watchers() {
    spawn_line_watcher(
        "pactl",
        &["subscribe"],
        |line| line.contains("sink") || line.contains("server"),
    );
    spawn_line_watcher(
        "udevadm",
        &[
            "monitor",
            "--udev",
            "--subsystem-match=backlight",
            "--subsystem-match=power_supply",
        ],
        |line| line.contains("change"),
    );
}

fn spawn_line_watcher(
    cmd: &'static str,
    args: &'static [&'static str],
    matches: fn(&str) -> bool,
) {
    std::thread::spawn(move || loop {
        match Command::new(cmd)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(mut child) => {
                if let Some(stdout) = child.stdout.take() {
                    for line in BufReader::new(stdout).lines() {
                        let Ok(line) = line else { break };
                        if matches(&line) {
                            request_refresh();
                        }
                    }
                }
                let _ = child.wait();
            }
            Err(err) => {
                eprintln!("divebar: change watcher {cmd} failed: {err}");
            }
        }
        // Watcher died (daemon restart?) — retry with backoff.
        std::thread::sleep(Duration::from_secs(10));
    });
}

/// Reads the first battery found under /sys/class/power_supply.
/// Returns null on desktop machines with no battery.
fn read_battery() -> Value {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return Value::Null;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let is_battery = std::fs::read_to_string(path.join("type"))
            .map(|t| t.trim() == "Battery")
            .unwrap_or(false);
        if !is_battery {
            continue;
        }
        let capacity = std::fs::read_to_string(path.join("capacity"))
            .ok()
            .and_then(|s| s.trim().parse::<u8>().ok());
        let status = std::fs::read_to_string(path.join("status"))
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        if let Some(percent) = capacity {
            return json!({
                "percent": percent,
                "charging": status == "Charging" || status == "Full",
            });
        }
    }
    Value::Null
}
