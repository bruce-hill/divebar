//! Background thread that gathers system stats and pushes them to the
//! frontend as `divebar://stats` events. Widgets subscribe to this single
//! event stream; adding a new stat means extending the payload here and
//! reading it from a widget on the JS side.
//!
//! Besides the periodic poll, watcher threads subscribe to PipeWire sink
//! events (pactl) and udev backlight/power events so volume, brightness,
//! and charger changes show up immediately instead of on the next tick.

use crate::events::Trigger;
use crate::readers::CpuTimes;
use serde_json::json;
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const REFRESH_INTERVAL: Duration = Duration::from_secs(2);
/// Don't recompute CPU usage more often than this — the /proc/stat delta
/// needs a gap between samples to produce meaningful numbers.
const CPU_MIN_INTERVAL: Duration = Duration::from_millis(900);
/// Post-trigger settle time, so a burst of change events (e.g. holding a
/// volume key) coalesces into one refresh.
const SETTLE: Duration = Duration::from_millis(30);

static REFRESH: Trigger = Trigger::new();

/// Asks the stats thread to refresh and emit immediately.
pub fn request_refresh() {
    REFRESH.notify();
}

pub fn spawn_stats_emitter(app: AppHandle) {
    let rx = REFRESH.subscribe();
    spawn_change_watchers();

    std::thread::spawn(move || {
        let mut prev_cpu: Option<CpuTimes> = None;
        let mut last_cpu = 0.0f32;
        let mut last_cpu_at: Option<Instant> = None;
        loop {
            if last_cpu_at.is_none_or(|t| t.elapsed() >= CPU_MIN_INTERVAL) {
                if let Some(curr) = crate::readers::read_cpu_times() {
                    if let Some(pct) =
                        prev_cpu.and_then(|prev| crate::readers::cpu_usage_percent(prev, curr))
                    {
                        last_cpu = pct;
                    }
                    prev_cpu = Some(curr);
                }
                last_cpu_at = Some(Instant::now());
            }

            let payload = json!({
                "cpu": {
                    "usagePercent": last_cpu,
                },
                "memory": crate::readers::read_memory(),
                "battery": crate::readers::read_battery(),
                "volume": crate::readers::read_volume(),
                "brightness": crate::readers::read_brightness(),
                "wifi": crate::readers::read_wifi(),
            });

            if !crate::events::emit(&app, "stats", payload) {
                break; // app is shutting down
            }

            if !rx.wait(REFRESH_INTERVAL, SETTLE) {
                break;
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
