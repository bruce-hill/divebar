// Screen brightness widget: SVG sun whose core radius, ray length, and ray
// opacity all scale continuously with the brightness level. Clicking the
// chip opens a pop-down slider. Hides itself when no backlight device
// exists.

import { createSliderPopup } from "../lib/slider-popup.js";

const RAY_COUNT = 8;
const RAY_INNER = 6.8; // rays start here...
const RAY_OUTER_MIN = 8.0; // ...and end between these two radii
const RAY_OUTER_MAX = 10.8;

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

    // Temporarily reveal the percentage after a change, then re-collapse.
    function peek() {
      el.classList.remove("compact");
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        el.classList.add("compact");
        peekTimer = null;
      }, 2500);
    }

    const rays = Array.from({ length: RAY_COUNT }, (_, i) => {
      const angle = (i / RAY_COUNT) * 2 * Math.PI;
      const ray = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ray.setAttribute("x1", (12 + RAY_INNER * Math.cos(angle)).toFixed(2));
      ray.setAttribute("y1", (12 + RAY_INNER * Math.sin(angle)).toFixed(2));
      raysEl.appendChild(ray);
      return { ray, angle };
    });

    function render(brightness) {
      el.style.display = brightness ? "" : "none";
      if (!brightness) return;
      const changed =
        lastPercent !== null && brightness.percent !== lastPercent;
      lastPercent = brightness.percent;
      if (changed && !options.showPercent && options.peekOnChange) peek();
      const t = brightness.percent / 100;
      valueEl.textContent = `${brightness.percent}%`;
      el.title = `Brightness: ${brightness.percent}%`;
      popup.setValue(brightness.percent);
      coreEl.setAttribute("r", (3.0 + 1.4 * t).toFixed(2));
      const outer = RAY_OUTER_MIN + (RAY_OUTER_MAX - RAY_OUTER_MIN) * t;
      raysEl.style.opacity = 0.3 + 0.7 * t;
      for (const { ray, angle } of rays) {
        ray.setAttribute("x2", (12 + outer * Math.cos(angle)).toFixed(2));
        ray.setAttribute("y2", (12 + outer * Math.sin(angle)).toFixed(2));
      }
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
