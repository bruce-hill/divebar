// Schema-driven settings form, shared by the settings window and the
// per-widget right-click popup on the bar. One schema entry renders as a
// row (label + control) reporting coerced values through
// onChange(key, value); values resolve as options[key] ?? schema.default,
// and the caller owns persistence.
//
//   renderSettingsRows(container, { schemas, options, invoke, onChange })
//   hasFocusedControl(container) -> bool   // popups' hold-open check
//
// Types: boolean, select, font, color, number, location, text (default).
//
// The module owns all form-control CSS: controls are drawn by hand
// (WebKitGTK's native ones render unreliably on dark pages), sized in em
// so each host's font size scales them, and themed via --form-*
// variables — the defaults match the bar's glass palette; the settings
// window overrides them in settings.css.

const SELECT_ARROW = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" fill="none" stroke="%239aa3b2" stroke-width="1.5" stroke-linecap="round"/></svg>')`;

const CSS = `
  .dform-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
  }
  .dform-row > label {
    color: var(--form-label, var(--bar-fg-dim, #9aa3b2));
    white-space: nowrap;
  }
  .dform-row input[type="text"],
  .dform-row input[type="number"],
  .dform-row select {
    font: inherit;
    color: var(--form-fg, var(--bar-fg, #e6e9ef));
    background-color: var(--form-control-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--form-border, rgba(255, 255, 255, 0.12));
    border-radius: 0.4em;
    padding: 0.2em 0.5em;
  }
  .dform-row input[type="number"] { width: 4.7em; }
  .dform-row select {
    -webkit-appearance: none;
    appearance: none;
    padding-right: 1.5em;
    background-image: ${SELECT_ARROW};
    background-repeat: no-repeat;
    background-position: right 0.5em center;
  }
  .dform-row select option {
    background: var(--form-option-bg, var(--bar-bg, #1c1f28));
    color: var(--form-fg, var(--bar-fg, #e6e9ef));
  }
  .dform-row input[type="checkbox"] {
    -webkit-appearance: none;
    appearance: none;
    width: 1.1em;
    height: 1.1em;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.3em;
    background: var(--form-control-bg, rgba(255, 255, 255, 0.06));
    cursor: pointer;
    display: grid;
    place-content: center;
  }
  .dform-row input[type="checkbox"]:checked {
    background: var(--form-accent, var(--accent, #7aa2f7));
    border-color: var(--form-accent, var(--accent, #7aa2f7));
  }
  .dform-row input[type="checkbox"]:checked::after {
    content: "";
    width: 0.55em;
    height: 0.3em;
    border-left: 0.12em solid #10121a;
    border-bottom: 0.12em solid #10121a;
    transform: translateY(-1px) rotate(-45deg);
  }
  .dform-row input[type="color"] {
    width: 2.9em;
    height: 1.7em;
    padding: 1px;
    border: 1px solid var(--form-border, rgba(255, 255, 255, 0.12));
    border-radius: 0.35em;
    background: var(--form-control-bg, rgba(255, 255, 255, 0.06));
    cursor: pointer;
  }
  .dform-row .font-select { max-width: 12.5em; }
  .dform-row .loc-field {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25em;
  }
  .dform-row .loc-field input { width: 13em; }
  .dform-row .loc-status {
    color: var(--form-fg-dim, var(--bar-fg-dim, #9aa3b2));
    font-size: 0.85em;
    max-width: 17em;
    text-align: right;
  }
  .dform-row .loc-status.error {
    color: var(--form-critical, var(--critical, #e06c75));
  }
`;

let stylesInjected = false;

/// Renders one .dform-row (label + control) per schema entry into
/// `container`. Values resolve as options[key] ?? schema.default;
/// changes report as onChange(key, value), coerced per type.
export function renderSettingsRows(container, { schemas, options, invoke, onChange }) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "settings-form";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  for (const schema of schemas) {
    const row = el("div", "dform-row");
    row.append(el("label", "", schema.label ?? schema.key));
    const current = options[schema.key] ?? schema.default;
    row.append(
      createSettingInput(schema, current, {
        invoke,
        onChange: (value) => onChange(schema.key, value),
      }),
    );
    container.append(row);
  }
}

