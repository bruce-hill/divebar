#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod hlwm;
mod readers;
mod stats;

#[cfg(target_os = "linux")]
mod linux;

use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// Bar height in logical pixels. Must match --bar-height in src/style.css.
/// Hardcoded for the prototype; will move to user settings later.
const BAR_HEIGHT: f64 = 48.0;

/// Extra transparent space below the bar (logical px) where pop-down panels
/// (volume/brightness sliders) can render. Normally click-through via the
/// X11 input shape; made interactive only while a popup is open.
const POPUP_SPACE: f64 = 160.0;

/// Window geometry in physical pixels, shared with commands that toggle the
/// interactive input region.
pub struct Geometry {
    pub width_px: u32,
    pub bar_px: u32,
    pub total_px: u32,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("divebar")
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .visible(false)
                .build()?;

            // HiDPI: WebKitGTK only honors the integer GDK window scale, not
            // font DPI, so allow zooming the whole webview. Priority:
            // DIVEBAR_ZOOM env var > Xft.dpi autodetection > 1.0.
            let zoom = std::env::var("DIVEBAR_ZOOM")
                .ok()
                .and_then(|v| v.parse::<f64>().ok())
                .filter(|z| (0.25..=8.0).contains(z));
            #[cfg(target_os = "linux")]
            let zoom = zoom.or_else(|| linux::detect_zoom(&window));
            let zoom = zoom.unwrap_or(1.0);
            if zoom != 1.0 {
                window.set_zoom(zoom)?;
            }

            // Size the bar to span the primary monitor, glued to its top edge.
            let monitor = window
                .primary_monitor()?
                .or_else(|| window.current_monitor().ok().flatten())
                .expect("no monitor found");
            let scale = monitor.scale_factor();
            let bar_height_px = (BAR_HEIGHT * zoom * scale).round() as u32;
            let total_height_px = ((BAR_HEIGHT + POPUP_SPACE) * zoom * scale).round() as u32;
            let monitor_width_px = monitor.size().width;
            let origin = *monitor.position();

            // The window includes transparent popup space below the bar, but
            // only the bar strip reserves screen space (strut) and accepts
            // input by default.
            window.set_size(PhysicalSize::new(monitor_width_px, total_height_px))?;
            window.set_position(PhysicalPosition::new(origin.x, origin.y))?;

            // On X11, mark the window as a dock and reserve screen space so
            // tiled/maximized windows don't overlap the bar.
            #[cfg(target_os = "linux")]
            {
                linux::setup_dock_window(&window, bar_height_px, monitor_width_px, origin.x);
                linux::set_input_region(&window, monitor_width_px as i32, bar_height_px as i32);
            }

            app.manage(Geometry {
                width_px: monitor_width_px,
                bar_px: bar_height_px,
                total_px: total_height_px,
            });

            window.show()?;

            stats::spawn_stats_emitter(app.handle().clone());
            hlwm::spawn_hlwm_watcher(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hlwm_use_tag,
            commands::set_volume,
            commands::toggle_mute,
            commands::set_brightness,
            commands::set_popup_open,
            commands::launch_wifi_gui,
        ])
        .run(tauri::generate_context!())
        .expect("error while running divebar");
}
