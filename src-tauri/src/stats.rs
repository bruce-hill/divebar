//! Background thread that gathers system stats and pushes them to the
//! frontend as `divebar://stats` events. Widgets subscribe to this single
//! event stream; adding a new stat means extending the payload here and
//! reading it from a widget on the JS side.

use serde_json::{json, Value};
use std::time::Duration;
use sysinfo::System;
use tauri::{AppHandle, Emitter};

const REFRESH_INTERVAL: Duration = Duration::from_secs(2);

pub fn spawn_stats_emitter(app: AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new();
        loop {
            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let payload = json!({
                "cpu": {
                    "usagePercent": sys.global_cpu_usage(),
                },
                "memory": {
                    "usedBytes": sys.used_memory(),
                    "totalBytes": sys.total_memory(),
                },
                "battery": read_battery(),
            });

            if app.emit("divebar://stats", payload).is_err() {
                break; // app is shutting down
            }
            std::thread::sleep(REFRESH_INTERVAL);
        }
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
