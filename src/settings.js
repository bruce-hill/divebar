// Settings window: edit which widgets are in which zone, their order, and
// their per-widget options. Widget option forms are generated from each
// widget module's `settings` schema, so widgets fully describe themselves.

import WIDGET_NAMES from "./widgets/index.js";

const ZONES = ["left", "center", "right"];

const modules = {};
let saved = { zones: { left: [], center: [], right: [] } };
let state = structuredClone(saved);

const zonesEl = document.getElementById("zones");
const statusEl = document.getElementById("status");

let invoke = null;

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = kind;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function settingInput(schema, entry) {
  const current = entry.options?.[schema.key] ?? schema.default;
  let input;
  if (schema.type === "boolean") {
    input = el("input");
    input.type = "checkbox";
    input.checked = Boolean(current);
    input.addEventListener("change", () => {
      (entry.options ??= {})[schema.key] = input.checked;
    });
  } else if (schema.type === "select") {
    input = el("select");
    for (const choice of schema.choices ?? []) {
      const opt = el("option", "", choice);
      opt.value = choice;
      input.append(opt);
    }
    input.value = current;
    input.addEventListener("change", () => {
      (entry.options ??= {})[schema.key] = input.value;
    });
  } else if (schema.type === "number") {
    input = el("input");
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
      (entry.options ??= {})[schema.key] = v;
    });
  } else {
    input = el("input");
    input.type = "text";
    input.value = current ?? "";
    input.addEventListener("change", () => {
      (entry.options ??= {})[schema.key] = input.value;
    });
  }
  return input;
}

function widgetCard(zone, list, entry, index) {
  const card = el("div", "card");
  const header = el("div", "card-header");
  header.append(el("span", "name", entry.widget));

  const up = el("button", "icon-btn", "▲");
  up.title = "Move up";
  up.disabled = index === 0;
  up.addEventListener("click", () => {
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    render();
  });

  const down = el("button", "icon-btn", "▼");
  down.title = "Move down";
  down.disabled = index === list.length - 1;
  down.addEventListener("click", () => {
    [list[index], list[index + 1]] = [list[index + 1], list[index]];
    render();
  });

  const zoneSelect = el("select");
  zoneSelect.title = "Zone";
  for (const z of ZONES) {
    const opt = el("option", "", z);
    opt.value = z;
    zoneSelect.append(opt);
  }
  zoneSelect.value = zone;
  zoneSelect.addEventListener("change", () => {
    list.splice(index, 1);
    (state.zones[zoneSelect.value] ??= []).push(entry);
    render();
  });

  const remove = el("button", "icon-btn remove", "✕");
  remove.title = "Remove";
  remove.addEventListener("click", () => {
    list.splice(index, 1);
    render();
  });

  header.append(up, down, zoneSelect, remove);
  card.append(header);

  const schemas = modules[entry.widget]?.settings ?? [];
  if (schemas.length > 0) {
    const settings = el("div", "card-settings");
    for (const schema of schemas) {
      const row = el("div", "setting-row");
      row.append(el("label", "", schema.label ?? schema.key));
      row.append(settingInput(schema, entry));
      settings.append(row);
    }
    card.append(settings);
  }
  return card;
}

function addRow(zone) {
  const row = el("div", "add-row");
  const select = el("select");
  for (const name of WIDGET_NAMES) {
    if (!modules[name]) continue;
    const opt = el("option", "", name);
    opt.value = name;
    select.append(opt);
  }
  const btn = el("button", "", "Add");
  btn.addEventListener("click", () => {
    (state.zones[zone] ??= []).push({ widget: select.value, options: {} });
    render();
  });
  row.append(select, btn);
  return row;
}

function render() {
  zonesEl.replaceChildren();
  for (const zone of ZONES) {
    const col = el("div", "zone-col");
    col.append(el("h2", "", zone));
    const list = (state.zones[zone] ??= []);
    list.forEach((entry, i) => col.append(widgetCard(zone, list, entry, i)));
    col.append(addRow(zone));
    zonesEl.append(col);
  }
}

document.getElementById("save").addEventListener("click", async () => {
  try {
    await invoke("save_config", { config: state });
    saved = structuredClone(state);
    setStatus("Saved and applied ✓", "ok");
  } catch (err) {
    setStatus(`Save failed: ${err}`, "error");
  }
});

document.getElementById("revert").addEventListener("click", () => {
  state = structuredClone(saved);
  render();
  setStatus("Reverted to last saved config");
});

document.getElementById("reset").addEventListener("click", async () => {
  try {
    state = await invoke("get_default_config");
    render();
    setStatus("Defaults loaded — Save & Apply to keep them");
  } catch (err) {
    setStatus(`Loading defaults failed: ${err}`, "error");
  }
});

async function init() {
  if (!window.__TAURI__?.core) {
    throw new Error("Tauri API not available in this window");
  }
  invoke = window.__TAURI__.core.invoke;

  // Load widget modules for their names + settings schemas.
  for (const name of WIDGET_NAMES) {
    try {
      modules[name] = (await import(`./widgets/${name}.js`)).default;
    } catch (err) {
      console.error(`divebar settings: failed to load widget "${name}"`, err);
    }
  }

  saved = await invoke("get_config");
  state = structuredClone(saved);
  render();
}

init().catch((err) => {
  console.error("divebar settings: init failed", err);
  render(); // show the (empty) zone scaffolding at least
  setStatus(`Failed to load settings: ${err}`, "error");
});

window.addEventListener("unhandledrejection", (e) =>
  setStatus(`Error: ${e.reason}`, "error"),
);
window.addEventListener("error", (e) => setStatus(`Error: ${e.message}`, "error"));
