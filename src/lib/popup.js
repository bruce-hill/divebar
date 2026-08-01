// Pop-down popup panels (sliders, menus, calendar). One module owns the
// whole popup lifecycle: panel chrome, positioning, animation, and
// dismissal (click-outside + pointer-leave timer). The popup space itself
// — at-most-one-open and the backend X11 shape — is claimed from the
// Coordinator, which also keeps the shape synced when content resizes.
// Callers supply only their body via render().
//
//   const popup = createPopup({ anchor, className, render });
//   popup.toggle();               // args are forwarded to render()

import { claim, release } from "./coordinator.js";
import { centerUnder, animateIn, animateOut } from "./panel.js";

const CSS = `
  .dpanel {
    position: fixed;
    top: calc(var(--bar-height) + 8px);
    background: var(--bar-bg);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    font-family: var(--font);
    z-index: 10;
  }
  /* Shaped (compositor-less) windows: no soft shadow, flush under the bar,
     and only the bottom corners rounded — mirrored by the X11 shape the
     backend builds (radius must match set_popup_open's). */
  :root.no-compositor .dpanel {
    border-radius: 0 0 14px 14px;
    box-shadow: none;
    top: var(--bar-height);
  }
`;

let stylesInjected = false;

// holdOpen (optional): while it returns true, the pointer-leave timer
// re-arms instead of closing (e.g. mid-drag on a slider).
// place (optional): positions the panel, replacing the default
// centered-under-the-anchor placement; the Coordinator re-runs it
// whenever the content resizes.
// onClose (optional): runs whenever the popup closes, by any path —
// for callers whose state must outlive a single open/close cycle.
export function createPopup({
  anchor,
  className,
  render,
  holdOpen,
  leaveDelay = 900,
  place,
  onClose,
}) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let el = null;
  let spaceClaim = null;

  // Close when the pointer wanders away from both the popup and its anchor.
  // This is the main close path without a compositor, where clicks outside
  // the shaped window go to other applications and never reach us.
  let leaveTimer = null;
  const disarm = () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  const arm = () => {
    disarm();
    leaveTimer = setTimeout(() => {
      if (holdOpen?.()) arm();
      else close();
    }, leaveDelay);
  };

  function onDocDown(e) {
    if (!el.contains(e.target) && !anchor.contains(e.target)) close();
  }

  function open(...args) {
    if (el) return;

    el = document.createElement("div");
    el.className = `dpanel ${className}`;
    render(el, ...args);
    document.body.appendChild(el);
    animateIn(el);

    // A "popup" claim always wins: it evicts any open popup or tooltip.
    spaceClaim = claim({
      el,
      kind: "popup",
      place: (target) => {
        if (place) place(target);
        else if (anchor.isConnected) centerUnder(target, anchor);
      },
      onEvict: close,
    });

    document.addEventListener("pointerdown", onDocDown, true);
    el.addEventListener("pointerenter", disarm);
    el.addEventListener("pointerleave", arm);
    anchor.addEventListener("pointerenter", disarm);
    anchor.addEventListener("pointerleave", arm);
  }

  function close() {
    if (!el) return;
    disarm();
    document.removeEventListener("pointerdown", onDocDown, true);
    anchor.removeEventListener("pointerenter", disarm);
    anchor.removeEventListener("pointerleave", arm);
    const closingEl = el;
    el = null;
    const c = spaceClaim;
    spaceClaim = null;
    animateOut(closingEl);
    release(c); // no-op if this popup was evicted by a newer claim
    onClose?.();
  }

  return {
    open,
    close,
    toggle: (...args) => (el ? close() : open(...args)),
    isOpen: () => el !== null,
  };
}
