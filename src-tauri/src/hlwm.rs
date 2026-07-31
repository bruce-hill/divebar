//! herbstluftwm integration: watches `herbstclient --idle` for WM events and
//! pushes tag (workspace) state + the focused window title to the frontend
//! as `divebar://hlwm` events.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub fn spawn_hlwm_watcher(app: AppHandle) {
    std::thread::spawn(move || loop {
        emit_state(&app);

        // Block on herbstclient --idle; every line it prints is a WM event,
        // and we just re-query the full state (cheap) rather than parsing
        // individual event types.
        match Command::new("herbstclient")
            .arg("--idle")
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(mut child) => {
                if let Some(stdout) = child.stdout.take() {
                    for line in BufReader::new(stdout).lines() {
                        if line.is_err() {
                            break;
                        }
                        emit_state(&app);
                    }
                }
                let _ = child.wait();
            }
            Err(err) => {
                eprintln!("divebar: failed to run herbstclient --idle: {err}");
            }
        }

        // herbstclient exited (hlwm not running?) — retry with backoff.
        std::thread::sleep(Duration::from_secs(5));
    });
}

fn emit_state(app: &AppHandle) {
    let payload = json!({
        "tags": read_tags(),
        "windowTitle": read_window_title(),
    });
    let _ = app.emit("divebar://hlwm", payload);
}

/// Parses `herbstclient tag_status`: tab-separated entries where the first
/// character encodes the tag state and the rest is the tag name.
fn read_tags() -> Value {
    let Some(output) = run_herbstclient(&["tag_status"]) else {
        return Value::Null;
    };
    let tags: Vec<Value> = output
        .split('\t')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| {
            let mut chars = entry.chars();
            let flag = chars.next()?;
            let name: String = chars.collect();
            if name.is_empty() {
                return None;
            }
            let state = match flag {
                '#' => "focused",           // viewed on this monitor, focused
                '%' => "focused-elsewhere", // viewed + focused on another monitor
                '+' | '-' => "visible",     // viewed on some monitor, not focused
                '!' => "urgent",
                ':' => "occupied",
                _ => "empty", // '.'
            };
            Some(json!({ "name": name, "state": state }))
        })
        .collect();
    json!(tags)
}

fn read_window_title() -> String {
    // Errors (e.g. no focused client) just mean an empty title.
    run_herbstclient(&["attr", "clients.focus.title"]).unwrap_or_default()
}

fn run_herbstclient(args: &[&str]) -> Option<String> {
    let output = Command::new("herbstclient").args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
