//! Worker loop that gathers system stats and pushes them to the frontend
//! as `divebar://stats` events. Widgets subscribe to this single event
//! stream; adding a new stat means extending the payload here and reading
//! it from a widget on the JS side.
//!
//! Besides the periodic poll, line watchers subscribe to PipeWire sink
//! events (pactl) and udev backlight/power events so volume, brightness,
//! and charger changes show up immediately instead of on the next tick.

use crate::events::Trigger;
use crate::readers::LineEvent;
use serde_json::json;
use std::ops::ControlFlow;
use std::time::Duration;
use tauri::AppHandle;

const REFRESH_INTERVAL: Duration = Duration::from_secs(2);
/// Post-trigger settle time, so a burst of change events (e.g. holding a
/// volume key) coalesces into one refresh.
const SETTLE: Duration = Duration::from_millis(30);
/// Respawn delay when a change watcher's daemon goes away.
const WATCHER_BACKOFF: Duration = Duration::from_secs(10);

static REFRESH: Trigger = Trigger::new();

/// Asks the stats loop to refresh and emit immediately.
pub fn request_refresh() {
    REFRESH.notify();
}

pub fn spawn_stats_emitter(app: AppHandle) {
    spawn_change_watchers();

    crate::events::spawn_poll_loop(
        app,
        "stats",
        &REFRESH,
        REFRESH_INTERVAL,
        SETTLE,
        move || {
            Some(json!({
                "battery": crate::readers::read_battery(),
                "volume": crate::readers::read_volume(),
                "brightness": crate::readers::read_brightness(),
                "wifi": crate::readers::read_wifi(),
            }))
        },
    );
}

/// Watches for external changes and requests immediate refreshes:
/// - `pactl subscribe` for volume/mute (PipeWire's pulse interface)
/// - `udevadm monitor` for backlight and power-supply events
fn spawn_change_watchers() {
    watch_for_changes(
        "pactl",
        &["subscribe"],
        |line| line.contains("sink") || line.contains("server"),
    );
    watch_for_changes(
        "udevadm",
        &[
            "monitor",
            "--udev",
            "--subsystem-match=backlight",
            "--subsystem-match=power_supply",
        ],
        |line| line.contains("change"),
    );
}

fn watch_for_changes(
    cmd: &'static str,
    args: &'static [&'static str],
    matches: fn(&str) -> bool,
) {
    crate::readers::spawn_line_watcher(cmd, args, WATCHER_BACKOFF, move |event| {
        if let LineEvent::Line(line) = event {
            if matches(line) {
                request_refresh();
            }
        }
        ControlFlow::Continue(())
    });
}
