// Schema-driven setting inputs, shared by the settings window and the
// per-widget right-click popup on the bar. One schema entry renders as
// one form control wired to onChange(value); the caller owns
// persistence and default-merging.
//
//   createSettingInput(schema, current, { invoke, onChange }) -> Element
//
// Types: boolean, select, font, color, number, location, text (default).

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

export function createSettingInput(schema, current, { invoke, onChange }) {
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
