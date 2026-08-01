//! Weather via wttr.in (no API key; IP-based geolocation unless the
//! weather widget's `location` option is set). Fetched with curl every
//! 15 minutes, emitted as `divebar://weather` events, and re-fetched when
//! the config changes location.

use crate::events::Trigger;
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use tauri::AppHandle;

const FETCH_INTERVAL: Duration = Duration::from_secs(15 * 60);
const RETRY_INTERVAL: Duration = Duration::from_secs(60);

static REFRESH: Trigger = Trigger::new();

/// Wakes the weather thread (e.g. after a config save, in case the
/// location option changed). It only refetches if the location actually
/// differs or the data is stale.
pub fn request_refresh() {
    REFRESH.notify();
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
    let rx = REFRESH.subscribe();

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
                    crate::events::emit(&app, "weather", payload);
                }
            }
            if !rx.wait(RETRY_INTERVAL, Duration::ZERO) {
                break;
            }
        }
    });
}

fn fetch(location: &str) -> Value {
    let url = format!(
        "https://wttr.in/{}?format=j1",
        location.replace(' ', "+")
    );
    match crate::readers::fetch_url(&url, 15) {
        Some(body) => parse_wttr(&body),
        None => Value::Null,
    }
}

/// Extracts the fields the weather widget shows from a wttr.in
/// `?format=j1` response body.
fn parse_wttr(body: &[u8]) -> Value {
    let Ok(data) = serde_json::from_slice::<Value>(body) else {
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

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "current_condition": [{
            "temp_C": "21", "temp_F": "70",
            "FeelsLikeC": "20", "FeelsLikeF": "68",
            "weatherCode": "113",
            "weatherDesc": [{ "value": "Sunny" }],
            "humidity": "40"
        }],
        "nearest_area": [{ "areaName": [{ "value": "Oakland" }] }]
    }"#;

    #[test]
    fn extracts_widget_fields() {
        assert_eq!(
            parse_wttr(SAMPLE.as_bytes()),
            json!({
                "tempC": 21.0,
                "tempF": 70.0,
                "feelsC": 20.0,
                "feelsF": 68.0,
                "code": 113,
                "desc": "Sunny",
                "humidity": 40.0,
                "area": "Oakland",
            })
        );
    }

    #[test]
    fn invalid_json_is_null() {
        assert_eq!(parse_wttr(b"<html>rate limited</html>"), Value::Null);
    }

    #[test]
    fn missing_temperature_is_null() {
        assert_eq!(parse_wttr(br#"{ "current_condition": [{}] }"#), Value::Null);
    }
}
