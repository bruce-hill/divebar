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
pub async fn set_volume(percent: u32) -> Result<Value, String> {
    let level = format!("{}%", percent.min(100));
    readers::run("wpctl", &["set-volume", "@DEFAULT_AUDIO_SINK@", &level])
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
pub async fn set_brightness(percent: u32) -> Result<Value, String> {
    let level = format!("{}%", percent.min(100));
    readers::run("brightnessctl", &["-m", "set", &level])
        .ok_or("brightnessctl set failed")?;
    Ok(readers::read_brightness())
}

/// Toggles the interactive input region between the bar strip (popups
/// closed) and the full window including popup space (a popup is open).
#[tauri::command]
pub async fn set_popup_open(
    window: tauri::WebviewWindow,
    geometry: tauri::State<'_, crate::Geometry>,
    open: bool,
) -> Result<(), String> {
    let width = geometry.width_px as i32;
    let height = if open {
        geometry.total_px
    } else {
        geometry.bar_px
    } as i32;
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            #[cfg(target_os = "linux")]
            crate::linux::set_input_region(&win, width, height);
            #[cfg(not(target_os = "linux"))]
            let _ = (&win, width, height);
        })
        .map_err(|e| e.to_string())
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
