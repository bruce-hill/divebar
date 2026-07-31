// Screen brightness widget: SVG sun whose core radius, ray length, and ray
// opacity all scale continuously with the brightness level. Scroll to
// adjust. Hides itself when no backlight device exists.

const SCROLL_STEP_PERCENT = 5;
const RAY_COUNT = 8;
const RAY_INNER = 6.8; // rays start here...
const RAY_OUTER_MIN = 8.0; // ...and end between these two radii
const RAY_OUTER_MAX = 10.8;

export default {
  name: "brightness",
  css: `
    .widget-brightness { cursor: ns-resize; }
    .widget-brightness .value { width: 4ch; text-align: left; } /* "100%" */
  `,
  create({ onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-brightness";
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
      const t = brightness.percent / 100;
      valueEl.textContent = `${brightness.percent}%`;
      coreEl.setAttribute("r", (3.0 + 1.4 * t).toFixed(2));
      const outer = RAY_OUTER_MIN + (RAY_OUTER_MAX - RAY_OUTER_MIN) * t;
      raysEl.style.opacity = 0.3 + 0.7 * t;
      for (const { ray, angle } of rays) {
        ray.setAttribute("x2", (12 + outer * Math.cos(angle)).toFixed(2));
        ray.setAttribute("y2", (12 + outer * Math.sin(angle)).toFixed(2));
      }
    }

    el.addEventListener("wheel", async (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? SCROLL_STEP_PERCENT : -SCROLL_STEP_PERCENT;
      try {
        render(await invoke("adjust_brightness", { deltaPercent: delta }));
      } catch (err) {
        console.error("divebar: adjust_brightness failed", err);
      }
    });

    const unsubscribe = onStats((stats) => render(stats.brightness));
    return { el, destroy: unsubscribe };
  },
};
