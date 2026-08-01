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

// Derive all sizing (chip height, font, icons) from the configured bar
// height and padding, so widgets scale with the available space.
function applyBarStyle(config) {
  const bar = config?.bar ?? {};
  const height = bar.height ?? 48;
  const padX = bar.paddingX ?? 10;
  const padY = bar.paddingY ?? 6;
  const chip = Math.max(14, height - 2 * padY);
  const root = document.documentElement.style;
  root.setProperty("--bar-height", `${height}px`);
  root.setProperty("--bar-pad-x", `${padX}px`);
  root.setProperty("--bar-pad-y", `${padY}px`);
  root.setProperty("--chip-height", `${chip}px`);
  root.setProperty("--chip-radius", `${chip / 2}px`);
  root.setProperty("--bar-font", `${Math.round(chip * 0.55)}px`);
  root.setProperty("--icon-size", `${Math.round(chip * 0.88)}px`);
}

let mounted = []; // [{ el, destroy? }] of live widget instances

async function mountWidget(zoneEl, { widget: name, options = {} }) {
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
    if (instance?.el) {
      zoneEl.appendChild(instance.el);
      mounted.push(instance);
    }
  } catch (err) {
    console.error(`divebar: failed to mount widget "${name}"`, err);
  }
}

async function renderBar(config) {
  applyBarStyle(config);
  for (const instance of mounted) {
    try {
      instance.destroy?.();
    } catch (err) {
      console.error("divebar: widget destroy failed", err);
    }
    instance.el?.remove();
  }
  mounted = [];
  const barEl = document.getElementById("bar");
  // Mount sequentially so widget order matches the config.
  for (const entry of config?.widgets ?? []) {
    await mountWidget(barEl, entry);
  }
}

invoke("get_config")
  .then(async (config) => {
    await renderBar(config);
    // The watcher's initial emit happens before this page loads and is
    // lost; pull the cached state so widgets aren't blank until the next
    // real WM event. Skipped if a live event already arrived.
    const cached = await invoke("get_hlwm_state");
    dispatch("divebar://hlwm", cached, true);
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
