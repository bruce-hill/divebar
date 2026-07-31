// divebar bootstrap: loads the widget config, dynamically imports each
// widget module, injects its CSS, and mounts it into its zone.
//
// Widget contract — each module in ./widgets/ default-exports:
//   {
//     name: string,            // unique id, matches the filename
//     css: string,             // widget-scoped CSS, injected once
//     create(ctx): { el, destroy? }
//   }
// where ctx = { options, onStats(cb), onEvent(name, cb), invoke, listen }
// (onStats/onEvent return an unsubscribe fn and replay the latest payload).

import config from "./config.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

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
    listen(name, (event) => {
      store.latest = event.payload;
      for (const sub of store.subscribers) sub(store.latest);
    });
  }
  store.subscribers.add(cb);
  if (store.latest !== null) cb(store.latest);
  return () => store.subscribers.delete(cb);
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

async function mountWidget(zoneEl, { widget: name, options = {} }) {
  try {
    const module = await import(`./widgets/${name}.js`);
    const widget = module.default;
    injectCss(widget.name, widget.css);
    const instance = widget.create({ options, onStats, onEvent, invoke, listen });
    if (instance?.el) zoneEl.appendChild(instance.el);
  } catch (err) {
    console.error(`divebar: failed to mount widget "${name}"`, err);
  }
}

for (const [zone, entries] of Object.entries(config)) {
  const zoneEl = document.getElementById(`zone-${zone}`);
  if (!zoneEl) continue;
  // Mount sequentially within a zone so widget order matches the config.
  (async () => {
    for (const entry of entries) await mountWidget(zoneEl, entry);
  })();
}
