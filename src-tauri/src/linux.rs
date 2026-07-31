//! X11-specific window setup: mark the bar as a dock and set
//! `_NET_WM_STRUT_PARTIAL` so EWMH-compliant window managers reserve
//! screen space for it instead of placing windows underneath.

use gtk::prelude::*;
use std::os::raw::c_ulong;
use tauri::WebviewWindow;

/// Detects a HiDPI zoom factor from the GDK screen's font DPI (Xft.dpi /
/// XSETTINGS). WebKitGTK ignores font DPI and only scales by the integer
/// GDK window scale, so on setups where HiDPI is expressed via Xft.dpi
/// (or nothing at all), CSS pixels map 1:1 to tiny physical pixels.
/// Returns None when the DPI is unset or effectively 96.
pub fn detect_zoom(window: &WebviewWindow) -> Option<f64> {
    let gtk_window = window.gtk_window().ok()?;
    let screen = WidgetExt::screen(&gtk_window)?;
    let dpi = screen.resolution();
    let zoom = dpi / 96.0;
    if dpi > 0.0 && (zoom - 1.0).abs() > 0.05 {
        Some(zoom)
    } else {
        None
    }
}

pub fn setup_dock_window(
    window: &WebviewWindow,
    bar_height_px: u32,
    monitor_width_px: u32,
    origin_x: i32,
) {
    let Ok(gtk_window) = window.gtk_window() else {
        eprintln!("divebar: could not get GTK window; skipping dock setup");
        return;
    };

    gtk_window.set_type_hint(gdk::WindowTypeHint::Dock);
    gtk_window.stick(); // visible on all workspaces

    // The GDK window must exist before we can set X properties on it.
    gtk_window.realize();
    let Some(gdk_window) = gtk_window.window() else {
        eprintln!("divebar: GTK window not realized; skipping strut setup");
        return;
    };

    // _NET_WM_STRUT_PARTIAL: left, right, top, bottom,
    //   left_start_y, left_end_y, right_start_y, right_end_y,
    //   top_start_x, top_end_x, bottom_start_x, bottom_end_x
    let top = bar_height_px as c_ulong;
    let start_x = origin_x.max(0) as c_ulong;
    let end_x = start_x + monitor_width_px as c_ulong - 1;
    let strut: [c_ulong; 12] = [0, 0, top, 0, 0, 0, 0, 0, start_x, end_x, 0, 0];

    gdk::property_change(
        &gdk_window,
        &gdk::Atom::intern("_NET_WM_STRUT_PARTIAL"),
        &gdk::Atom::intern("CARDINAL"),
        32,
        gdk::PropMode::Replace,
        gdk::ChangeData::ULongs(&strut),
    );
}
