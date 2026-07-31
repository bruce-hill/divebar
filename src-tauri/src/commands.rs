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

/// The open popup's bounding box in frontend CSS pixels.
#[derive(serde::Deserialize)]
pub struct PopupRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Toggles the window's interactive region when a popup opens/closes.
/// With a compositor: input region only (bar strip, or the full window
/// while open so click-outside closes). Without one: the same region is
/// also the visible bounding shape, so it must be exactly the bar strip
/// plus the popup's rectangle — anything else would render black.
#[tauri::command]
pub async fn set_popup_open(
    window: tauri::WebviewWindow,
    geometry: tauri::State<'_, crate::Geometry>,
    open: bool,
    rect: Option<PopupRect>,
) -> Result<(), String> {
    let width = geometry.width_px as i32;
    let bar = geometry.bar_px as i32;
    let total = geometry.total_px as i32;
    let composited = geometry.composited;
    let s = geometry.css_scale;

    let mut rects = vec![(0, 0, width, bar)];
    if open {
        if composited {
            rects = vec![(0, 0, width, total)];
        } else if let Some(r) = rect {
            // Matches the .dpopup border-radius in src/lib/slider-popup.js.
            let radius = 14.0 * s;
            push_bottom_rounded_rect(
                &mut rects,
                r.x * s,
                r.y * s,
                r.width * s,
                r.height * s,
                radius,
            );
        } else {
            rects.push((0, bar, width, total - bar));
        }
    }

    let win = window.clone();
    window
        .run_on_main_thread(move || {
            #[cfg(target_os = "linux")]
            crate::linux::set_region(&win, &rects, !composited);
            #[cfg(not(target_os = "linux"))]
            let _ = (&win, rects, composited);
        })
        .map_err(|e| e.to_string())
}

/// Approximates a rectangle with rounded bottom corners as a stack of
/// scanline rectangles (X11 shape regions are rectangle unions). The top
/// corners stay square — the popup sits flush against the bar.
fn push_bottom_rounded_rect(
    rects: &mut Vec<(i32, i32, i32, i32)>,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    radius: f64,
) {
    let xi = x.floor() as i32;
    let yi = y.floor() as i32;
    let wi = w.ceil() as i32;
    let hi = h.ceil() as i32;
    let r = (radius.round() as i32).min(wi / 2).min(hi);
    rects.push((xi, yi, wi, hi - r));
    for i in 0..r {
        let dy = (i + 1) as f64; // distance below the corner-circle center
        let dx = (r as f64 - ((r as f64).powi(2) - dy * dy).max(0.0).sqrt()) as i32;
        rects.push((xi + dx, yi + hi - r + i, wi - 2 * dx, 1));
    }
}

/// Environment info the frontend adapts to (e.g. squared-off popups
/// without a compositor, since shaped windows can't have soft shadows or
/// rounded transparent corners).
#[tauri::command]
pub async fn get_env(
    geometry: tauri::State<'_, crate::Geometry>,
) -> Result<Value, String> {
    Ok(serde_json::json!({ "composited": geometry.composited }))
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
