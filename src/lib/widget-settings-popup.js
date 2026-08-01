// Right-click settings for a bar widget: its schema-driven settings
// rendered inline in a pop-down, then a separator and links to the bar
// layout editor and the full divebar settings window. Popup mechanics
// live in popup.js and the inputs in setting-inputs.js; persistence
// stays with the caller via onChange(key, value).

import { createPopup } from "./popup.js";
import { placeAtX } from "./panel.js";
import { createSettingInput } from "./setting-inputs.js";

const SELECT_ARROW = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%239aa3b2" stroke-width="1.5" stroke-linecap="round"/></svg>')`;

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
  .dwset-sep, .dwset-global { flex: none; }
  .dwset-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 4px;
  }
  .dwset-row > label { color: var(--bar-fg-dim); white-space: nowrap; }
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

  /* Form controls (the bar window has no global form styling). Selects
     are taken out of native rendering — WebKitGTK's native controls
     render unreliably on dark pages. */
  .dwset input[type="text"],
  .dwset input[type="number"],
  .dwset select {
    font: inherit;
    color: var(--bar-fg);
    background-color: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 7px;
    padding: 3px 8px;
  }
  .dwset input[type="number"] { width: 72px; }
  .dwset select {
    -webkit-appearance: none;
    appearance: none;
    padding-right: 24px;
    background-image: ${SELECT_ARROW};
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .dwset select option { background: var(--bar-bg); color: var(--bar-fg); }
  /* Custom-drawn checkbox — the native one is nearly invisible on a
     dark background. */
  .dwset input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    width: 17px;
    height: 17px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.06);
    cursor: pointer;
    display: grid;
    place-content: center;
  }
  .dwset input[type="checkbox"]:checked {
    background: var(--accent);
    border-color: var(--accent);
  }
  .dwset input[type="checkbox"]:checked::after {
    content: "";
    width: 9px;
    height: 5px;
    border-left: 2px solid #10121a;
    border-bottom: 2px solid #10121a;
    transform: translateY(-1px) rotate(-45deg);
  }
  .dwset input[type="color"] {
    width: 46px;
    height: 27px;
    padding: 1px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    background: transparent;
  }
  .dwset .font-select { max-width: 190px; }
  .dwset .loc-field {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }
  .dwset .loc-field input { width: 190px; }
  .dwset .loc-status {
    color: var(--bar-fg-dim);
    font-size: 0.85em;
    max-width: 250px;
    text-align: right;
  }
  .dwset .loc-status.error { color: var(--critical, #e06c75); }
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
    invoke,
    className: "dwset",
    place: x != null ? (el) => placeAtX(el, x) : undefined,
    // Keep the popup open while a control that needs sustained focus is
    // active (typing in a field, a select or color dialog open) even if
    // the pointer wanders off.
    holdOpen: () => {
      const a = document.activeElement;
      return (
        bodyEl?.contains(a) &&
        a.matches('input[type="text"], input[type="number"], input[type="color"], select')
      );
    },
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
      for (const schema of schemas) {
        const row = document.createElement("div");
        row.className = "dwset-row";
        const label = document.createElement("label");
        label.textContent = schema.label ?? schema.key;
        const input = createSettingInput(schema, options[schema.key], {
          invoke,
          onChange: (value) => onChange(schema.key, value),
        });
        row.append(label, input);
        rows.append(row);
      }
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