/// Whether a control needing sustained focus (typing in a field, an open
/// select or color dialog) inside `container` is active — popups stay
/// open while this holds, even if the pointer wanders off.
export function hasFocusedControl(container) {
  const active = document.activeElement;
  return Boolean(
    container?.contains(active) &&
      active.matches('input[type="text"], input[type="number"], input[type="color"], select'),
  );
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Installed font families, fetched once and shared by all font pickers.
let fontsPromise = null;
function loadFonts(invoke) {
  fontsPromise ??= invoke("list_fonts").catch((err) => {
    console.error("divebar: list_fonts failed", err);
    return null;
  });
  return fontsPromise;
}

function createSettingInput(schema, current, { invoke, onChange }) {
  if (schema.type === "boolean") {
    const input = el("input");
    input.type = "checkbox";
    input.checked = Boolean(current);
    input.addEventListener("change", () => onChange(input.checked));
    return input;
  }

  if (schema.type === "select") {
    const input = el("select");
    for (const choice of schema.choices ?? []) {
      const opt = el("option", "", choice);
      opt.value = choice;
      input.append(opt);
    }
    input.value = current;
    input.addEventListener("change", () => onChange(input.value));
    return input;
  }

  if (schema.type === "font") {
    const input = el("select", "font-select");
    const defaultOpt = el("option", "", "(default)");
    defaultOpt.value = "";
    input.append(defaultOpt);
    if (current) {
      // Keep the saved value selectable before the font list arrives.
      const opt = el("option", "", current);
      opt.value = current;
      input.append(opt);
    }
    input.value = current ?? "";
    loadFonts(invoke).then((fonts) => {
      if (!fonts || !input.isConnected) return;
      input.replaceChildren(defaultOpt);
      for (const family of fonts) {
        const opt = el("option", "", family);
        opt.value = family;
        opt.style.fontFamily = `"${family}"`;
        input.append(opt);
      }
      input.value = current ?? "";
    });
    input.addEventListener("change", () => {
      input.style.fontFamily = input.value ? `"${input.value}"` : "";
      onChange(input.value);
    });
    if (current) input.style.fontFamily = `"${current}"`;
    return input;
  }

  if (schema.type === "color") {
    const input = el("input");
    input.type = "color";
    input.value = current || schema.default;
    input.addEventListener("change", () => onChange(input.value));
    return input;
  }

  if (schema.type === "number") {
    const input = el("input");
    input.type = "number";
    if (schema.min != null) input.min = schema.min;
    if (schema.max != null) input.max = schema.max;
    input.value = current;
    input.addEventListener("change", () => {
      let v = Number(input.value);
      if (Number.isNaN(v)) v = schema.default;
      if (schema.min != null) v = Math.max(schema.min, v);
      if (schema.max != null) v = Math.min(schema.max, v);
      input.value = v;
      onChange(v);
    });
    return input;
  }

  if (schema.type === "location") {
    return locationInput(schema, current, { invoke, onChange });
  }

  const input = el("input");
  input.type = "text";
  input.value = current ?? "";
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

// Location field with live feedback: a status line shows the place the
// typed value (or IP auto-detection, when empty) actually resolves to,
// so a bad geocode ("Brooklyn" → the Bahamas) is visible immediately.
function locationInput(schema, current, { invoke, onChange }) {
  const wrap = el("div", "loc-field");
  const text = el("input");
  text.type = "text";
  text.placeholder = schema.placeholder ?? "";
  text.value = current ?? "";
  const status = el("div", "loc-status");

  let seq = 0;
  const preview = async () => {
    const mySeq = ++seq;
    status.className = "loc-status";
    status.textContent = "Looking up…";
    try {
      const r = await invoke("resolve_location", { location: text.value });
      if (mySeq !== seq || !text.isConnected) return;
      const place = [r.area, r.region, r.country].filter(Boolean).join(", ");
      status.textContent = `${text.value.trim() ? "→" : "Auto-detected:"} ${place}`;
    } catch (err) {
      if (mySeq !== seq) return;
      status.textContent = String(err);
      status.classList.add("error");
    }
  };

  let previewTimer = null;
  text.addEventListener("input", () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(preview, 800);
  });
  text.addEventListener("change", () => onChange(text.value));

  wrap.append(text, status);
  preview();
  return wrap;
}
