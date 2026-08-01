//! System tray host via the StatusNotifierItem D-Bus protocol. divebar
//! registers as the StatusNotifierWatcher/Host; apps publish their tray
//! items over D-Bus and we forward them to the frontend as
//! `divebar://tray` events (icons as data URIs). Clicks come back through
//! the tray_activate command. Legacy XEmbed-only tray apps are not
//! supported (they can't be rendered inside a webview).

use base64::Engine;
use serde_json::{json, Value};
use std::sync::{Mutex, OnceLock};
use system_tray::client::{ActivateRequest, Client};
use system_tray::data::BaseMap;
use system_tray::item::StatusNotifierItem;
use system_tray::menu::{MenuItem, MenuType, ToggleState, ToggleType, TrayMenu};
use tauri::AppHandle;

static CLIENT: OnceLock<Client> = OnceLock::new();

pub fn spawn_tray_host(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let client = match Client::new().await {
            Ok(client) => client,
            Err(err) => {
                eprintln!("divebar: tray host failed to start: {err}");
                return;
            }
        };
        let mut rx = client.subscribe();
        let items = client.items();
        let _ = CLIENT.set(client);

        emit(&app, &items);
        loop {
            use tokio::sync::broadcast::error::RecvError;
            match rx.recv().await {
                // Any event (add/update/remove) → rebuild the whole payload;
                // item counts are tiny so diffing isn't worth it.
                Ok(_) | Err(RecvError::Lagged(_)) => emit(&app, &items),
                Err(RecvError::Closed) => break,
            }
        }
    });
}

pub async fn activate(address: String, secondary: bool, x: i32, y: i32) -> Result<(), String> {
    let client = CLIENT.get().ok_or("tray host not running")?;
    let request = if secondary {
        ActivateRequest::Secondary { address, x, y }
    } else {
        ActivateRequest::Default { address, x, y }
    };
    client.activate(request).await.map_err(|e| e.to_string())
}

pub async fn menu_click(address: String, menu_path: String, id: i32) -> Result<(), String> {
    let client = CLIENT.get().ok_or("tray host not running")?;
    client
        .activate(ActivateRequest::MenuItem {
            address,
            menu_path,
            submenu_id: id,
        })
        .await
        .map_err(|e| e.to_string())
}

fn emit(app: &AppHandle, items: &std::sync::Arc<Mutex<BaseMap>>) {
    let payload = build_payload(items);
    crate::events::emit(app, "tray", payload);
}

fn build_payload(items: &std::sync::Arc<Mutex<BaseMap>>) -> Value {
    let map = items.lock().unwrap();
    let mut entries: Vec<(String, Value)> = map
        .iter()
        .map(|(address, (item, menu))| {
            (
                item.id.clone(),
                json!({
                    "address": address,
                    "id": item.id,
                    "title": item.title,
                    "icon": icon_data_uri(item),
                    "status": format!("{:?}", item.status),
                    "menuPath": item.menu,
                    "menu": serialize_menu(menu.as_ref()),
                }),
            )
        })
        .collect();
    // Sort by app id for a stable display order across updates.
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    Value::Array(entries.into_iter().map(|(_, v)| v).collect())
}

fn serialize_menu(menu: Option<&TrayMenu>) -> Value {
    match menu {
        Some(m) => Value::Array(m.submenus.iter().filter_map(serialize_menu_item).collect()),
        None => Value::Null,
    }
}

fn serialize_menu_item(item: &MenuItem) -> Option<Value> {
    if !item.visible {
        return None;
    }
    if matches!(item.menu_type, MenuType::Separator) {
        return Some(json!({ "type": "separator" }));
    }
    let checked = if matches!(item.toggle_type, ToggleType::CannotBeToggled) {
        Value::Null
    } else {
        match item.toggle_state {
            ToggleState::On => Value::Bool(true),
            ToggleState::Off => Value::Bool(false),
            ToggleState::Indeterminate => Value::Null,
        }
    };
    Some(json!({
        "type": "item",
        "id": item.id,
        "label": item.label,
        "enabled": item.enabled,
        "checked": checked,
        "children": item.submenu.iter().filter_map(serialize_menu_item).collect::<Vec<_>>(),
    }))
}

fn icon_data_uri(item: &StatusNotifierItem) -> Option<String> {
    // Prefer pixmaps sent over the bus; fall back to icon theme lookup.
    if let Some(pixmaps) = &item.icon_pixmap {
        if let Some(best) = pixmaps
            .iter()
            .filter(|p| p.width > 0 && p.height > 0)
            .min_by_key(|p| (p.width.max(p.height) - 32).abs())
        {
            // SNI pixmaps are ARGB32 in network byte order.
            let mut rgba = Vec::with_capacity(best.pixels.len());
            for px in best.pixels.chunks_exact(4) {
                rgba.extend_from_slice(&[px[1], px[2], px[3], px[0]]);
            }
            return crate::xicon::encode_png_data_uri(best.width as u32, best.height as u32, &rgba);
        }
    }

    let name = item.icon_name.as_deref().filter(|n| !n.is_empty())?;

    // The item may ship its own icon directory.
    if let Some(dir) = item.icon_theme_path.as_deref().filter(|p| !p.is_empty()) {
        for ext in ["png", "svg"] {
            let path = std::path::Path::new(dir).join(format!("{name}.{ext}"));
            if let Some(uri) = file_data_uri(&path) {
                return Some(uri);
            }
        }
    }

    let path = freedesktop_icons::lookup(name)
        .with_size(48)
        .with_cache()
        .find()?;
    file_data_uri(&path)
}

fn file_data_uri(path: &std::path::Path) -> Option<String> {
    let mime = match path.extension()?.to_str()? {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    let bytes = std::fs::read(path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    ))
}
