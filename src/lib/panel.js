// Shared mechanics for anything rendered in the popup space below the bar
// (popups and tooltips): centering under an anchor, open/close animation,
// and syncing the backend's X11 shape via set_popup_open. This is the one
// place that talks to set_popup_open.

export function centerUnder(el, anchor) {
  const rect = anchor.getBoundingClientRect();
  placeAtX(el, rect.left + rect.width / 2 - el.offsetWidth / 2);
}

// Positions el's left edge at x (context-menu style), clamped to the
// window edges.
export function placeAtX(el, x) {
  const left = Math.min(Math.max(8, x), window.innerWidth - el.offsetWidth - 8);
  el.style.left = `${left}px`;
}

export function animateIn(el, { dy = -8, duration = 150 } = {}) {
  el.animate(
    [
      { opacity: 0, transform: `translateY(${dy}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration, easing: "ease-out" },
  );
}

// Fades the element out and removes it from the DOM when done.
export function animateOut(el, { dy = -6, duration = 110 } = {}) {
  const anim = el.animate(
    [
      { opacity: 1, transform: "none" },
      { opacity: 0, transform: `translateY(${dy}px)` },
    ],
    { duration, easing: "ease-in" },
  );
  anim.onfinish = () => el.remove();
}

export function sendShape(invoke, el) {
  const r = el.getBoundingClientRect();
  invoke("set_popup_open", {
    open: true,
    rect: { x: r.x, y: r.y, width: r.width, height: r.height },
  }).catch((err) => console.error("divebar: set_popup_open failed", err));
}

export function clearShape(invoke) {
  invoke("set_popup_open", { open: false, rect: null }).catch((err) =>
    console.error("divebar: set_popup_open failed", err),
  );
}
