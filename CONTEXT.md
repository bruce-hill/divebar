# Domain glossary

Terms the code and docs use for divebar's concepts. Use these names; don't
invent synonyms.

- **Bar** — the always-visible statusbar strip at the top of the screen.
- **Bar schema** — the bar-level settings (height, padding, accent,
  font): schema, defaults, and CSS-variable mapping all live in
  `src/lib/bar-config.js`; absent config keys mean "use the defaults".
  The one mirror is `DEFAULT_BAR_HEIGHT` in `main.rs` (the window is
  sized before the webview loads) — keep it equal to the schema's
  height default.
- **Widget** — a module on the bar (`src/widgets/*.js`) satisfying the
  contract in `src/main.js`: `{ name, css, settings?, create(ctx) }`.
- **Chip** — a widget's visual pill on the bar (icon + optional value).
- **Meter chip** — a chip showing a 0–100 value (volume, brightness):
  a segment-filled icon plus a collapsible percent that peeks on change.
  The shared pieces (peek, value ticker, segment fill, settings schema,
  value CSS) live in `src/lib/meter.js` as a toolkit the widgets compose
  in their own `create()` — deliberately not a single deep module.
- **Popup space** — the transparent window area below the bar where
  popups and tooltips render. Only interactive while something is open
  there (see Shape).
- **Shape** — the X11 input region/bounding region of the bar window,
  extended to cover an open panel via the `set_popup_open` command and
  shrunk back on close. Singular: the whole window has one shape, which
  is why at most one panel may hold the popup space. Only the
  Coordinator calls `set_popup_open`.
- **Panel** — anything rendered in the popup space (popup or tooltip).
  Pure DOM helpers (centering under an anchor, animation) live in
  `src/lib/panel.js`.
- **Popup** — an interactive panel (slider, tray menu, calendar) owned by
  `src/lib/popup.js`'s `createPopup`, which handles chrome, dismissal,
  and claiming the popup space. Callers supply only a body via
  `render()`.
- **Coordinator** — `src/lib/coordinator.js`; owns the popup space.
  Panels claim it (popup beats tooltip, same kind evicts, a tooltip
  claim against an open popup is denied) and the Coordinator makes
  every `set_popup_open` call — placing the panel and re-syncing the
  Shape whenever the claimed element resizes.
- **Claim** — a participant's tenancy of the popup space, returned by
  the Coordinator's `claim()` and ended by `release()` or eviction
  (which runs the claim's `onEvict` and makes its `release()` a no-op).
- **Tooltip** — a passive panel (`src/lib/tooltip.js`): no dismissal
  chrome; claims the popup space as a yielding participant — denied
  while a popup is open, evicted the moment one opens. Fed by the
  standard `title` attribute, intercepted on hover.
- **Layout editor** — the in-place edit mode on the bar
  (`src/lib/layout-edit.js`): widget interactions are suppressed,
  dragging reorders live, ✕ badges remove, and a toolbar popup under the
  bar adds widgets / exits. Entered from the right-click popup or the
  settings window (via the `divebar://edit-layout` frontend event).
- **Anchor** — the bar element a panel is centered under.
- **Channel** — a named backend → frontend event stream (`hlwm`, `tray`,
  `weather`, `media`, `stats`), emitted as `divebar://<name>` events via
  `src-tauri/src/events.rs`. Emitting through `events::emit` also caches
  the payload, so late subscribers replay every channel's latest state
  through the single `get_latest_states` command. `events::Trigger` is
  the coalescing wake-up line worker loops use for "refresh now".
- **Reader** — a function in `src-tauri/src/readers.rs` that reads a
  system source (process output, URL fetch, sysfs/procfs file) and
  returns JSON for the frontend. Readers are a thin impure fetch over a
  pure `parse_*` function; the parse functions are internal seams,
  unit-tested in-module with string fixtures. `readers::run` and
  `readers::fetch_url` are the only ways divebar spawns one-shot
  processes.
