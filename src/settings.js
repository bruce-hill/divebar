// Settings window: one vertical list of widget rows matching the bar's
// flex order. Drag rows to reorder, click a row to expand its settings
// inline, use "+ Add widget" to append, ✕ to remove. Every change saves
// and applies to the real bar immediately.

import WIDGET_NAMES from "./widgets/index.js";
import { BAR_SETTINGS } from "./lib/bar-config.js";
import { createSettingInput } from "./lib/setting-inputs.js";

const modules = {};
let state = { widgets: [] };
let expandedEntry = null;
let adding = false; // whether the "+ Add widget" picker is open
let dragData = null; // { index }
let invoke = null;

const statusEl = document.getElementById("status");
const sectionsEl = document.getElementById("sections");

const marker = document.createElement("div");
marker.className = "drop-marker";

// --- Status + persistence --------------------------------------------------

let statusTimer = null;
function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = kind;
  statusEl.style.opacity = "1";
  if (statusTimer) clearTimeout(statusTimer);
  if (kind === "ok") {
    statusTimer = setTimeout(() => (statusEl.style.opacity = "0"), 1500);
  }
}

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await invoke("save_config", { config: state });
      setStatus("Saved ✓", "ok");
    } catch (err) {
      setStatus(`Save failed: ${err}`, "error");
    }
  }, 250);
}

function mutated() {
  render();
  scheduleSave();
}

// --- Helpers ---------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function endDrag() {
  dragData = null;
  document.body.classList.remove("dragging");
  marker.remove();
}

// --- Widget rows -----------------------------------------------------------

function settingInput(schema, entry) {
  return createSettingInput(
    schema,
    entry.options?.[schema.key] ?? schema.default,
    {
      invoke,
      onChange(value) {
        (entry.options ??= {})[schema.key] = value;
        scheduleSave();
      },
    },
  );
}

function rowFor(entry, index) {
  const row = el("div", "row");
  const schemas = modules[entry.widget]?.settings ?? [];
  const expanded = entry === expandedEntry;
  if (expanded) row.classList.add("expanded");

  const main = el("div", "row-main");
  main.draggable = true;
  main.append(el("span", "handle", "⠿"));
  main.append(el("span", "name", entry.widget));
  if (schemas.length > 0) {
    main.append(el("span", "badge", `${schemas.length} setting${schemas.length > 1 ? "s" : ""}`));
  }
  main.append(el("span", "chev", "▶"));

  const x = el("span", "x", "✕");
  x.title = "Remove";
  x.addEventListener("click", (e) => {
    e.stopPropagation();
    state.widgets.splice(index, 1);
    if (entry === expandedEntry) expandedEntry = null;
    mutated();
  });
  main.append(x);

  main.addEventListener("click", () => {
    expandedEntry = expanded ? null : entry;
    render();
  });

  main.addEventListener("dragstart", (e) => {
    dragData = { index };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", entry.widget);
    document.body.classList.add("dragging");
    requestAnimationFrame(() => row.classList.add("ghost"));
  });
  main.addEventListener("dragend", () => {
    row.classList.remove("ghost");
    endDrag();
  });

  row.append(main);

  if (expanded) {
    const settings = el("div", "row-settings");
    if (schemas.length === 0) {
      settings.append(el("span", "none", "This widget has no configurable settings."));
    } else {
      for (const schema of schemas) {
        const srow = el("div", "setting-row");
        srow.append(el("label", "", schema.label ?? schema.key));
        srow.append(settingInput(schema, entry));
        settings.append(srow);
      }
    }
    row.append(settings);
  }
  return row;
}

