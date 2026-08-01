//! Readers for system state: the one home for "read a system source" —
//! process output (`run`), URL fetches (`fetch_url`), streaming process
//! output (`spawn_line_watcher`), and sysfs/procfs files. Each reader is
//! a thin impure fetch over a pure `parse_*` function, so the parsing is
//! unit-testable with string fixtures.
//!
//! The volume/brightness/wifi readers are both polled by the stats loop
//! and returned fresh from control commands (so widgets update instantly
//! after an adjustment instead of waiting for the next poll).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::ops::ControlFlow;
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread::JoinHandle;
use std::time::Duration;

pub fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Fetches a URL with curl, returning the response body on success.
pub fn fetch_url(url: &str, max_time_secs: u32) -> Option<Vec<u8>> {
    let output = Command::new("curl")
        .args(["-sf", "--max-time", &max_time_secs.to_string(), url])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(output.stdout)
}

/// A `spawn_line_watcher` callback event.
pub enum LineEvent<'a> {
    /// About to (re)start the watched command — fired before every spawn
    /// attempt, including retries, so state derived from the stream can
    /// be re-synced after a gap.
    Start,
    Line(&'a str),
}

/// Spawns a thread that runs `cmd` and feeds each stdout line to
/// `on_event`, restarting the command after `backoff` whenever it dies —
/// the streaming sibling of `run`, for processes that outlive one output.
/// `on_event` returns `ControlFlow::Break` to end the watcher and its
/// thread (production watchers run for the app's life; tests join).
pub fn spawn_line_watcher(
    cmd: &'static str,
    args: &'static [&'static str],
    backoff: Duration,
    mut on_event: impl FnMut(LineEvent) -> ControlFlow<()> + Send + 'static,
) -> JoinHandle<()> {
    std::thread::spawn(move || loop {
        if on_event(LineEvent::Start).is_break() {
            return;
        }
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
                        if on_event(LineEvent::Line(&line)).is_break() {
                            let _ = child.kill();
                            let _ = child.wait();
                            return;
                        }
                    }
                }
                let _ = child.wait();
            }
            Err(err) => {
                eprintln!("divebar: line watcher {cmd} failed: {err}");
            }
        }
        // The command died (daemon restart?) — retry with backoff.
        std::thread::sleep(backoff);
    })
}

pub fn read_volume() -> Value {
    match run("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]) {
        Some(output) => parse_volume(&output),
        None => Value::Null,
    }
}

/// `wpctl get-volume @DEFAULT_AUDIO_SINK@` → "Volume: 0.55 [MUTED]"
fn parse_volume(output: &str) -> Value {
    let muted = output.contains("[MUTED]");
    let Some(volume) = output
        .split_whitespace()
        .find_map(|tok| tok.parse::<f64>().ok())
    else {
        return Value::Null;
    };
    json!({
        "percent": (volume * 100.0).round() as u32,
        "muted": muted,
    })
}

pub fn read_brightness() -> Value {
    match run("brightnessctl", &["-m"]) {
        Some(output) => parse_brightness(&output),
        None => Value::Null,
    }
}

/// `brightnessctl -m` → "intel_backlight,backlight,19200,40%,48000"
fn parse_brightness(output: &str) -> Value {
    let Some(percent) = output
        .split(',')
        .find_map(|field| field.strip_suffix('%'))
        .and_then(|p| p.parse::<u32>().ok())
    else {
        return Value::Null;
    };
    json!({ "percent": percent })
}

/// SSID from iwgetid; signal quality from /proc/net/wireless.
pub fn read_wifi() -> Value {
    let ssid = run("iwgetid", &["-r"]).filter(|s| !s.is_empty());
    let signal_percent = std::fs::read_to_string("/proc/net/wireless")
        .ok()
        .and_then(|contents| parse_wireless_link(&contents))
        .map(link_to_percent);
    json!({
        "ssid": ssid,
        "signalPercent": signal_percent,
    })
}

/// Extracts the link-quality number from /proc/net/wireless contents.
fn parse_wireless_link(contents: &str) -> Option<f64> {
    // First two lines are headers; data lines are "wlan0: 0000   65.  -45. ..."
    let line = contents.lines().nth(2)?;
    line.split_whitespace()
        .nth(2)?
        .trim_end_matches('.')
        .parse::<f64>()
        .ok()
}

/// Link quality is out of 70 on most drivers.
fn link_to_percent(link: f64) -> u32 {
    ((link / 70.0 * 100.0).round() as u32).min(100)
}

/// Reads the first battery found under /sys/class/power_supply.
/// Returns null on desktop machines with no battery.
pub fn read_battery() -> Value {
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
            // "charging" really means "on AC": "Not charging" is the
            // kernel's plugged-in-but-holding state (charge threshold
            // reached, or firmware pausing at full).
            let plugged = matches!(status.as_str(), "Charging" | "Full" | "Not charging");
            return json!({
                "percent": percent,
                "charging": plugged,
                "timeRemainingMinutes": battery_time_remaining(&path, &status),
            });
        }
    }
    Value::Null
}

/// Reads the battery's fill-level and rate numbers and estimates time
/// remaining. Either energy_* (µWh with power µW) or charge_* (µAh with
/// current µA); the ratio works out the same either way.
fn battery_time_remaining(path: &Path, status: &str) -> Value {
    let read_num = |name: &str| -> Option<f64> {
        std::fs::read_to_string(path.join(name))
            .ok()?
            .trim()
            .parse::<f64>()
            .ok()
    };
    let (now, full, rate) = if let (Some(now), Some(full), Some(rate)) = (
        read_num("energy_now"),
        read_num("energy_full"),
        read_num("power_now"),
    ) {
        (now, full, rate)
    } else if let (Some(now), Some(full), Some(rate)) = (
        read_num("charge_now"),
        read_num("charge_full"),
        read_num("current_now"),
    ) {
        (now, full, rate)
    } else {
        return Value::Null;
    };
    time_remaining_minutes(now, full, rate, status)
}

