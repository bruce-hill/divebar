//! MPRIS media player integration over D-Bus. Watches for players
//! (org.mpris.MediaPlayer2.*), tracks the active one (playing preferred),
//! and emits `divebar://media` events with title/artist/status/album art.
//! Property changes and player appearance/disappearance both trigger
//! immediate refreshes. Playback is controlled via the media_control
//! command.

use base64::Engine;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use zbus::{zvariant, Connection, MatchRule, MessageStream, Proxy};

static LATEST: Mutex<Option<Value>> = Mutex::new(None);
static ACTIVE_PLAYER: Mutex<Option<String>> = Mutex::new(None);
static CONN: OnceLock<Connection> = OnceLock::new();
static ART_CACHE: Mutex<Option<HashMap<String, Option<String>>>> = Mutex::new(None);

const MPRIS_PREFIX: &str = "org.mpris.MediaPlayer2.";
const MPRIS_PATH: &str = "/org/mpris/MediaPlayer2";
const PLAYER_IFACE: &str = "org.mpris.MediaPlayer2.Player";

pub fn latest_state() -> Value {
    LATEST.lock().unwrap().clone().unwrap_or(Value::Null)
}

pub fn spawn_media(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run(app).await {
            eprintln!("divebar: media watcher failed: {err}");
        }
    });
}

pub async fn control(action: &str) -> Result<(), String> {
    let conn = CONN.get().ok_or("media watcher not running")?;
    let player = ACTIVE_PLAYER
        .lock()
        .unwrap()
        .clone()
        .ok_or("no active player")?;
    let method = match action {
        "playPause" => "PlayPause",
        "next" => "Next",
        "previous" => "Previous",
        _ => return Err(format!("unknown media action: {action}")),
    };
    let proxy = Proxy::new(conn, player, MPRIS_PATH, PLAYER_IFACE)
        .await
        .map_err(|e| e.to_string())?;
    proxy
        .call_method(method, &())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

async fn run(app: AppHandle) -> zbus::Result<()> {
    let conn = Connection::session().await?;
    let _ = CONN.set(conn.clone());

    // Property changes on any player.
    let props_rule = MatchRule::builder()
        .msg_type(zbus::message::Type::Signal)
        .interface("org.freedesktop.DBus.Properties")?
        .member("PropertiesChanged")?
        .path(MPRIS_PATH)?
        .build();
    let props_stream = MessageStream::for_match_rule(props_rule, &conn, Some(32)).await?;

    // Players appearing/disappearing.
    let dbus = zbus::fdo::DBusProxy::new(&conn).await?;
    let names_stream = dbus.receive_name_owner_changed().await?;

    refresh(&app, &conn).await;

    {
        let app = app.clone();
        let conn = conn.clone();
        tauri::async_runtime::spawn(async move {
            let mut stream = props_stream;
            while stream.next().await.is_some() {
                refresh(&app, &conn).await;
            }
        });
    }
    {
        let app = app.clone();
        let conn = conn.clone();
        tauri::async_runtime::spawn(async move {
            let mut stream = names_stream;
            while let Some(signal) = stream.next().await {
                let is_mpris = signal
                    .args()
                    .map(|a| a.name().starts_with(MPRIS_PREFIX))
                    .unwrap_or(false);
                if is_mpris {
                    refresh(&app, &conn).await;
                }
            }
        });
    }
    Ok(())
}

async fn refresh(app: &AppHandle, conn: &Connection) {
    let payload = gather(conn).await;
    *LATEST.lock().unwrap() = Some(payload.clone());
    let _ = app.emit("divebar://media", payload);
}

async fn gather(conn: &Connection) -> Value {
    let Ok(dbus) = zbus::fdo::DBusProxy::new(conn).await else {
        return Value::Null;
    };
    let Ok(names) = dbus.list_names().await else {
        return Value::Null;
    };
    let players: Vec<String> = names
        .iter()
        .map(|n| n.to_string())
        .filter(|n| n.starts_with(MPRIS_PREFIX))
        .collect();

    // Prefer a playing player; otherwise take the first one.
    let mut best: Option<(String, String)> = None; // (name, status)
    for name in &players {
        let Ok(proxy) = Proxy::new(conn, name.clone(), MPRIS_PATH, PLAYER_IFACE).await else {
            continue;
        };
        let status: String = proxy
            .get_property("PlaybackStatus")
            .await
            .unwrap_or_default();
        let is_playing = status == "Playing";
        if best.is_none() || is_playing {
            best = Some((name.clone(), status));
            if is_playing {
                break;
            }
        }
    }
    let Some((name, status)) = best else {
        *ACTIVE_PLAYER.lock().unwrap() = None;
        return Value::Null;
    };
    *ACTIVE_PLAYER.lock().unwrap() = Some(name.clone());

    let Ok(proxy) = Proxy::new(conn, name.clone(), MPRIS_PATH, PLAYER_IFACE).await else {
        return Value::Null;
    };
    let metadata: HashMap<String, zvariant::OwnedValue> =
        proxy.get_property("Metadata").await.unwrap_or_default();

    let title = metadata
        .get("xesam:title")
        .and_then(value_str)
        .unwrap_or_default();
    let artist = metadata
        .get("xesam:artist")
        .map(value_str_array)
        .unwrap_or_default()
        .join(", ");
    let art = metadata
        .get("mpris:artUrl")
        .and_then(value_str)
        .and_then(|url| art_data_uri(&url));

    let fallback_identity = name.trim_start_matches(MPRIS_PREFIX).to_string();
    let identity: String =
        match Proxy::new(conn, name.clone(), MPRIS_PATH, "org.mpris.MediaPlayer2").await {
            Ok(p) => p
                .get_property("Identity")
                .await
                .unwrap_or(fallback_identity),
            Err(_) => fallback_identity,
        };

    json!({
        "player": identity,
        "status": status,
        "title": title,
        "artist": artist,
        "art": art,
    })
}

fn value_str(v: &zvariant::OwnedValue) -> Option<String> {
    v.downcast_ref::<&str>().ok().map(str::to_string)
}

fn value_str_array(v: &zvariant::OwnedValue) -> Vec<String> {
    let Ok(arr) = v.downcast_ref::<&zvariant::Array>() else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| item.downcast_ref::<&str>().ok().map(str::to_string))
        .collect()
}

/// Resolves an artUrl (file:// or http(s)://) to a data URI, cached per URL.
fn art_data_uri(url: &str) -> Option<String> {
    {
        let mut cache = ART_CACHE.lock().unwrap();
        let cache = cache.get_or_insert_with(HashMap::new);
        if let Some(cached) = cache.get(url) {
            return cached.clone();
        }
        if cache.len() > 32 {
            cache.clear();
        }
    }
    let bytes: Option<Vec<u8>> = if let Some(path) = url.strip_prefix("file://") {
        std::fs::read(percent_decode(path)).ok()
    } else if url.starts_with("http://") || url.starts_with("https://") {
        std::process::Command::new("curl")
            .args(["-sf", "--max-time", "5", url])
            .output()
            .ok()
            .filter(|o| o.status.success())
            .map(|o| o.stdout)
    } else {
        None
    };
    let uri = bytes
        .filter(|b| !b.is_empty() && b.len() < 1_000_000)
        .map(|b| {
            let mime = if b.starts_with(b"\x89PNG") {
                "image/png"
            } else {
                "image/jpeg"
            };
            format!(
                "data:{mime};base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&b)
            )
        });
    ART_CACHE
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(url.to_string(), uri.clone());
    uri
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