// Insertion index from the pointer position among a list's rows.
function dropIndex(rowsEl, clientY) {
  const rows = [...rowsEl.querySelectorAll(".row")];
  for (let i = 0; i < rows.length; i++) {
    const rect = rows[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return rows.length;
}

function setupRowsDnD(rowsEl) {
  rowsEl.addEventListener("dragover", (e) => {
    if (!dragData) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const index = dropIndex(rowsEl, e.clientY);
    const rows = [...rowsEl.querySelectorAll(".row")];
    rowsEl.insertBefore(marker, rows[index] ?? null);
  });

  rowsEl.addEventListener("dragleave", (e) => {
    if (!rowsEl.contains(e.relatedTarget) && marker.parentElement === rowsEl) {
      marker.remove();
    }
  });

  rowsEl.addEventListener("drop", (e) => {
    if (!dragData) return;
    e.preventDefault();
    let index = dropIndex(rowsEl, e.clientY);
    const [entry] = state.widgets.splice(dragData.index, 1);
    if (dragData.index < index) index--;
    state.widgets.splice(index, 0, entry);
    endDrag();
    mutated();
  });
}

// --- Bar settings ----------------------------------------------------------

function barSection() {
  const section = el("section");
  section.append(el("h2", "", "Bar"));
  const body = el("div", "row");
  const inner = el("div", "row-settings");
  inner.style.borderTop = "none";
  const entry = { options: (state.bar ??= {}) };
  for (const schema of BAR_SETTINGS) {
    const row = el("div", "setting-row");
    row.append(el("label", "", schema.label));
    row.append(settingInput(schema, entry));
    inner.append(row);
  }
  body.append(inner);
  section.append(body);
  return section;
}

// --- Add widget ------------------------------------------------------------

function addControls() {
  const wrap = el("div", "add-row");
  if (!adding) {
    const btn = el("button", "", "＋ Add widget");
    btn.addEventListener("click", () => {
      adding = true;
      render();
    });
    wrap.append(btn);
    return wrap;
  }

  const select = el("select");
  for (const name of [...WIDGET_NAMES].sort()) {
    if (!modules[name]) continue;
    const opt = el("option", "", name);
    opt.value = name;
    select.append(opt);
  }
  const add = el("button", "", "Add");
  add.addEventListener("click", () => {
    const entry = { widget: select.value, options: {} };
    state.widgets.push(entry);
    expandedEntry = entry;
    adding = false;
    mutated();
  });
  const cancel = el("button", "", "Cancel");
  cancel.addEventListener("click", () => {
    adding = false;
    render();
  });
  wrap.append(select, add, cancel);
  return wrap;
}

// --- Render + init ---------------------------------------------------------

function render() {
  sectionsEl.replaceChildren();
  sectionsEl.append(barSection());
  const section = el("section");
  section.append(el("h2", "", "Widgets (bar order, left to right)"));
  const rowsEl = el("div", "rows");
  const list = (state.widgets ??= []);
  list.forEach((entry, i) => rowsEl.append(rowFor(entry, i)));
  rowsEl.classList.toggle("empty", list.length === 0);
  setupRowsDnD(rowsEl);
  section.append(rowsEl);
  section.append(addControls());
  sectionsEl.append(section);
}

document.getElementById("close").addEventListener("click", () => {
  window.__TAURI__?.core
    ?.invoke("close_settings")
    .catch((err) => setStatus(`Close failed: ${err}`, "error"));
});

document.getElementById("reset").addEventListener("click", async () => {
  try {
    state = await invoke("get_default_config");
    expandedEntry = null;
    adding = false;
    mutated();
    setStatus("Reset to defaults");
  } catch (err) {
    setStatus(`Reset failed: ${err}`, "error");
  }
});

async function init() {
  if (!window.__TAURI__?.core) {
    throw new Error("Tauri API not available in this window");
  }
  invoke = window.__TAURI__.core.invoke;

  for (const name of WIDGET_NAMES) {
    try {
      modules[name] = (await import(`./widgets/${name}.js`)).default;
    } catch (err) {
      console.error(`divebar settings: failed to load widget "${name}"`, err);
    }
  }

  state = await invoke("get_config");
  state.widgets ??= [];
  state.bar ??= {};
  render();
}

init().catch((err) => {
  console.error("divebar settings: init failed", err);
  render();
  setStatus(`Failed to load settings: ${err}`, "error");
});

window.addEventListener("unhandledrejection", (e) =>
  setStatus(`Error: ${e.reason}`, "error"),
);
window.addEventListener("error", (e) => setStatus(`Error: ${e.message}`, "error"));
