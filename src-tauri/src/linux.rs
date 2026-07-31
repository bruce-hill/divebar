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

/// Whether a compositing manager is running. Without one, transparent
/// window regions render as solid black, so we must clip the window's
/// bounding shape instead of relying on alpha.
pub fn is_composited(window: &WebviewWindow) -> bool {
    window
        .gtk_window()
        .ok()
        .and_then(|w| WidgetExt::screen(&w))
        .map(|s| s.is_composited())
        .unwrap_or(false)
}

/// Applies the interactive (input) shape as a union of rectangles, so the
/// transparent popup space below the bar doesn't steal clicks from windows
/// underneath. When `shape_bounding` is true (no compositor), the same
/// region also becomes the window's visible bounding shape, hiding the
/// would-be-black transparent areas entirely.
pub fn set_region(window: &WebviewWindow, rects: &[(i32, i32, i32, i32)], shape_bounding: bool) {
    let Ok(gtk_window) = window.gtk_window() else {
        return;
    };
    let Some(gdk_window) = gtk_window.window() else {
        return;
    };
    let region = gdk::cairo::Region::create();
    for &(x, y, w, h) in rects {
        let _ = region.union_rectangle(&gdk::cairo::RectangleInt::new(x, y, w, h));
    }
    gdk_window.input_shape_combine_region(&region, 0, 0);
    if shape_bounding {
        gdk_window.shape_combine_region(Some(&region), 0, 0);
    }
}

/// Marks a window as a dialog so tiling WMs float it. Must run on the main
/// thread (GTK is not thread-safe).
pub fn make_dialog(window: &WebviewWindow) {
    if let Ok(gtk_window) = window.gtk_window() {
        gtk_window.set_type_hint(gdk::WindowTypeHint::Dialog);
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
