//! Readers for system state that is both polled by the stats loop and
//! returned fresh from control commands (so widgets update instantly after
//! an adjustment instead of waiting for the next poll).

use serde_json::{json, Value};
use std::process::Command;

pub fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(cmd).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// `wpctl get-volume @DEFAULT_AUDIO_SINK@` → "Volume: 0.55 [MUTED]"
pub fn read_volume() -> Value {
    let Some(output) = run("wpctl", &["get-volume", "@DEFAULT_AUDIO_SINK@"]) else {
        return Value::Null;
    };
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

/// `brightnessctl -m` → "intel_backlight,backlight,19200,40%,48000"
pub fn read_brightness() -> Value {
    let Some(output) = run("brightnessctl", &["-m"]) else {
        return Value::Null;
    };
    let Some(percent) = output
        .split(',')
        .find_map(|field| field.strip_suffix('%'))
        .and_then(|p| p.parse::<u32>().ok())
    else {
        return Value::Null;
    };
    json!({ "percent": percent })
}

/// SSID from iwgetid; signal quality from /proc/net/wireless (link is
/// out of 70 on most drivers).
pub fn read_wifi() -> Value {
    let ssid = run("iwgetid", &["-r"]).filter(|s| !s.is_empty());
    let signal_percent = read_wireless_link().map(|link| {
        ((link / 70.0 * 100.0).round() as u32).min(100)
    });
    json!({
        "ssid": ssid,
        "signalPercent": signal_percent,
    })
}

fn read_wireless_link() -> Option<f64> {
    let contents = std::fs::read_to_string("/proc/net/wireless").ok()?;
    // First two lines are headers; data lines are "wlan0: 0000   65.  -45. ..."
    let line = contents.lines().nth(2)?;
    line.split_whitespace()
        .nth(2)?
        .trim_end_matches('.')
        .parse::<f64>()
        .ok()
}
