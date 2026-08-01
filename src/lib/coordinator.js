// The Coordinator owns the popup space below the bar. Panels claim it and
// the Coordinator enforces at-most-one-open — the whole window has a single
// X11 shape — and makes every set_popup_open call: on claim, on element
// resize, and on release. Nothing else may talk to set_popup_open.
//
//   initCoordinator(invoke);                        // once, at startup
//   const c = claim({ el, kind, place, onEvict });  // null if denied
//   release(c);
//
// Priority: "popup" > "tooltip". A new claim evicts an equal or weaker
// holder (its onEvict runs, and its later release() becomes a no-op);
// a "tooltip" claim while a popup holds the space is denied.

let invoke = null;
let current = null; // the active claim, or null

const RANK = { tooltip: 0, popup: 1 };

export function initCoordinator(invokeFn) {
  invoke = invokeFn;
}

// place (optional): positions el; re-run before every shape sync so the
// panel and the backend shape never disagree.
// onEvict (optional): the participant's cleanup when a stronger or equal
// claim takes the space.
export function claim({ el, kind, place, onEvict }) {
  if (current && RANK[kind] < RANK[current.kind]) return null;
  if (current) {
    const evicted = current;
    current = null; // the evicted claim's release() is now a no-op
    evicted.observer.disconnect();
    evicted.onEvict?.();
  }

  const c = { el, kind, place, onEvict, observer: null };
  const sync = () => {
    c.place?.(el);
    sendShape(el);
  };
  sync();
  // Content that arrives or expands after the claim (async status lines,
  // submenus, live tooltip text) resizes the panel; keep its position and
  // the backend shape in sync or the new extent renders clipped.
  c.observer = new ResizeObserver(sync);
  c.observer.observe(el);
  current = c;
  return c;
}

export function release(c) {
  if (!c || current !== c) return; // evicted or stale claim
  current = null;
  c.observer.disconnect();
  clearShape();
}

function sendShape(el) {
  const r = el.getBoundingClientRect();
  invoke("set_popup_open", {
    open: true,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
  }).catch((err) => console.error("divebar: set_popup_open failed", err));
}

function clearShape() {
  invoke("set_popup_open", { open: false, rect: null }).catch((err) =>
    console.error("divebar: set_popup_open failed", err),
  );
}
