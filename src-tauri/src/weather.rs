//! Weather via wttr.in (no API key; IP-based geolocation unless the
//! weather widget's `location` option is set). Fetched with curl every
//! 15 minutes, emitted as `divebar://weather` events, and re-fetched when
//! the config changes location.

use crate::events::Trigger;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, SystemTime};
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
    let mut last_location: Option<String> = None;
    let mut last_fetch: Option<SystemTime> = None;
    let mut last_ok = false;
    crate::events::spawn_poll_loop(
        app,
        "weather",
        &REFRESH,
        RETRY_INTERVAL,
        Duration::ZERO,
        move || {
            let location = configured_location();
            // Wall-clock, not Instant: Instant is CLOCK_MONOTONIC-backed and
            // freezes across suspend, which would hide however long the
            // machine was actually asleep and leave stale weather up long
            // after a resume-triggered refresh should have gone through.
            let due = match last_fetch {
                None => true,
                Some(t) => t.elapsed().map_or(true, |e| {
                    e >= if last_ok { FETCH_INTERVAL } else { RETRY_INTERVAL }
                }),
            };
            if !due && last_location.as_deref() == Some(&location) {
                return None;
            }
            let payload = fetch(&location);
            last_ok = !payload.is_null();
            last_fetch = Some(SystemTime::now());
            last_location = Some(location);
            // Failed fetches emit nothing: stale weather beats no weather,
            // and the frontend tolerates the channel's absence.
            last_ok.then_some(payload)
        },
    );
}

/// Bare 5-digit entries are US zip codes; unqualified they geocode
/// anywhere on earth (wttr.in resolves "10001" to Cáceres, Spain), so
/// pin them to the US.
fn normalize_location(location: &str) -> String {
    let loc = location.trim();
    if loc.len() == 5 && loc.bytes().all(|b| b.is_ascii_digit()) {
        format!("{loc},USA")
    } else {
        loc.to_string()
    }
}

fn wttr_url(location: &str) -> String {
    format!(
        "https://wttr.in/{}?format=j1",
        normalize_location(location).replace(' ', "+")
    )
}

fn fetch(location: &str) -> Value {
    match crate::readers::fetch_url(&wttr_url(location), 15) {
        Some(body) => parse_wttr(&body),
        None => Value::Null,
    }
}

static RESOLVE_CACHE: Mutex<BTreeMap<String, Value>> = Mutex::new(BTreeMap::new());

/// Resolves a location string to the area wttr.in will actually report
/// on — the settings window's live preview. Non-empty resolutions are
/// cached (places don't move, and wttr.in rate-limits); the empty
/// string means IP auto-detect, always fetched fresh since its answer
/// changes when the machine moves.
pub fn resolve(location: &str) -> Option<Value> {
    let key = normalize_location(location);
    if !key.is_empty() {
        if let Some(hit) = RESOLVE_CACHE.lock().unwrap().get(&key) {
            return Some(hit.clone());
        }
    }
    let body = crate::readers::fetch_url(&wttr_url(location), 15)?;
    let area = parse_area(&body)?;
    if !key.is_empty() {
        RESOLVE_CACHE.lock().unwrap().insert(key, area.clone());
    }
    Some(area)
}

/// Extracts `nearest_area` from a wttr.in `?format=j1` body.
fn parse_area(body: &[u8]) -> Option<Value> {
    let data = serde_json::from_slice::<Value>(body).ok()?;
    let a = &data["nearest_area"][0];
    let text = |v: &Value| v[0]["value"].as_str().unwrap_or("").to_string();
    let area = text(&a["areaName"]);
    if area.is_empty() {
        return None;
    }
    Some(json!({
        "area": area,
        "region": text(&a["region"]),
        "country": text(&a["country"]),
        "lat": a["latitude"].as_str().and_then(|s| s.parse::<f64>().ok()),
        "lon": a["longitude"].as_str().and_then(|s| s.parse::<f64>().ok()),
    }))
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
    let forecast: Vec<Value> = data["weather"]
        .as_array()
        .map(|days| days.iter().filter_map(parse_day).collect())
        .unwrap_or_default();
    json!({
        "tempC": temp_c,
        "tempF": num(&current["temp_F"]),
        "feelsC": num(&current["FeelsLikeC"]),
        "feelsF": num(&current["FeelsLikeF"]),
        "code": text(&current["weatherCode"]).parse::<u32>().ok(),
        "desc": text(&current["weatherDesc"][0]["value"]),
        "humidity": num(&current["humidity"]),
        "area": text(&data["nearest_area"][0]["areaName"][0]["value"]),
        "forecast": forecast,
    })
}

