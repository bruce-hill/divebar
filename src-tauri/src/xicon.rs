//! Fetches window icons (_NET_WM_ICON) directly over X11 and converts them
//! to PNG data URIs for the frontend. Icons are cached per window class so
//! each app is only fetched and encoded once.

use base64::Engine;
use std::collections::HashMap;
use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};
use x11rb::rust_connection::RustConnection;

/// Preferred icon size: frames closest to this edge length win.
const TARGET_SIZE: i64 = 64;

pub struct IconFetcher {
    conn: Option<(RustConnection, u32)>, // connection + _NET_WM_ICON atom
    cache: HashMap<String, Option<String>>,
}

impl IconFetcher {
    pub fn new() -> Self {
        let conn = x11rb::connect(None).ok().and_then(|(conn, _)| {
            let atom = conn
                .intern_atom(false, b"_NET_WM_ICON")
                .ok()?
                .reply()
                .ok()?
                .atom;
            Some((conn, atom))
        });
        if conn.is_none() {
            eprintln!("divebar: no X connection; window icons disabled");
        }
        Self {
            conn,
            cache: HashMap::new(),
        }
    }

    pub fn icon_for(&mut self, window: u32, cache_key: &str) -> Option<String> {
        if let Some(cached) = self.cache.get(cache_key) {
            return cached.clone();
        }
        let icon = self.fetch(window);
        self.cache.insert(cache_key.to_string(), icon.clone());
        icon
    }

    fn fetch(&self, window: u32) -> Option<String> {
        let (conn, atom) = self.conn.as_ref()?;
        let reply = conn
            .get_property(false, window, *atom, AtomEnum::CARDINAL, 0, u32::MAX)
            .ok()?
            .reply()
            .ok()?;
        let data: Vec<u32> = reply.value32()?.collect();
        let (width, height, pixels) = best_frame(&data)?;

        // _NET_WM_ICON pixels are ARGB; PNG wants RGBA.
        let mut rgba = Vec::with_capacity(pixels.len() * 4);
        for &px in pixels {
            rgba.extend_from_slice(&[(px >> 16) as u8, (px >> 8) as u8, px as u8, (px >> 24) as u8]);
        }
        encode_png_data_uri(width, height, &rgba)
    }
}

/// Encodes raw RGBA pixels as a PNG data URI.
pub fn encode_png_data_uri(width: u32, height: u32, rgba: &[u8]) -> Option<String> {
    let mut png_data = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_data, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(rgba).ok()?;
    }
    Some(format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&png_data)
    ))
}

/// _NET_WM_ICON holds a sequence of (width, height, w*h pixels) frames;
/// picks the one closest to TARGET_SIZE.
fn best_frame(data: &[u32]) -> Option<(u32, u32, &[u32])> {
    let mut best: Option<(u32, u32, &[u32])> = None;
    let mut best_score = i64::MAX;
    let mut i = 0usize;
    while i + 2 <= data.len() {
        let (w, h) = (data[i] as usize, data[i + 1] as usize);
        if w == 0 || h == 0 || w > 1024 || h > 1024 || i + 2 + w * h > data.len() {
            break;
        }
        let frame = &data[i + 2..i + 2 + w * h];
        let score = (w.max(h) as i64 - TARGET_SIZE).abs();
        if score < best_score {
            best_score = score;
            best = Some((w as u32, h as u32, frame));
        }
        i += 2 + w * h;
    }
    best
}
