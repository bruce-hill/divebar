// Settings window: bar-level settings (height, padding, accent, font)
// plus a hand-off button to the bar's in-place layout editor — widget
// arrangement and per-widget settings live on the bar itself (drag in
// edit mode, right-click a widget). Every change saves and applies to
// the real bar immediately.

import { BAR_SETTINGS } from "./lib/bar-config.js";
import { renderSettingsRows } from "./lib/settings-form.js";

let state = { widgets: [] };
let invoke = null;

const statusEl = document.getElementById("status");
const sectionsEl = document.getElementById("sections");

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

// --- Helpers ---------------------------------------------------------------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// --- Sections --------------------------------------------------------------

function barSection() {
  const section = el("section");
  section.append(el("h2", "", "Bar"));
  const panel = el("div", "panel");
  const options = (state.bar ??= {});
  renderSettingsRows(panel, {
    schemas: BAR_SETTINGS,
    options,
    invoke,
    onChange(key, value) {
      options[key] = value;
      scheduleSave();
    },
  });
  section.append(panel);
  return section;
}

function widgetsSection() {
  const section = el("section");
  section.append(el("h2", "", "Widgets"));
  const panel = el("div", "panel");
  panel.append(
    el(
      "p",
      "hint",
      "Widgets are arranged on the bar itself: edit mode lets you drag " +
        "them around, add, and remove; right-click any widget to change " +
        "its settings.",
    ),
  );
  const btn = el("button", "", "Edit bar layout…");
  btn.addEventListener("click", async () => {
    try {
      await window.__TAURI__.event.emit("divebar://edit-layout");
      await invoke("close_settings");
    } catch (err) {
      setStatus(`Edit layout failed: ${err}`, "error");
    }
  });
  panel.append(btn);
  section.append(panel);
  return section;
}

// --- Render + init ---------------------------------------------------------

function render() {
  sectionsEl.replaceChildren(barSection(), widgetsSection());
}

document.getElementById("close").addEventListener("click", () => {
  window.__TAURI__?.core
    ?.invoke("close_settings")
    .catch((err) => setStatus(`Close failed: ${err}`, "error"));
});

document.getElementById("reset").addEventListener("click", async () => {
  try {
    state = await invoke("get_default_config");
    render();
    scheduleSave();
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
  state = await invoke("get_config");
  state.widgets ??= [];
  state.bar ??= {};
  // The bar window saves configs too (layout editor, right-click widget
  // settings). Adopt its widget changes so a later save from here
  // doesn't clobber them; bar-level settings are only edited here.
  window.__TAURI__.event.listen("divebar://config", (event) => {
    if (event.payload?.widgets) state.widgets = event.payload.widgets;
  });
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
