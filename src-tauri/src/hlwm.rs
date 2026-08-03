//! herbstluftwm integration: watches `herbstclient --idle` for WM events and
//! pushes tag (workspace) state + the focused window title to the frontend
//! as `divebar://hlwm` events.

use crate::events::Trigger;
use serde_json::{json, Value};
use std::ops::ControlFlow;
use std::time::Duration;
use tauri::AppHandle;

/// Post-event settle time: each state query is a few herbstclient spawns,
/// so a burst of WM events (a client retitling rapidly, a flurry of focus
/// changes) coalesces into one re-query instead of one per line.
const SETTLE: Duration = Duration::from_millis(25);
/// Without a notify the loop only wakes for an hourly resync — harmless
/// (an unchanged payload is dropped at emit) and a safety net in case an
/// event was ever missed.
const RESYNC_INTERVAL: Duration = Duration::from_secs(60 * 60);

static REFRESH: Trigger = Trigger::new();

pub fn spawn_hlwm_watcher(app: AppHandle) {
    // Every line herbstclient --idle prints is a WM event; we just
    // re-query the full state rather than parsing individual event
    // types. Start events re-sync after gaps (hlwm not running yet, or
    // restarted).
    crate::readers::spawn_line_watcher(
        "herbstclient",
        &["--idle"],
        Duration::from_secs(5),
        |_event| {
            REFRESH.notify();
            ControlFlow::Continue(())
        },
    );

    let mut icons = crate::xicon::IconFetcher::new();
    crate::events::spawn_poll_loop(app, "hlwm", &REFRESH, RESYNC_INTERVAL, SETTLE, move || {
        Some(read_state(&mut icons))
    });
}

fn read_state(icons: &mut crate::xicon::IconFetcher) -> Value {
    let title = read_window_title();
    let class = run_herbstclient(&["attr", "clients.focus.class"]).unwrap_or_default();
    let winid = run_herbstclient(&["attr", "clients.focus.winid"]).unwrap_or_default();
    let icon = parse_winid(&winid)
        .and_then(|id| icons.icon_for(id, if class.is_empty() { "?" } else { &class }));

    json!({
        "tags": read_tags(),
        "windowId": winid,
        "windowTitle": title,
        "windowClass": class,
        "windowIcon": icon,
    })
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

/// Hands X input focus back to whichever client herbstluftwm currently
/// tracks as focused, undoing `linux::grab_input_focus` once a bar popup
/// closes. Dock windows (ours) are outside herbstluftwm's normal client
/// tracking, so grabbing focus for a popup never disturbs it — this just
/// asks herbstluftwm to reassert what it already thinks is focused.
pub fn restore_focus() {
    let Some(winid) = run_herbstclient(&["attr", "clients.focus.winid"]) else {
        return;
    };
    let winid = winid.trim();
    if winid.is_empty() || winid == "0x0" {
        return;
    }
    let _ = run_herbstclient(&["jumpto", winid]);
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
