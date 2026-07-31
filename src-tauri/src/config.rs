//! Persistent bar configuration: which widgets are in which zone, in what
//! order, with what options. Stored as JSON in ~/.local/config/divebar/.
//! The frontend fetches it via get_config and persists edits via
//! save_config; the file is also intended to be hand-editable.

use serde_json::{json, Value};
use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join(".local/config/divebar")
}

pub fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

pub fn default_config() -> Value {
    json!({
        "widgets": [
            { "widget": "workspaces", "options": {} },
            { "widget": "window-title", "options": {} },
            { "widget": "wifi", "options": {} },
            { "widget": "volume", "options": {} },
            { "widget": "brightness", "options": {} },
            { "widget": "battery", "options": {} },
            { "widget": "date", "options": {} },
            { "widget": "time", "options": {} },
            { "widget": "settings", "options": {} },
        ]
    })
}

pub fn load() -> Value {
    let path = config_file();
    match std::fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<Value>(&contents) {
            Ok(v) if v.get("widgets").is_some_and(Value::is_array) => v,
            // Migrate the old zoned format: flatten left, center, right.
            Ok(v) if v.get("zones").is_some_and(Value::is_object) => {
                let zones = &v["zones"];
                let mut widgets = Vec::new();
                for zone in ["left", "center", "right"] {
                    if let Some(entries) = zones.get(zone).and_then(Value::as_array) {
                        widgets.extend(entries.iter().cloned());
                    }
                }
                let migrated = json!({ "widgets": widgets });
                let _ = save(&migrated);
                migrated
            }
            _ => {
                eprintln!(
                    "divebar: invalid config at {}, using defaults",
                    path.display()
                );
                default_config()
            }
        },
        // First run: write the defaults so the user has a file to edit.
        Err(_) => {
            let defaults = default_config();
            if let Err(err) = save(&defaults) {
                eprintln!("divebar: could not write default config: {err}");
            }
            defaults
        }
    }
}

pub fn save(config: &Value) -> Result<(), String> {
    std::fs::create_dir_all(config_dir()).map_err(|e| e.to_string())?;
    let pretty = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(config_file(), pretty + "\n").map_err(|e| e.to_string())
}
