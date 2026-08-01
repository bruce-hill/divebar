// divebar bootstrap: fetches the bar config from the backend, dynamically
// imports each widget module, injects its CSS, and mounts it into its zone.
// Re-renders live when the settings window saves a new config.
//
// Widget contract — each module in ./widgets/ default-exports:
//   {
//     name: string,            // unique id, matches the filename
//     css: string,             // widget-scoped CSS, injected once
//     settings: [ ... ],       // optional settings schema (see README)
//     create(ctx): { el, destroy? }
//   }
// where ctx = { options, onStats(cb), onEvent(name, cb), invoke, listen }
// (onStats/onEvent return an unsubscribe fn and replay the latest payload;
// options come pre-merged with the schema's defaults).

import { initTooltips } from "./lib/tooltip.js";
import { applyBarStyle } from "./lib/bar-config.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

initTooltips(invoke);

// Adapt styling to the environment: without a compositor, shaped windows
// can't have soft shadows or rounded transparent corners.
invoke("get_env")
  .then((env) => {
    if (!env.composited) {
      document.documentElement.classList.add("no-compositor");
    }
  })
  .catch((err) => console.error("divebar: get_env failed", err));

// --- Event stores ----------------------------------------------------------
// One subscription per backend event channel, fanned out to widgets. Caches
// the latest payload so widgets mounted after the first event still get data
// immediately.

const stores = new Map(); // event name -> { latest, subscribers }

function onEvent(name, cb) {
  let store = stores.get(name);
  if (!store) {
    store = { latest: null, subscribers: new Set() };
    stores.set(name, store);
    listen(name, (event) => dispatch(name, event.payload));
  }
  store.subscribers.add(cb);
  if (store.latest !== null) cb(store.latest);
  return () => store.subscribers.delete(cb);
}

function dispatch(name, payload, onlyIfEmpty = false) {
  const store = stores.get(name);
  if (!store || payload == null) return;
  if (onlyIfEmpty && store.latest !== null) return;
  store.latest = payload;
  for (const sub of store.subscribers) sub(store.latest);
}

const onStats = (cb) => onEvent("divebar://stats", cb);

// --- Widget registry -------------------------------------------------------

const injectedCss = new Set();

function injectCss(name, css) {
  if (!css || injectedCss.has(name)) return;
  injectedCss.add(name);
  const style = document.createElement("style");
  style.dataset.widget = name;
  style.textContent = css;
  document.head.appendChild(style);
}

function defaultOptions(widget) {
  const defaults = {};
  for (const setting of widget.settings ?? []) {
    defaults[setting.key] = setting.default;
  }
  return defaults;
}

let mounted = []; // [{ key, instance }] in bar order

async function createInstance({ widget: name, options = {} }) {
  try {
    const module = await import(`./widgets/${name}.js`);
    const widget = module.default;
    injectCss(widget.name, widget.css);
    const merged = { ...defaultOptions(widget), ...options };
    const instance = widget.create({
      options: merged,
      onStats,
      onEvent,
      invoke,
      listen,
    });
    return instance?.el ? instance : null;
  } catch (err) {
    console.error(`divebar: failed to mount widget "${name}"`, err);
    return null;
  }
}

// Diffs against the mounted widgets so unchanged ones keep their DOM,
// timers, and state — config saves don't blink the whole bar.
async function renderBar(config) {
  applyBarStyle(config);
  const barEl = document.getElementById("bar");
  const old = mounted;
  const usedOld = new Set();
  const next = [];

  for (const entry of config?.widgets ?? []) {
    const key = JSON.stringify(entry);
    const idx = old.findIndex((m, i) => !usedOld.has(i) && m.key === key);
    if (idx >= 0) {
      usedOld.add(idx);
      next.push(old[idx]);
    } else {
      const instance = await createInstance(entry);
      if (instance) next.push({ key, instance });
    }
  }

  for (let i = 0; i < old.length; i++) {
    if (usedOld.has(i)) continue;
    try {
      old[i].instance.destroy?.();
    } catch (err) {
      console.error("divebar: widget destroy failed", err);
    }
    old[i].instance.el.remove();
  }

  // appendChild moves already-mounted nodes, so this both orders and
  // inserts in one pass.
  for (const m of next) barEl.appendChild(m.instance.el);
  mounted = next;
}

invoke("get_config")
  .then(async (config) => {
    await renderBar(config);
    // Initial backend emits happen before this page loads and are lost;
    // pull the cached states so widgets aren't blank until the next real
    // event. Per channel, skipped if a live event already arrived.
    const states = await invoke("get_latest_states");
    for (const [channel, payload] of Object.entries(states)) {
      dispatch(`divebar://${channel}`, payload, true);
    }
  })
  .catch((err) => console.error("divebar: startup failed", err));

// Live-apply config saved from the settings window.
listen("divebar://config", (event) => renderBar(event.payload));

// Right-click anywhere on the bar opens settings.
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  invoke("open_settings").catch((err) =>
    console.error("divebar: open_settings failed", err),
  );
});
