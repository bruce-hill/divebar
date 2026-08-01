//! herbstluftwm integration: watches `herbstclient --idle` for WM events and
//! pushes tag (workspace) state + the focused window title to the frontend
//! as `divebar://hlwm` events.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::AppHandle;

pub fn spawn_hlwm_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut icons = crate::xicon::IconFetcher::new();
        loop {
            emit_state(&app, &mut icons);

            // Block on herbstclient --idle; every line it prints is a WM
            // event, and we just re-query the full state (cheap) rather
            // than parsing individual event types.
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
                            emit_state(&app, &mut icons);
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
        }
    });
}

fn emit_state(app: &AppHandle, icons: &mut crate::xicon::IconFetcher) {
    let title = read_window_title();
    let class = run_herbstclient(&["attr", "clients.focus.class"]).unwrap_or_default();
    let winid = run_herbstclient(&["attr", "clients.focus.winid"]).unwrap_or_default();
    let icon = parse_winid(&winid)
        .and_then(|id| icons.icon_for(id, if class.is_empty() { "?" } else { &class }));

    let payload = json!({
        "tags": read_tags(),
        "windowId": winid,
        "windowTitle": title,
        "windowClass": class,
        "windowIcon": icon,
    });
    crate::events::emit(app, "hlwm", payload);
}

fn parse_winid(s: &str) -> Option<u32> {
    u32::from_str_radix(s.trim().trim_start_matches("0x"), 16).ok()
}

fn read_tags() -> Value {
    match run_herbstclient(&["tag_status"]) {
        Some(output) => parse_tag_status(&output),
        None => Value::Null,
    }
}

/// Parses `herbstclient tag_status`: tab-separated entries where the first
/// character encodes the tag state and the rest is the tag name.
fn parse_tag_status(output: &str) -> Value {
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
    crate::readers::run("herbstclient", args)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tag_status_flags_map_to_states() {
        let tags = parse_tag_status("\t#one\t%two\t+three\t-four\t!five\t:six\t.seven\t");
        assert_eq!(
            tags,
            json!([
                { "name": "one", "state": "focused" },
                { "name": "two", "state": "focused-elsewhere" },
                { "name": "three", "state": "visible" },
                { "name": "four", "state": "visible" },
                { "name": "five", "state": "urgent" },
                { "name": "six", "state": "occupied" },
                { "name": "seven", "state": "empty" },
            ])
        );
    }

    #[test]
    fn tag_status_skips_empty_and_nameless_entries() {
        assert_eq!(parse_tag_status(""), json!([]));
        assert_eq!(parse_tag_status("\t#\t"), json!([]));
    }

    #[test]
    fn winid_hex_parsing() {
        assert_eq!(parse_winid("0x1a2b"), Some(0x1a2b));
        assert_eq!(parse_winid(" 0x5 \n"), Some(5));
        assert_eq!(parse_winid(""), None);
        assert_eq!(parse_winid("not-a-window"), None);
    }
}
