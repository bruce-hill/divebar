//! Detects resume from suspend/hibernate via logind's `PrepareForSleep`
//! signal (system bus) and forces an immediate refresh, instead of letting
//! stats/weather sit on their poll backstop and the frontend clock widgets
//! sit paused mid-countdown until their monotonic timer catches up.

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use zbus::{Connection, MatchRule, MessageStream};

pub fn spawn_resume_watcher(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run(app).await {
            eprintln!("divebar: resume watcher failed: {err}");
        }
    });
}

async fn run(app: AppHandle) -> zbus::Result<()> {
    let conn = Connection::system().await?;
    let rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .interface("org.freedesktop.login1.Manager")?
        .member("PrepareForSleep")?
        .path("/org/freedesktop/login1")?
        .build();
    let mut stream = MessageStream::for_match_rule(rule, &conn, Some(8)).await?;
    while let Some(Ok(msg)) = stream.next().await {
        // The signal fires twice per sleep cycle: `true` just before
        // suspending, `false` on resume. Only the resume edge matters.
        if msg.body().deserialize::<bool>().unwrap_or(true) {
            continue;
        }
        crate::stats::request_refresh();
        crate::weather::request_refresh();
        let _ = app.emit("divebar://resume", ());
    }
    Ok(())
}
