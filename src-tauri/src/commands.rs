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
    geometry: tauri::State<'_, std::sync::Mutex<crate::Geometry>>,
    open: bool,
    rect: Option<PopupRect>,
) -> Result<(), String> {
    let (width, bar, total, composited, s) = {
        let g = geometry.lock().unwrap();
        (
            g.width_px as i32,
            g.bar_px as i32,
            g.total_px as i32,
            g.composited,
            g.css_scale,
        )
    };

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
    geometry: tauri::State<'_, std::sync::Mutex<crate::Geometry>>,
) -> Result<Value, String> {
    let composited = geometry.lock().unwrap().composited;
    Ok(serde_json::json!({ "composited": composited }))
}

/// Latest payload of every event channel, keyed by channel name — replayed
/// by the frontend at startup (the initial emits fire before it loads).
#[tauri::command]
pub async fn get_latest_states() -> Result<Value, String> {
    Ok(crate::events::latest_states())
}

/// Sends a playback command ("playPause" | "next" | "previous") to the
/// active MPRIS player.
#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    crate::media::control(&action).await
}

/// Forwards a click on a tray icon to the owning application.
#[tauri::command]
pub async fn tray_activate(
    address: String,
    secondary: bool,
    x: i32,
    y: i32,
) -> Result<(), String> {
    crate::tray::activate(address, secondary, x, y).await
}

/// Forwards a tray context-menu item click to the owning application.
#[tauri::command]
pub async fn tray_menu_click(address: String, menu_path: String, id: i32) -> Result<(), String> {
    crate::tray::menu_click(address, menu_path, id).await
}

#[tauri::command]
pub async fn get_config() -> Result<Value, String> {
    Ok(crate::config::load())
}

#[tauri::command]
pub async fn get_default_config() -> Result<Value, String> {
    Ok(crate::config::default_config())
}

/// Persists the config and broadcasts it so the bar re-renders live. Also
/// re-applies the window geometry if the bar height setting changed.
#[tauri::command]
pub async fn save_config(app: tauri::AppHandle, config: Value) -> Result<(), String> {
    use tauri::Emitter;
    if !config.get("widgets").is_some_and(Value::is_array) {
        return Err("config must have a widgets array".into());
    }
    crate::config::save(&config)?;
    app.emit("divebar://config", &config)
        .map_err(|e| e.to_string())?;
    apply_bar_height(&app, crate::bar_height_from(&config));
    // In case the weather widget's location option changed.
    crate::weather::request_refresh();
    Ok(())
}

/// Resizes the bar window, strut, and shapes for a new logical bar height.
fn apply_bar_height(app: &tauri::AppHandle, height_logical: f64) {
    use tauri::Manager;
    let state = app.state::<std::sync::Mutex<crate::Geometry>>();
    let (width, bar_px, total_px, composited, origin_x) = {
        let mut g = state.lock().unwrap();
        let new_bar = (height_logical * g.css_scale).round() as u32;
        if new_bar == g.bar_px {
            return;
        }
        g.bar_px = new_bar;
        g.total_px = ((height_logical + crate::POPUP_SPACE) * g.css_scale).round() as u32;
        (g.width_px, g.bar_px, g.total_px, g.composited, g.origin_x)
    };

    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let _ = win.set_size(tauri::PhysicalSize::new(width, total_px));
    #[cfg(target_os = "linux")]
    {
        let win2 = win.clone();
        let _ = win.run_on_main_thread(move || {
            crate::linux::set_strut(&win2, bar_px, width, origin_x);
            crate::linux::set_region(&win2, &[(0, 0, width as i32, bar_px as i32)], !composited);
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (bar_px, composited, origin_x);
}

/// Opens (or focuses) the settings window: a normal floating dialog, not
/// part of the bar's dock window.
#[tauri::command]
pub async fn open_settings(
    app: tauri::AppHandle,
    geometry: tauri::State<'_, std::sync::Mutex<crate::Geometry>>,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    let zoom = geometry.lock().unwrap().zoom;
    let win = tauri::WebviewWindowBuilder::new(
        &app,
        "settings",
        tauri::WebviewUrl::App("settings.html".into()),
    )
    .title("divebar settings")
    .inner_size(560.0 * zoom, 760.0 * zoom)
    .center()
    .build()
    .map_err(|e| e.to_string())?;
    if zoom != 1.0 {
        let _ = win.set_zoom(zoom);
    }
    #[cfg(target_os = "linux")]
    {
        let gtk_win = win.clone();
        let _ = win.run_on_main_thread(move || crate::linux::make_dialog(&gtk_win));
    }
    Ok(())
}

/// Lists installed font families (via fontconfig) for font-picker settings.
#[tauri::command]
pub async fn list_fonts() -> Result<Vec<String>, String> {
    let output = readers::run("fc-list", &[":", "family"]).ok_or("fc-list failed")?;
    let mut families = std::collections::BTreeSet::new();
    for line in output.lines() {
        // Lines are comma-separated family aliases; the first is canonical.
        if let Some(first) = line.split(',').next() {
            let name = first.trim();
            if !name.is_empty() {
                families.insert(name.to_string());
            }
        }
    }
    Ok(families.into_iter().collect())
}

#[tauri::command]
pub async fn close_settings(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("settings") {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn radius_zero_is_one_full_rect() {
        let mut rects = Vec::new();
        push_bottom_rounded_rect(&mut rects, 10.0, 20.0, 100.0, 50.0, 0.0);
        assert_eq!(rects, vec![(10, 20, 100, 50)]);
    }

    #[test]
    fn rounded_corners_cut_monotonically_and_stay_in_bounds() {
        let mut rects = Vec::new();
        push_bottom_rounded_rect(&mut rects, 0.0, 0.0, 100.0, 50.0, 14.0);
        // Body rect + one scanline per radius row.
        assert_eq!(rects.len(), 15);
        assert_eq!(rects[0], (0, 0, 100, 36));
        let mut last_width = i32::MAX;
        for (i, &(x, y, w, h)) in rects[1..].iter().enumerate() {
            assert_eq!(h, 1);
            assert_eq!(y, 36 + i as i32);
            assert!(w <= last_width, "scanlines must narrow toward the bottom");
            assert!(x >= 0 && x + w <= 100, "scanline must stay inside the rect");
            assert!(w > 0);
            last_width = w;
        }
        // The bottom row of a 14px-radius corner is meaningfully narrower.
        assert!(rects.last().unwrap().2 < 100 - 14);
    }

    #[test]
    fn radius_clamped_to_half_width() {
        let mut rects = Vec::new();
        push_bottom_rounded_rect(&mut rects, 0.0, 0.0, 10.0, 50.0, 14.0);
        // r clamps to w/2 = 5: one body rect + 5 scanlines.
        assert_eq!(rects.len(), 6);
        assert_eq!(rects[0], (0, 0, 10, 45));
    }
}
