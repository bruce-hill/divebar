// Screen brightness widget: SVG sun acting as a radial indicator — the
// rays illuminate clockwise from the top as brightness increases (each ray
// fades in across its share of the range). Clicking the chip opens a
// pop-down slider. Hides itself when no backlight device exists.

import { createSliderPopup } from "../lib/slider-popup.js";
import {
  METER_SETTINGS,
  meterValueCss,
  makePeek,
  makeValueTicker,
  segmentFill,
} from "../lib/meter.js";

const RAY_COUNT = 8;
const RAY_INNER = 6.8;
const RAY_OUTER = 10.4;

export default {
  name: "brightness",
  css: `
    .widget-brightness { cursor: pointer; }
    ${meterValueCss("widget-brightness")}
  `,
  settings: METER_SETTINGS,
  create({ options, onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-brightness";
    el.classList.toggle("compact", !options.showPercent);
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round">
          <circle class="core" cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/>
          <g class="rays"></g>
        </svg>
      </span>
      <span class="value">--%</span>
    `;
    const raysEl = el.querySelector(".rays");
    const peek = makePeek(el);
    const ticker = makeValueTicker(el.querySelector(".value"));
    let lastPercent = null;

    // Rays ordered from the top, clockwise (screen coords: +angle is CW).
    const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
      const angle = -Math.PI / 2 + (i / RAY_COUNT) * 2 * Math.PI;
      const ray = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ray.setAttribute("x1", (12 + RAY_INNER * Math.cos(angle)).toFixed(2));
      ray.setAttribute("y1", (12 + RAY_INNER * Math.sin(angle)).toFixed(2));
      ray.setAttribute("x2", (12 + RAY_OUTER * Math.cos(angle)).toFixed(2));
      ray.setAttribute("y2", (12 + RAY_OUTER * Math.sin(angle)).toFixed(2));
      raysEl.appendChild(ray);
      return ray;
    });

    function render(brightness) {
      el.style.display = brightness ? "" : "none";
      if (!brightness) return;
      const changed =
        lastPercent !== null && brightness.percent !== lastPercent;
      lastPercent = brightness.percent;
      if (changed && !options.showPercent && options.peekOnChange) peek.show();
      ticker.update(brightness.percent, changed);
      el.title = `Brightness: ${brightness.percent}%`;
      popup.setValue(brightness.percent);
      // Radial fill: the level sweeps clockwise through the rays.
      segmentFill(rays, brightness.percent, 0.3);
    }

    const popup = createSliderPopup({
      anchor: el,
      invoke,
      onChange: async (percent) => {
        try {
          render(await invoke("set_brightness", { percent }));
        } catch (err) {
          console.error("divebar: set_brightness failed", err);
        }
      },
    });

    el.addEventListener("click", () => popup.toggle());

    const unsubscribe = onStats((stats) => render(stats.brightness));
    return {
      el,
      destroy() {
        peek.cancel();
        popup.close();
        unsubscribe();
      },
    };
  },
};
