// Right-click settings for a bar widget: its schema-driven settings
// rendered inline in a pop-down, then a separator and links to the bar
// layout editor and the full divebar settings window. Popup mechanics
// live in popup.js and the form rows (with their control CSS) in
// settings-form.js; persistence stays with the caller via
// onChange(key, value).

import { createPopup } from "./popup.js";
import { placeAtX } from "./panel.js";
import { renderSettingsRows, hasFocusedControl } from "./settings-form.js";

const CSS = `
  .dwset {
    min-width: 230px;
    max-width: 360px;
    /* The window is only POPUP_SPACE (320px) tall below the bar; the
       rows scroll instead of getting clipped (same cap as .dmenu). */
    max-height: 290px;
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    font-size: calc(var(--bar-font) * 0.78);
    color: var(--bar-fg);
  }
  .dwset-title { font-weight: 600; margin: 2px 4px 10px; flex: none; }
  .dwset-rows {
    display: flex;
    flex-direction: column;
    gap: 9px;
    overflow-y: auto;
    min-height: 0;
  }
  .dwset-rows .dform-row { padding: 0 4px; }
  .dwset-sep, .dwset-global { flex: none; }
  .dwset-none { color: var(--bar-fg-dim); padding: 0 4px; }
  .dwset-sep { height: 1px; background: rgba(255, 255, 255, 0.09); margin: 10px 0 4px; }
  .dwset-global {
    display: block;
    width: 100%;
    border: none;
    background: transparent;
    color: var(--bar-fg);
    font: inherit;
    text-align: left;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
  }
  .dwset-global:hover { background: var(--chip-bg-hover); }
`;

let stylesInjected = false;

// x (optional): clientX of the opening right-click; the popup drops
// down from there, context-menu style, instead of centering on the
// widget.
export function openWidgetSettings({
  anchor,
  invoke,
  title,
  schemas,
  options,
  onChange,
  onEditLayout,
  onOpenGlobal,
  x,
}) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "widget-settings-popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let bodyEl = null;
  const popup = createPopup({
    anchor,
    className: "dwset",
    place: x != null ? (el) => placeAtX(el, x) : undefined,
    holdOpen: () => hasFocusedControl(bodyEl),
    render(el) {
      bodyEl = el;
      const titleEl = document.createElement("div");
      titleEl.className = "dwset-title";
      titleEl.textContent = `${title} settings`;
      el.append(titleEl);

      const rows = document.createElement("div");
      rows.className = "dwset-rows";
      if (!schemas.length) {
        const none = document.createElement("div");
        none.className = "dwset-none";
        none.textContent = "No settings for this widget.";
        rows.append(none);
      }
      renderSettingsRows(rows, { schemas, options, invoke, onChange });
      el.append(rows);

      const sep = document.createElement("div");
      sep.className = "dwset-sep";
      el.append(sep);
      if (onEditLayout) {
        const edit = document.createElement("button");
        edit.className = "dwset-global";
        edit.textContent = "Edit bar layout…";
        edit.addEventListener("click", () => {
          popup.close();
          onEditLayout();
        });
        el.append(edit);
      }
      const global = document.createElement("button");
      global.className = "dwset-global";
      global.textContent = "divebar settings…";
      global.addEventListener("click", () => {
        popup.close();
        onOpenGlobal();
      });
      el.append(global);
    },
  });

  popup.open();
  return popup;
}
