# Domain glossary

Terms the code and docs use for divebar's concepts. Use these names; don't
invent synonyms.

- **Bar** — the always-visible statusbar strip at the top of the screen.
- **Widget** — a module on the bar (`src/widgets/*.js`) satisfying the
  contract in `src/main.js`: `{ name, css, settings?, create(ctx) }`.
- **Chip** — a widget's visual pill on the bar (icon + optional value).
- **Popup space** — the transparent window area below the bar where
  popups and tooltips render. Only interactive while something is open
  there (see Shape).
- **Shape** — the X11 input region/bounding region of the bar window,
  extended to cover an open panel via the `set_popup_open` command and
  shrunk back on close. Singular: the whole window has one shape, which
  is why at most one popup may be open.
- **Panel** — anything rendered in the popup space (popup or tooltip).
  Shared panel mechanics (centering under an anchor, animation, shape
  sync) live in `src/lib/panel.js`.
- **Popup** — an interactive panel (slider, tray menu, calendar) owned by
  `src/lib/popup.js`'s `createPopup`, which handles chrome, dismissal,
  and coordination. Callers supply only a body via `render()`.
- **Coordinator** — `src/lib/popup-state.js`; enforces at-most-one open
  popup because popups share the single Shape.
- **Tooltip** — a passive panel (`src/lib/tooltip.js`): no dismissal
  logic, never owns the Coordinator slot, yields to popups. Fed by the
  standard `title` attribute, intercepted on hover.
- **Anchor** — the bar element a panel is centered under.
- **Reader** — a function in `src-tauri/src/readers.rs` that reads a
  system source (process output, URL fetch, sysfs/procfs file) and
  returns JSON for the frontend. Readers are a thin impure fetch over a
  pure `parse_*` function; the parse functions are internal seams,
  unit-tested in-module with string fixtures. `readers::run` and
  `readers::fetch_url` are the only ways divebar spawns one-shot
  processes.
