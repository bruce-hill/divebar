// Shared pop-down slider panel, used by the volume and brightness widgets.
// Renders in the transparent window space below the bar; opening/closing
// tells the backend to widen/shrink the X11 input region accordingly
// (via the set_popup_open command), so the popup area is only interactive
// while a popup is visible.

import { popupWillOpen, popupDidClose } from "./popup-state.js";

const CSS = `
  .dpopup {
    position: fixed;
    top: calc(var(--bar-height) + 8px);
    width: 260px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--bar-bg);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    font-family: var(--font);
    z-index: 10;
  }
  .dpopup input[type="range"] {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 6px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.18);
    outline: none;
  }
  .dpopup input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
  }
  .dpopup .dpopup-value {
    font-family: var(--font-mono);
    font-size: 17px;
    width: 4ch;
    text-align: right;
    color: var(--bar-fg);
    font-variant-numeric: tabular-nums;
  }
  .dpopup .dpopup-lead {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: var(--bar-fg);
    cursor: pointer;
    padding: 4px;
    border-radius: 8px;
  }
  .dpopup .dpopup-lead:hover { background: var(--chip-bg-hover); }
  .dpopup .dpopup-lead svg {
    display: block;
    width: calc(var(--icon-size) * 0.95);
    height: calc(var(--icon-size) * 0.95);
  }
  /* Shaped (compositor-less) windows: no soft shadow, flush under the bar,
     and only the bottom corners rounded — mirrored by the X11 shape the
     backend builds (radius must match set_popup_open's). */
  :root.no-compositor .dpopup {
    border-radius: 0 0 14px 14px;
    box-shadow: none;
    top: var(--bar-height);
  }
`;

const THROTTLE_MS = 80;

let stylesInjected = false;

// createLeading (optional): called on each open; returns an element placed
// before the slider (e.g. a mute toggle button).
export function createSliderPopup({ anchor, invoke, onChange, createLeading }) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "slider-popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let popupEl = null;
  let sliderEl = null;
  let valueEl = null;
  let lastValue = 0;
  let dragging = false;

  // Throttle slider changes so dragging doesn't flood the backend.
  let throttleTimer = null;
  let queuedValue = null;
  function emit(value) {
    if (throttleTimer) {
      queuedValue = value;
      return;
    }
    onChange(value);
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      if (queuedValue !== null) {
        const v = queuedValue;
        queuedValue = null;
        emit(v);
      }
    }, THROTTLE_MS);
  }

  function onDocPointerDown(e) {
    if (!popupEl.contains(e.target) && !anchor.contains(e.target)) close();
  }

  // Close when the pointer wanders away from both the popup and its anchor.
  // This is the main close path without a compositor, where clicks outside
  // the shaped window go to other applications and never reach us.
  let leaveTimer = null;
  const disarmClose = () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  const armClose = () => {
    disarmClose();
    leaveTimer = setTimeout(() => {
      if (!dragging) close();
      else armClose();
    }, 700);
  };

  function open() {
    if (popupEl) return;
    popupWillOpen(close);

    popupEl = document.createElement("div");
    popupEl.className = "dpopup";
    sliderEl = document.createElement("input");
    sliderEl.type = "range";
    sliderEl.min = "0";
    sliderEl.max = "100";
    sliderEl.step = "1";
    sliderEl.value = lastValue;
    valueEl = document.createElement("span");
    valueEl.className = "dpopup-value";
    valueEl.textContent = `${lastValue}%`;
    if (createLeading) {
      const lead = createLeading();
      lead.classList.add("dpopup-lead");
      popupEl.append(lead);
    }
    popupEl.append(sliderEl, valueEl);
    document.body.appendChild(popupEl);
    popupEl.animate(
      [
        { opacity: 0, transform: "translateY(-8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 150, easing: "ease-out" },
    );

    // Center under the anchor, clamped to the screen edges.
    const rect = anchor.getBoundingClientRect();
    const width = popupEl.offsetWidth;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    popupEl.style.left = `${left}px`;

    sliderEl.addEventListener("pointerdown", () => (dragging = true));
    sliderEl.addEventListener("pointerup", () => (dragging = false));
    sliderEl.addEventListener("input", () => {
      const value = Number(sliderEl.value);
      valueEl.textContent = `${value}%`;
      emit(value);
    });
    document.addEventListener("pointerdown", onDocPointerDown, true);
    popupEl.addEventListener("pointerenter", disarmClose);
    popupEl.addEventListener("pointerleave", armClose);
    anchor.addEventListener("pointerenter", disarmClose);
    anchor.addEventListener("pointerleave", armClose);

    const r = popupEl.getBoundingClientRect();
    invoke("set_popup_open", {
      open: true,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    }).catch((err) => console.error("divebar: set_popup_open failed", err));
  }

  function close() {
    if (!popupEl) return;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    anchor.removeEventListener("pointerenter", disarmClose);
    anchor.removeEventListener("pointerleave", armClose);
    disarmClose();
    const closingEl = popupEl;
    popupEl = sliderEl = valueEl = null;
    dragging = false;
    popupDidClose(close);
    const anim = closingEl.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-6px)" },
      ],
      { duration: 110, easing: "ease-in" },
    );
    anim.onfinish = () => closingEl.remove();
    invoke("set_popup_open", { open: false, rect: null }).catch((err) =>
      console.error("divebar: set_popup_open failed", err),
    );
  }

  const api = {
    open,
    close,
    toggle: () => (popupEl ? close() : open()),
    // Keeps the slider in sync with external changes (media keys etc.)
    // without fighting an in-progress drag.
    setValue(value) {
      lastValue = value;
      if (sliderEl && !dragging) {
        sliderEl.value = value;
        valueEl.textContent = `${value}%`;
      }
    },
  };
  return api;
}