/// Estimated minutes to empty (discharging) or full (charging) from the
/// battery's instantaneous draw. Null when the rate is ~0, the status is
/// neither, or the estimate is implausible (>48h).
fn time_remaining_minutes(now: f64, full: f64, rate: f64, status: &str) -> Value {
    if rate < 1.0 {
        return Value::Null;
    }
    let hours = match status {
        "Discharging" => now / rate,
        "Charging" => (full - now).max(0.0) / rate,
        _ => return Value::Null,
    };
    if !hours.is_finite() || hours > 48.0 {
        return Value::Null;
    }
    json!((hours * 60.0).round() as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_basic() {
        assert_eq!(
            parse_volume("Volume: 0.55"),
            json!({ "percent": 55, "muted": false })
        );
    }

    #[test]
    fn volume_muted_and_full() {
        assert_eq!(
            parse_volume("Volume: 1.00 [MUTED]"),
            json!({ "percent": 100, "muted": true })
        );
    }

    #[test]
    fn volume_garbage_is_null() {
        assert_eq!(parse_volume("no numbers here"), Value::Null);
    }

    #[test]
    fn brightness_percent_field() {
        assert_eq!(
            parse_brightness("intel_backlight,backlight,19200,40%,48000"),
            json!({ "percent": 40 })
        );
    }

    #[test]
    fn brightness_missing_percent_is_null() {
        assert_eq!(parse_brightness("intel_backlight,backlight,19200"), Value::Null);
    }

    #[test]
    fn wireless_link_from_proc() {
        let contents = "Inter-| sta-|   Quality        |   Discarded packets\n \
                        face | tus | link level noise |  nwid  crypt   frag\n \
                        wlan0: 0000   65.  -45.  -256        0      0      0\n";
        assert_eq!(parse_wireless_link(contents), Some(65.0));
        assert_eq!(link_to_percent(65.0), 93);
        assert_eq!(link_to_percent(80.0), 100); // capped
    }

    #[test]
    fn wireless_no_data_line_is_none() {
        assert_eq!(parse_wireless_link("header\nheader\n"), None);
    }

    #[test]
    fn time_remaining_discharging() {
        // 50 µWh left at 25 µW → 2 h → 120 min.
        assert_eq!(
            time_remaining_minutes(50.0, 100.0, 25.0, "Discharging"),
            json!(120)
        );
    }

    #[test]
    fn time_remaining_charging() {
        // 60 µWh to full at 30 µW → 2 h → 120 min.
        assert_eq!(
            time_remaining_minutes(40.0, 100.0, 30.0, "Charging"),
            json!(120)
        );
    }

    #[test]
    fn time_remaining_full_or_unknown_is_null() {
        assert_eq!(time_remaining_minutes(50.0, 100.0, 25.0, "Full"), Value::Null);
        assert_eq!(time_remaining_minutes(50.0, 100.0, 25.0, ""), Value::Null);
    }

    #[test]
    fn time_remaining_zero_rate_is_null() {
        assert_eq!(
            time_remaining_minutes(50.0, 100.0, 0.0, "Discharging"),
            Value::Null
        );
    }

    #[test]
    fn time_remaining_implausible_is_null() {
        // 5000 h estimate → null rather than a silly number.
        assert_eq!(
            time_remaining_minutes(5000.0, 10000.0, 1.0, "Discharging"),
            Value::Null
        );
    }

    fn watcher_events(
        cmd: &'static str,
        args: &'static [&'static str],
        backoff: Duration,
        stop_after: impl Fn(&[String]) -> bool + Send + 'static,
    ) -> Vec<String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut seen = Vec::new();
        let handle = spawn_line_watcher(cmd, args, backoff, move |event| {
            seen.push(match event {
                LineEvent::Start => "<start>".to_string(),
                LineEvent::Line(line) => line.to_string(),
            });
            tx.send(seen.last().unwrap().clone()).unwrap();
            if stop_after(&seen) {
                ControlFlow::Break(())
            } else {
                ControlFlow::Continue(())
            }
        });
        handle.join().unwrap();
        rx.try_iter().collect()
    }

    #[test]
    fn line_watcher_signals_start_then_streams_lines() {
        let events = watcher_events(
            "sh",
            &["-c", "echo alpha; echo beta"],
            Duration::from_secs(60),
            |seen| seen.last().is_some_and(|e| e == "beta"),
        );
        assert_eq!(events, ["<start>", "alpha", "beta"]);
    }

    #[test]
    fn line_watcher_restarts_with_a_fresh_start_event_after_the_command_exits() {
        let events = watcher_events(
            "sh",
            &["-c", "echo tick"],
            Duration::from_millis(5),
            |seen| seen.iter().filter(|e| *e == "tick").count() == 2,
        );
        assert_eq!(events, ["<start>", "tick", "<start>", "tick"]);
    }

    #[test]
    fn line_watcher_keeps_retrying_when_the_command_cannot_spawn() {
        let events = watcher_events(
            "divebar-test-no-such-command",
            &[],
            Duration::from_millis(5),
            |seen| seen.len() == 3,
        );
        assert_eq!(events, ["<start>", "<start>", "<start>"]);
    }
}
