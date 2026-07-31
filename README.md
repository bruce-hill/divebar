# Divebar

A relatively simple status bar for Linux that uses HTML/CSS for nice styling
and layout. Built with [Tauri](https://tauri.app), in the spirit of polybar.

## Status

Working prototype. The bar spans the top of the primary monitor, registers
itself as an X11 dock (so EWMH-compliant window managers reserve space for it
via `_NET_WM_STRUT_PARTIAL`), and shows a hardcoded set of widgets:

- **logo** — static branding chip
- **clock** — time + date (center)
- **cpu** — usage % with a colored meter
- **memory** — used / total GiB
- **battery** — charge % + charging state (auto-hides on desktops)

## Running

```sh
cd src-tauri
cargo run            # or: cargo tauri dev
```

No Node/npm needed — the frontend is plain ES modules served from `src/` and
embedded at compile time (`withGlobalTauri` provides the Tauri API). Note that
frontend changes therefore require a rebuild, even under `cargo tauri dev`.

## Architecture

```
src/                    # frontend (no bundler)
├── index.html          # bar shell: three zones (left / center / right)
├── style.css           # bar chrome + shared .chip styling + CSS variables
├── config.js           # which widgets go in which zone (hardcoded for now)
├── main.js             # widget registry: loads config, mounts widgets
└── widgets/*.js        # one self-contained file per widget
src-tauri/
├── src/main.rs         # window creation: undecorated, full-width, top edge
├── src/linux.rs        # X11 dock type hint + strut (space reservation)
└── src/stats.rs        # background thread emitting `divebar://stats` events
```

### Widget contract

Each widget is one file in `src/widgets/` that default-exports:

```js
export default {
  name: "mywidget",        // unique id, matches the filename
  css: `...`,              // widget-scoped CSS, injected once by the registry
  create(ctx) {
    // ctx.options — the options object from config.js
    // ctx.onStats(cb) — subscribe to system stats; returns unsubscribe fn.
    //                   Replays the latest payload on subscribe.
    // ctx.invoke / ctx.listen — raw Tauri IPC for widgets with custom needs
    const el = document.createElement("div");
    el.className = "chip";  // opt into the shared chip look (optional)
    return { el, destroy() { /* cleanup */ } };
  },
};
```

To add a widget: drop the file in `src/widgets/` and reference it from
`config.js`. Nothing else to register.

System data flows one way: `stats.rs` gathers everything on a 2s tick and
emits a single `divebar://stats` event; the registry fans it out to widgets.
To expose a new stat, extend the payload in `stats.rs` and read it in your
widget. Widgets that need more than the shared stream (e.g. reacting to
clicks by invoking a command) can use `ctx.invoke`/`ctx.listen` directly.

## Roadmap / non-goals of the prototype

- **Settings menu** — `config.js` and the constants in `main.rs` (bar height)
  and `style.css` (`:root` variables for theming) are deliberately plain data,
  meant to be replaced by user-editable, persisted settings later.
- **Wayland** — space reservation currently uses X11 struts; Wayland support
  would go through `gtk-layer-shell` in `linux.rs`.
- **More widgets** — workspaces, window title, network, volume, tray.
- **Multi-monitor** — one bar per monitor.
