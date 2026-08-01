// Shared pieces for percent-meter chips (volume, brightness): the
// collapsible percentage value, the peek-on-change reveal, the value
// ticker animation, and the segmented icon fill. Widgets compose these
// in their own create() — see volume.js and brightness.js.

export const METER_SETTINGS = [
  { key: "showPercent", label: "Show percent", type: "boolean", default: false },
  {
    key: "peekOnChange",
    label: "Show percent briefly on change",
    type: "boolean",
    default: true,
  },
];

// The collapsible "100%" value: fixed 4ch when shown, zero-width when
// the chip has the "compact" class.
export function meterValueCss(widgetClass) {
  return `
    .${widgetClass} .value {
      width: 4ch; /* "100%" */
      text-align: left;
      overflow: hidden;
      transition: width 200ms ease, opacity 200ms ease, margin-left 200ms ease;
    }
    /* Collapsed: zero width plus a negative margin to cancel the chip gap */
    .${widgetClass}.compact .value {
      width: 0;
      opacity: 0;
      margin-left: -5px;
    }
  `;
}

// Temporarily reveal the percentage after a change, then re-collapse.
// cancel() in the widget's destroy so the timer doesn't outlive the chip.
export function makePeek(el, ms = 2500) {
  let timer = null;
  return {
    show() {
      el.classList.remove("compact");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        el.classList.add("compact");
        timer = null;
      }, ms);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

// Nudges the value text up/down as it changes direction-aware.
export function makeValueTicker(valueEl) {
  let lastShown = null;
  return {
    update(percent, changed) {
      const text = `${percent}%`;
      if (changed && valueEl.textContent !== text) {
        const up = percent > (lastShown ?? percent);
        valueEl.animate(
          [
            { opacity: 0.3, transform: `translateY(${up ? 5 : -5}px)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 90, easing: "ease-out" },
        );
      }
      lastShown = percent;
      valueEl.textContent = text;
    },
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));

// Proportional icon fill: each element owns an equal slice of 0–100 and
// fades from minOpacity to full as the value sweeps through its slice.
export function segmentFill(els, percent, minOpacity) {
  const slice = 100 / els.length;
  els.forEach((el, i) => {
    const t = clamp01((percent - i * slice) / slice);
    el.style.opacity = (minOpacity + (1 - minOpacity) * t).toFixed(3);
  });
}
