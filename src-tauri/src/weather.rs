//! Weather via wttr.in (no API key; IP-based geolocation unless the
//! weather widget's `location` option is set). Fetched with curl every
//! 15 minutes, emitted as `divebar://weather` events, and re-fetched when
//! the config changes location.

use serde_json::{json, Value};
use std::process::Command;
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const FETCH_INTERVAL: Duration = Duration::from_secs(15 * 60);
const RETRY_INTERVAL: Duration = Duration::from_secs(60);

static LATEST: Mutex<Option<Value>> = Mutex::new(None);
static TRIGGER: OnceLock<Sender<()>> = OnceLock::new();

pub fn latest_state() -> Value {
    LATEST.lock().unwrap().clone().unwrap_or(Value::Null)
}

/// Wakes the weather thread (e.g. after a config save, in case the
/// location option changed). It only refetches if the location actually
/// differs or the data is stale.
pub fn request_refresh() {
    if let Some(tx) = TRIGGER.get() {
        let _ = tx.send(());
    }
}

/// The `location` option of the first weather widget in the config.
fn configured_location() -> String {
    let config = crate::config::load();
    config["widgets"]
        .as_array()
        .and_then(|widgets| {
            widgets
                .iter()
                .find(|w| w["widget"] == "weather")
                .and_then(|w| w["options"]["location"].as_str())
        })
        .unwrap_or("")
        .trim()
        .to_string()
}

pub fn spawn_weather(app: AppHandle) {
    let (tx, rx) = channel();
    let _ = TRIGGER.set(tx);

    std::thread::spawn(move || {
        let mut last_location: Option<String> = None;
        let mut last_fetch: Option<Instant> = None;
        let mut last_ok = false;
        loop {
            let location = configured_location();
            let due = match last_fetch {
                None => true,
                Some(t) => {
                    t.elapsed() >= if last_ok { FETCH_INTERVAL } else { RETRY_INTERVAL }
                }
            };
            if due || last_location.as_deref() != Some(&location) {
                let payload = fetch(&location);
                last_ok = !payload.is_null();
                last_fetch = Some(Instant::now());
                last_location = Some(location);
                if last_ok {
                    *LATEST.lock().unwrap() = Some(payload.clone());
                    let _ = app.emit("divebar://weather", payload);
                }
            }
            match rx.recv_timeout(RETRY_INTERVAL) {
                Ok(()) => {
                    while rx.try_recv().is_ok() {}
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
    });
}

fn fetch(location: &str) -> Value {
    let url = format!(
        "https://wttr.in/{}?format=j1",
        location.replace(' ', "+")
    );
    let output = Command::new("curl")
        .args(["-sf", "--max-time", "15", &url])
        .output();
    let Ok(output) = output else {
        return Value::Null;
    };
    if !output.status.success() {
        return Value::Null;
    }
    let Ok(data) = serde_json::from_slice::<Value>(&output.stdout) else {
        return Value::Null;
    };

    let current = &data["current_condition"][0];
    let text = |v: &Value| v.as_str().unwrap_or("").to_string();
    let num = |v: &Value| v.as_str().and_then(|s| s.parse::<f64>().ok());

    let Some(temp_c) = num(&current["temp_C"]) else {
        return Value::Null;
    };
    json!({
        "tempC": temp_c,
        "tempF": num(&current["temp_F"]),
        "feelsC": num(&current["FeelsLikeC"]),
        "feelsF": num(&current["FeelsLikeF"]),
        "code": text(&current["weatherCode"]).parse::<u32>().ok(),
        "desc": text(&current["weatherDesc"][0]["value"]),
        "humidity": num(&current["humidity"]),
        "area": text(&data["nearest_area"][0]["areaName"][0]["value"]),
    })
}
