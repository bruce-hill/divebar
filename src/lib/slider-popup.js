// Pop-down slider panel, used by the volume and brightness widgets.
// Popup mechanics (positioning, dismissal, X11 shape) live in popup.js;
// this module supplies the slider body and change-throttling.

import { createPopup } from "./popup.js";

const CSS = `
  .dpopup {
    width: 260px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    gap: 14px;
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

  const popup = createPopup({
    anchor,
    invoke,
    className: "dpopup",
    leaveDelay: 700,
    holdOpen: () => dragging,
    render(el) {
      dragging = false;
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
        el.append(lead);
      }
      el.append(sliderEl, valueEl);

      sliderEl.addEventListener("pointerdown", () => (dragging = true));
      sliderEl.addEventListener("pointerup", () => (dragging = false));
      sliderEl.addEventListener("input", () => {
        const value = Number(sliderEl.value);
        valueEl.textContent = `${value}%`;
        emit(value);
      });
    },
  });

  return {
    open: popup.open,
    close: popup.close,
    toggle: popup.toggle,
    // Keeps the slider in sync with external changes (media keys etc.)
    // without fighting an in-progress drag.
    setValue(value) {
      lastValue = value;
      if (popup.isOpen() && !dragging) {
        sliderEl.value = value;
        valueEl.textContent = `${value}%`;
      }
    },
  };
}
