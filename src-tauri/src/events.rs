//! Backend → frontend event channels. The one home for "emit an event the
//! frontend subscribes to": every payload emitted through here is also
//! cached, so late subscribers (the webview loads after the first emits)
//! catch up via the `get_latest_states` command instead of each subsystem
//! hand-rolling a LATEST mutex and a replay command.
//!
//! Also provides `Trigger`, the coalescing wake-up line worker loops use
//! for "refresh now" requests.

use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

static LATEST: Mutex<BTreeMap<&'static str, Value>> = Mutex::new(BTreeMap::new());

/// Caches `payload` for late subscribers and emits it as a
/// `divebar://<channel>` event. Returns false when the app is shutting
/// down (the event loop is gone), so poll loops can exit.
pub fn emit(app: &AppHandle, channel: &'static str, payload: Value) -> bool {
    record(channel, payload.clone());
    app.emit(&format!("divebar://{channel}"), payload).is_ok()
}

fn record(channel: &'static str, payload: Value) {
    LATEST.lock().unwrap().insert(channel, payload);
}

/// The latest payload of every channel that has emitted, keyed by channel
/// name. The frontend replays these at startup.
pub fn latest_states() -> Value {
    let map = LATEST.lock().unwrap();
    Value::Object(
        map.iter()
            .map(|(channel, payload)| (channel.to_string(), payload.clone()))
            .collect(),
    )
}

/// A wake-up line into a worker loop: `notify()` from anywhere, `wait()`
/// in the loop. Declared as a `static` next to the loop that owns it.
pub struct Trigger(OnceLock<Sender<()>>);

impl Trigger {
    pub const fn new() -> Self {
        Self(OnceLock::new())
    }

    /// Called once by the worker at startup; returns its end of the line.
    pub fn subscribe(&self) -> TriggerReceiver {
        let (tx, rx) = channel();
        let _ = self.0.set(tx);
        TriggerReceiver(rx)
    }

    /// Wakes the worker. A no-op before `subscribe()`.
    pub fn notify(&self) {
        if let Some(tx) = self.0.get() {
            let _ = tx.send(());
        }
    }
}

pub struct TriggerReceiver(Receiver<()>);

impl TriggerReceiver {
    /// Blocks until notified or `timeout` elapses — either way the caller
    /// should do one round of work. After a notify, waits `settle` and
    /// then drains the queue, so a burst of notifies (e.g. holding a
    /// volume key) coalesces into one refresh. Returns false when every
    /// sender is gone.
    pub fn wait(&self, timeout: Duration, settle: Duration) -> bool {
        match self.0.recv_timeout(timeout) {
            Ok(()) => {
                if !settle.is_zero() {
                    std::thread::sleep(settle);
                }
                while self.0.try_recv().is_ok() {}
                true
            }
            Err(RecvTimeoutError::Timeout) => true,
            Err(RecvTimeoutError::Disconnected) => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn record_and_replay_latest_per_channel() {
        record("test-alpha", json!({ "n": 1 }));
        record("test-beta", json!("hi"));
        record("test-alpha", json!({ "n": 2 })); // newer payload wins
        let states = latest_states();
        assert_eq!(states["test-alpha"], json!({ "n": 2 }));
        assert_eq!(states["test-beta"], json!("hi"));
    }

    #[test]
    fn unemitted_channel_is_absent_not_null() {
        assert!(latest_states().get("test-never-emitted").is_none());
    }

    #[test]
    fn trigger_notify_wakes_wait() {
        let trigger = Trigger::new();
        let rx = trigger.subscribe();
        trigger.notify();
        assert!(rx.wait(Duration::from_secs(5), Duration::ZERO));
    }

    #[test]
    fn trigger_burst_coalesces_into_one_wakeup() {
        let trigger = Trigger::new();
        let rx = trigger.subscribe();
        for _ in 0..5 {
            trigger.notify();
        }
        assert!(rx.wait(Duration::from_secs(5), Duration::ZERO));
        // The burst was drained: nothing is queued behind the first wait.
        assert!(rx.0.try_recv().is_err());
    }

    #[test]
    fn trigger_timeout_still_ticks() {
        let trigger = Trigger::new();
        let rx = trigger.subscribe();
        assert!(rx.wait(Duration::from_millis(1), Duration::ZERO));
    }

    #[test]
    fn notify_before_subscribe_is_a_noop() {
        let trigger = Trigger::new();
        trigger.notify(); // must not panic or wedge
        let rx = trigger.subscribe();
        assert!(rx.wait(Duration::from_millis(1), Duration::ZERO));
    }
}
