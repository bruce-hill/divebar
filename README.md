# Divebar

A relatively simple status bar for Linux that uses HTML/CSS for nice styling
and layout. Built with [Tauri](https://tauri.app), in the spirit of polybar.
I was kinda annoyed that polybar and other similar projects are so bad at
styling compared to what you can get with HTML/CSS, simple stuff like proper
text truncation, dynamic sizing, and so on. So, I made this project to get a
simple status bar that actually does have sane layout and formatting options.

## ⚠️ Slop Alert! ⚠️

This project is wholly vibe coded. I made it for personal usage, but just
thought you should know.

## Status

Working prototype. The bar spans the top of the primary monitor, registers
itself as an X11 dock (so EWMH-compliant window managers reserve space for it
via `_NET_WM_STRUT_PARTIAL`), and shows a hardcoded set of widgets:

- **workspaces** — herbstluftwm tag switcher (click to switch; live via
  `herbstclient --idle`)
- **window-title** — focused window title, expands to fill spare space
  (flex-grow) with ellipsis truncation; configurable text alignment
- **wifi** — SSID + signal %; click launches `/usr/local/bin/wifi-gui`
- **volume** — level via wpctl; click opens a pop-down slider, clicking the
  icon toggles mute
- **brightness** — level via brightnessctl; click opens a pop-down slider
- **battery** — charge % + charging state (auto-hides on desktops)
- **tray** — system tray via the StatusNotifierItem D-Bus protocol (divebar
  acts as the tray host); left click activates, middle click secondary,
  right click opens the item's menu. Legacy XEmbed-only tray apps are not
  supported
- **date** — "Fri Jul 31" (fixed width; optional year)
- **time** — "2:27pm" (fixed width; optional 24-hour / seconds)

Also available but not in the default config: **spacer** (invisible,
configurable flex-grow — for pushing widget groups apart), **weather**
(wttr.in, no API key; icon + temp, details in tooltip, IP-based location
unless configured), **media** (MPRIS: album art + track, click
play/pause, middle-click next).

The date widget's click opens a month calendar; tooltips are custom
styled panels; the Bar section of settings includes height, padding,
accent color, and font.

## Configuration

Config lives in `~/.local/config/divebar/config.json` (created with
defaults on first run; hand-editable). Layout is edited on the bar
itself: pick "Edit bar layout…" from any widget's right-click popup (or
the settings window) to drag widgets around in place, remove them with
their ✕ badges, and add new ones from the toolbar that drops down under
the bar (the bar is one flex row; every widget sizes to its content, and
window-title flex-grows). Right-click a widget to edit its options
inline; the settings window — gear icon or right-click — holds the
bar-level settings. Every change saves and applies to the bar instantly.

## Running

```sh
cd src-tauri
cargo run            # or: cargo tauri dev
```

Or via make: `make build` (release), `make install` (to
`$(PREFIX)/bin`, default `/usr/local` — `sudo make install`),
`make uninstall`, `make run`, `make clean`.

No Node/npm needed — the frontend is plain ES modules served from `src/` and
embedded at compile time (`withGlobalTauri` provides the Tauri API). Note that
frontend changes therefore require a rebuild, even under `cargo tauri dev`.

## HiDPI

WebKitGTK only scales by the integer GDK window scale and ignores font DPI
(`Xft.dpi`), so on HiDPI setups the bar can render tiny. divebar zooms the
webview to compensate: it honors a `DIVEBAR_ZOOM` env var (e.g.
`DIVEBAR_ZOOM=1.5`), falls back to autodetecting `Xft.dpi`/XSETTINGS, and
scales the bar height to match.

## Architecture

```
src/                    # frontend (no bundler)
├── index.html          # bar shell: a single flex row
├── style.css           # bar chrome + shared .chip styling + CSS variables
├── main.js             # widget registry: loads config, mounts widgets
├── settings.html/js/css# settings window (separate floating dialog)
├── lib/                # shared frontend helpers (slider popup)
└── widgets/*.js        # one self-contained file per widget (+ index.js manifest)
src-tauri/
├── src/main.rs         # window creation: undecorated, full-width, top edge
├── src/linux.rs        # X11 dock type hint + strut (space reservation)
├── src/config.rs       # config load/save (~/.local/config/divebar/)
├── src/stats.rs        # background thread emitting `divebar://stats` events
├── src/hlwm.rs         # herbstclient --idle watcher → `divebar://hlwm` events
├── src/readers.rs      # volume/brightness/wifi readers (shared by both below)
└── src/commands.rs     # control commands: tag switch, volume, brightness, …
```

### Widget contract

Each widget is one file in `src/widgets/` that default-exports:

```js
export default {
  name: "mywidget",        // unique id, matches the filename
  css: `...`,              // widget-scoped CSS, injected once by the registry
  settings: [              // optional: schema the settings UI renders
    // { key, label, type: "boolean"|"number"|"select"|"text",
    //   default, min?, max?, choices? }
  ],
  create(ctx) {
    // ctx.options — the options object from config.js
    // ctx.onStats(cb) — subscribe to system stats; returns unsubscribe fn.
    //                   Replays the latest payload on subscribe.
    // ctx.onEvent(name, cb) — same, for any backend event channel
    //                         (e.g. "divebar://hlwm" for WM state)
    // ctx.invoke / ctx.listen — raw Tauri IPC for widgets with custom needs
    const el = document.createElement("div");
    el.className = "chip";  // opt into the shared chip look (optional)
    return { el, destroy() { /* cleanup */ } };
  },
};
```

To add a widget: drop the file in `src/widgets/`, list it in
`src/widgets/index.js` (the manifest the add-widget picker reads), and
put it on the bar via the layout editor or the config file. `ctx.options`
arrives pre-merged with the schema's defaults.

System data flows one way, over two event channels:

- `divebar://stats` — `stats.rs` polls battery, volume, brightness, and
  wifi every 2s. To expose a new stat, extend the payload
  (add a reader in `readers.rs` if a command also needs it).
- `divebar://hlwm` — pushed immediately on every WM event (tag switches,
  focus/title changes) via a persistent `herbstclient --idle` process.

User-initiated controls go the other way as Tauri commands
(`src-tauri/src/commands.rs`): `hlwm_use_tag`, `set_volume`, `toggle_mute`,
`set_brightness`, `set_popup_open`, `launch_wifi_gui`. Commands that change
a value return the fresh state so widgets update instantly rather than
waiting for the next poll.

### Pop-down panels

The window is actually taller than the bar (`POPUP_SPACE` in `main.rs`):
the transparent strip below the bar hosts pop-down panels like the
volume/brightness sliders (`src/lib/slider-popup.js`). An X11 input shape
normally restricts pointer input to the bar strip so the popup space is
click-through; while a popup is open, the `set_popup_open` command expands
the input region to the full window (and clicking outside the popup closes
it and shrinks the region back). Only the bar strip is reserved via strut.

## Roadmap / non-goals of the prototype

- **Wayland** — space reservation currently uses X11 struts; Wayland support
  would go through `gtk-layer-shell` in `linux.rs`.
- **More widgets** — notifications.
- **Multi-monitor** — one bar per monitor.
