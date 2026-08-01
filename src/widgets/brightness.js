// Screen brightness widget: SVG sun acting as a radial indicator — the
// rays illuminate clockwise from the top as brightness increases (each ray
// fades in across its share of the range). Clicking the chip opens a
// pop-down slider. Hides itself when no backlight device exists.

import { createSliderPopup } from "../lib/slider-popup.js";

const RAY_COUNT = 8;
const RAY_INNER = 6.8;
const RAY_OUTER = 10.4;

export default {
  name: "brightness",
  css: `
    .widget-brightness { cursor: pointer; }
    .widget-brightness .value {
      width: 4ch; /* "100%" */
      text-align: left;
      overflow: hidden;
      transition: width 200ms ease, opacity 200ms ease, margin-left 200ms ease;
    }
    /* Collapsed: zero width plus a negative margin to cancel the chip gap */
    .widget-brightness.compact .value {
      width: 0;
      opacity: 0;
      margin-left: -5px;
    }
  `,
  settings: [
    { key: "showPercent", label: "Show percent", type: "boolean", default: false },
    {
      key: "peekOnChange",
      label: "Show percent briefly on change",
      type: "boolean",
      default: true,
    },
  ],
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
    const coreEl = el.querySelector(".core");
    const raysEl = el.querySelector(".rays");
    const valueEl = el.querySelector(".value");
    let peekTimer = null;
    let lastPercent = null;
    let lastShownPercent = null;

    // Temporarily reveal the percentage after a change, then re-collapse.
    function peek() {
      el.classList.remove("compact");
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        el.classList.add("compact");
        peekTimer = null;
      }, 2500);
    }

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
      if (changed && !options.showPercent && options.peekOnChange) peek();
      if (changed) {
        const up = brightness.percent > lastShownPercent;
        valueEl.animate(
          [
            { opacity: 0.3, transform: `translateY(${up ? 5 : -5}px)` },
            { opacity: 1, transform: "none" },
          ],
          { duration: 90, easing: "ease-out" },
        );
      }
      lastShownPercent = brightness.percent;
      valueEl.textContent = `${brightness.percent}%`;
      el.title = `Brightness: ${brightness.percent}%`;
      popup.setValue(brightness.percent);
      // Radial fill: each ray owns a slice of the range and fades in as
      // the level sweeps clockwise through it.
      const slice = 100 / RAY_COUNT;
      rays.forEach((ray, i) => {
        const t = Math.min(1, Math.max(0, (brightness.percent - i * slice) / slice));
        ray.style.opacity = (0.3 + 0.7 * t).toFixed(3);
      });
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
        if (peekTimer) clearTimeout(peekTimer);
        popup.close();
        unsubscribe();
      },
    };
  },
};
