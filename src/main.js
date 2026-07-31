// divebar bootstrap: loads the widget config, dynamically imports each
// widget module, injects its CSS, and mounts it into its zone.
//
// Widget contract — each module in ./widgets/ default-exports:
//   {
//     name: string,            // unique id, matches the filename
//     css: string,             // widget-scoped CSS, injected once
//     create(ctx): { el, destroy? }
//   }
// where ctx = { options, onStats(cb) => unsubscribe, invoke, listen }.

import config from "./config.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// --- Stats store -----------------------------------------------------------
// Single subscription to the backend's stats event, fanned out to widgets.
// Caches the latest payload so widgets mounted after the first event still
// get data immediately.

let latestStats = null;
const statsSubscribers = new Set();

listen("divebar://stats", (event) => {
  latestStats = event.payload;
  for (const cb of statsSubscribers) cb(latestStats);
});

function onStats(cb) {
  statsSubscribers.add(cb);
  if (latestStats !== null) cb(latestStats);
  return () => statsSubscribers.delete(cb);
}

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
    const instance = widget.create({ options, onStats, invoke, listen });
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
