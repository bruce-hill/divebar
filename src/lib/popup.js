// Pop-down popup panels (sliders, menus, calendar). One module owns the
// whole popup lifecycle: panel chrome, positioning, animation, dismissal
// (click-outside + pointer-leave timer), the at-most-one-open coordinator,
// and the backend X11 shape. Callers supply only their body via render().
//
//   const popup = createPopup({ anchor, invoke, className, render });
//   popup.toggle();               // args are forwarded to render()
//   popup.refreshShape();         // call after content changes size

import { popupWillOpen, popupDidClose } from "./popup-state.js";
import { centerUnder, animateIn, animateOut, sendShape, clearShape } from "./panel.js";

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
// centered-under-the-anchor placement; re-run when the content resizes.
// onClose (optional): runs whenever the popup closes, by any path —
// for callers whose state must outlive a single open/close cycle.
export function createPopup({
  anchor,
  invoke,
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
  let sizeObserver = null;

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
    popupWillOpen(close);

    el = document.createElement("div");
    el.className = `dpanel ${className}`;
    render(el, ...args);
    document.body.appendChild(el);
    animateIn(el);
    const position = (target) => {
      if (place) place(target);
      else if (anchor.isConnected) centerUnder(target, anchor);
    };
    position(el);

    document.addEventListener("pointerdown", onDocDown, true);
    el.addEventListener("pointerenter", disarm);
    el.addEventListener("pointerleave", arm);
    anchor.addEventListener("pointerenter", disarm);
    anchor.addEventListener("pointerleave", arm);

    sendShape(invoke, el);

    // Content that arrives after open (async status lines, font lists,
    // expanding submenus) resizes the popup; keep its position and the
    // backend window shape in sync or the new extent renders clipped.
    const opened = el;
    sizeObserver = new ResizeObserver(() => {
      position(opened);
      sendShape(invoke, opened);
    });
    sizeObserver.observe(el);
  }

  function close() {
    if (!el) return;
    disarm();
    sizeObserver?.disconnect();
    sizeObserver = null;
    document.removeEventListener("pointerdown", onDocDown, true);
    anchor.removeEventListener("pointerenter", disarm);
    anchor.removeEventListener("pointerleave", arm);
    const closingEl = el;
    el = null;
    popupDidClose(close);
    animateOut(closingEl);
    clearShape(invoke);
    onClose?.();
  }

  return {
    open,
    close,
    toggle: (...args) => (el ? close() : open(...args)),
    isOpen: () => el !== null,
    refreshShape: () => {
      if (el) sendShape(invoke, el);
    },
  };
}
