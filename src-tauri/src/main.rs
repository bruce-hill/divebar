#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod hlwm;
mod media;
mod readers;
mod stats;
mod tray;
mod weather;
mod xicon;

#[cfg(target_os = "linux")]
mod linux;

use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// Fallback bar height (logical px) when the config has none.
pub const DEFAULT_BAR_HEIGHT: f64 = 48.0;

/// Extra transparent space below the bar (logical px) where pop-down panels
/// (volume/brightness sliders) can render. Normally click-through via the
/// X11 input shape; made interactive only while a popup is open.
pub const POPUP_SPACE: f64 = 320.0;

/// Window geometry in physical pixels, shared (behind a Mutex) with
/// commands that toggle the interactive input region or resize the bar.
pub struct Geometry {
    pub width_px: u32,
    pub bar_px: u32,
    pub total_px: u32,
    /// Multiplier from frontend CSS px to physical px (zoom * monitor scale).
    pub css_scale: f64,
    /// Webview zoom factor, also applied to auxiliary windows (settings).
    pub zoom: f64,
    /// Whether a compositor is running; without one the window's bounding
    /// shape must be clipped to visible content (transparency shows black).
    pub composited: bool,
    /// Monitor origin (for strut coordinates in root-window space).
    pub origin_x: i32,
}

pub fn bar_height_from(config: &serde_json::Value) -> f64 {
    config
        .get("bar")
        .and_then(|b| b.get("height"))
        .and_then(serde_json::Value::as_f64)
        .filter(|h| (16.0..=256.0).contains(h))
        .unwrap_or(DEFAULT_BAR_HEIGHT)
}

fn main() {
    // WebKitGTK's accelerated compositing renders black on shaped/ARGB X11
    // windows (especially without a compositor). A statusbar doesn't need
    // GPU compositing — force the software path unless the user overrides.
    if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    }

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
            let bar_height = bar_height_from(&config::load());
            let bar_height_px = (bar_height * zoom * scale).round() as u32;
            let total_height_px = ((bar_height + POPUP_SPACE) * zoom * scale).round() as u32;
            let monitor_width_px = monitor.size().width;
            let origin = *monitor.position();

            // The window includes transparent popup space below the bar, but
            // only the bar strip reserves screen space (strut) and accepts
            // input by default.
            window.set_size(PhysicalSize::new(monitor_width_px, total_height_px))?;
            window.set_position(PhysicalPosition::new(origin.x, origin.y))?;

            #[cfg(target_os = "linux")]
            let composited = linux::is_composited(&window);
            #[cfg(not(target_os = "linux"))]
            let composited = true;

            // On X11, mark the window as a dock and reserve screen space so
            // tiled/maximized windows don't overlap the bar.
            #[cfg(target_os = "linux")]
            linux::setup_dock_window(&window, bar_height_px, monitor_width_px, origin.x);

            app.manage(std::sync::Mutex::new(Geometry {
                width_px: monitor_width_px,
                bar_px: bar_height_px,
                total_px: total_height_px,
                css_scale: zoom * scale,
                zoom,
                composited,
                origin_x: origin.x,
            }));

            window.show()?;

            // Shape after mapping — some setups drop shapes applied pre-show.
            #[cfg(target_os = "linux")]
            {
                let bar_strip = [(0, 0, monitor_width_px as i32, bar_height_px as i32)];
                linux::set_region(&window, &bar_strip, !composited);
            }

            stats::spawn_stats_emitter(app.handle().clone());
            hlwm::spawn_hlwm_watcher(app.handle().clone());
            tray::spawn_tray_host(app.handle().clone());
            weather::spawn_weather(app.handle().clone());
            media::spawn_media(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::hlwm_use_tag,
            commands::set_volume,
            commands::toggle_mute,
            commands::set_brightness,
            commands::set_popup_open,
            commands::get_env,
            commands::get_hlwm_state,
            commands::get_tray_state,
            commands::get_weather_state,
            commands::get_media_state,
            commands::media_control,
            commands::tray_activate,
            commands::tray_menu_click,
            commands::get_config,
            commands::get_default_config,
            commands::save_config,
            commands::open_settings,
            commands::close_settings,
            commands::list_fonts,
            commands::launch_wifi_gui,
        ])
        .run(tauri::generate_context!())
        .expect("error while running divebar");
}
