//! Tauri commands invoked by widgets for user-initiated controls.
//! Commands that change volume/brightness return the fresh state so the
//! widget can update immediately instead of waiting for the next stats poll.

use crate::readers;
use serde_json::Value;
use std::process::Command;

#[tauri::command]
pub async fn hlwm_use_tag(tag: String) -> Result<(), String> {
    readers::run("herbstclient", &["use", &tag])
        .map(|_| ())
        .ok_or_else(|| format!("failed to switch to tag {tag}"))
}

#[tauri::command]
pub async fn adjust_volume(delta_percent: i32) -> Result<Value, String> {
    let step = format!(
        "{}%{}",
        delta_percent.abs(),
        if delta_percent >= 0 { "+" } else { "-" }
    );
    // -l 1.0 caps the volume at 100%.
    readers::run(
        "wpctl",
        &["set-volume", "-l", "1.0", "@DEFAULT_AUDIO_SINK@", &step],
    )
    .ok_or("wpctl set-volume failed")?;
    Ok(readers::read_volume())
}

#[tauri::command]
pub async fn toggle_mute() -> Result<Value, String> {
    readers::run("wpctl", &["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
        .ok_or("wpctl set-mute failed")?;
    Ok(readers::read_volume())
}

#[tauri::command]
pub async fn adjust_brightness(delta_percent: i32) -> Result<Value, String> {
    let step = format!(
        "{}%{}",
        delta_percent.abs(),
        if delta_percent >= 0 { "+" } else { "-" }
    );
    readers::run("brightnessctl", &["-m", "set", &step])
        .ok_or("brightnessctl set failed")?;
    Ok(readers::read_brightness())
}

#[tauri::command]
pub async fn launch_wifi_gui() -> Result<(), String> {
    let child = Command::new("/usr/local/bin/wifi-gui")
        .spawn()
        .map_err(|e| format!("failed to launch wifi-gui: {e}"))?;
    // Reap the child in the background so it doesn't linger as a zombie.
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
    });
    Ok(())
}