/// One day of the wttr.in 3-day forecast: hi/lo, the midday condition
/// (as the day's representative icon), and the day's peak rain chance.
fn parse_day(day: &Value) -> Option<Value> {
    let num = |v: &Value| v.as_str().and_then(|s| s.parse::<f64>().ok());
    let hourly = day["hourly"].as_array()?;
    let midday = hourly.get(hourly.len() / 2)?;
    let rain = hourly
        .iter()
        .filter_map(|h| num(&h["chanceofrain"]))
        .fold(f64::NAN, f64::max);
    Some(json!({
        "date": day["date"].as_str()?,
        "minC": num(&day["mintempC"])?,
        "maxC": num(&day["maxtempC"])?,
        "minF": num(&day["mintempF"]),
        "maxF": num(&day["maxtempF"]),
        "code": midday["weatherCode"].as_str().and_then(|s| s.parse::<u32>().ok()),
        "desc": midday["weatherDesc"][0]["value"].as_str().unwrap_or(""),
        "rain": if rain.is_nan() { None } else { Some(rain) },
        "hourly": hourly.iter().filter_map(parse_hour).collect::<Vec<_>>(),
    }))
}

/// One 3-hour forecast slot. wttr.in's `time` is minutes-as-text
/// ("0", "300", ... "2100"); emitted as the hour of day.
fn parse_hour(slot: &Value) -> Option<Value> {
    let num = |v: &Value| v.as_str().and_then(|s| s.parse::<f64>().ok());
    Some(json!({
        "hour": slot["time"].as_str()?.parse::<u32>().ok()? / 100,
        "tempC": num(&slot["tempC"])?,
        "tempF": num(&slot["tempF"]),
        "code": slot["weatherCode"].as_str().and_then(|s| s.parse::<u32>().ok()),
        "rain": num(&slot["chanceofrain"]),
    }))
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
        "nearest_area": [{
            "areaName": [{ "value": "Oakland" }],
            "region": [{ "value": "California" }],
            "country": [{ "value": "United States of America" }],
            "latitude": "37.805", "longitude": "-122.273"
        }],
        "weather": [{
            "date": "2026-08-01",
            "mintempC": "14", "mintempF": "57",
            "maxtempC": "24", "maxtempF": "75",
            "hourly": [
                { "time": "0", "tempC": "15", "tempF": "59",
                  "weatherCode": "113", "chanceofrain": "10" },
                { "time": "1200", "tempC": "22", "tempF": "72",
                  "weatherCode": "176", "chanceofrain": "70",
                  "weatherDesc": [{ "value": "Patchy rain nearby" }] },
                { "time": "2100", "tempC": "16", "tempF": "61",
                  "weatherCode": "113", "chanceofrain": "20" }
            ]
        }]
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
                "forecast": [{
                    "date": "2026-08-01",
                    "minC": 14.0,
                    "maxC": 24.0,
                    "minF": 57.0,
                    "maxF": 75.0,
                    "code": 176,
                    "desc": "Patchy rain nearby",
                    "rain": 70.0,
                    "hourly": [
                        { "hour": 0, "tempC": 15.0, "tempF": 59.0,
                          "code": 113, "rain": 10.0 },
                        { "hour": 12, "tempC": 22.0, "tempF": 72.0,
                          "code": 176, "rain": 70.0 },
                        { "hour": 21, "tempC": 16.0, "tempF": 61.0,
                          "code": 113, "rain": 20.0 }
                    ],
                }],
            })
        );
    }

    #[test]
    fn bare_us_zip_gets_country_suffix() {
        assert_eq!(normalize_location(" 10001 "), "10001,USA");
        assert_eq!(normalize_location("10001,USA"), "10001,USA");
        assert_eq!(normalize_location("New York"), "New York");
        assert_eq!(normalize_location("94107x"), "94107x");
        assert_eq!(normalize_location(""), "");
    }

    #[test]
    fn url_encodes_spaces_and_normalizes() {
        assert_eq!(wttr_url("New York"), "https://wttr.in/New+York?format=j1");
        assert_eq!(wttr_url("94107"), "https://wttr.in/94107,USA?format=j1");
    }

    #[test]
    fn parses_nearest_area() {
        assert_eq!(
            parse_area(SAMPLE.as_bytes()),
            Some(json!({
                "area": "Oakland",
                "region": "California",
                "country": "United States of America",
                "lat": 37.805,
                "lon": -122.273,
            }))
        );
        assert_eq!(parse_area(b"<html>rate limited</html>"), None);
        assert_eq!(parse_area(br#"{ "nearest_area": [] }"#), None);
    }

    #[test]
    fn day_without_temperatures_is_skipped() {
        let body = br#"{
            "current_condition": [{ "temp_C": "21" }],
            "weather": [{ "date": "2026-08-01", "hourly": [{}] }]
        }"#;
        assert_eq!(parse_wttr(body)["forecast"], json!([]));
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
