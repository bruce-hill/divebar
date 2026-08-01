// Screen brightness widget: SVG lightbulb acting as a radial indicator —
// rays illuminate speedometer-style, from bottom-left (0%) clockwise
// over the top to bottom-right (100%), each fading in across its share
// of the range; the screw base sits in the raysless bottom gap.
// Clicking the chip opens a pop-down slider. Hides itself when no
// backlight device exists.

import { createSliderPopup } from "../lib/slider-popup.js";
import {
  METER_SETTINGS,
  meterValueCss,
  makePeek,
  segmentFill,
} from "../lib/meter.js";

const RAY_COUNT = 8;
const RAY_INNER = 7.4;
const RAY_OUTER = 10.2;
// The bulb's glass center; rays radiate from here, and it sits high so
// the screw base fits below inside the viewBox.
const CX = 12;
const CY = 11.4;
// The 270° arc the rays sweep, leaving the bottom quarter to the base.
const RAY_START = (3 * Math.PI) / 4; // 135° = bottom-left
const RAY_SWEEP = (3 * Math.PI) / 2;

// Fills `root` with the lightbulb SVG and returns its ray elements,
// ordered along the sweep, endpoints included (screen coords: +angle is
// clockwise).
function buildBulb(root) {
  root.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round">
      <circle class="glass" cx="${CX}" cy="${CY}" r="4.2"
              fill="currentColor" stroke="none"/>
      <path class="screw" d="M10.3 16.7 H13.7 M10.8 18.2 H13.2"
            stroke-width="1.3"/>
      <g class="rays"></g>
    </svg>
  `;
  const raysEl = root.querySelector(".rays");
  return Array.from({ length: RAY_COUNT }, (_, i) => {
    const angle = RAY_START + (i / (RAY_COUNT - 1)) * RAY_SWEEP;
    const ray = document.createElementNS("http://www.w3.org/2000/svg", "line");
    ray.setAttribute("x1", (CX + RAY_INNER * Math.cos(angle)).toFixed(2));
    ray.setAttribute("y1", (CY + RAY_INNER * Math.sin(angle)).toFixed(2));
    ray.setAttribute("x2", (CX + RAY_OUTER * Math.cos(angle)).toFixed(2));
    ray.setAttribute("y2", (CY + RAY_OUTER * Math.sin(angle)).toFixed(2));
    raysEl.appendChild(ray);
    return ray;
  });
}

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
      <span class="icon"></span>
      <span class="value">--%</span>
    `;
    const rays = buildBulb(el.querySelector(".icon"));
    const peek = makePeek(el);
    const valueEl = el.querySelector(".value");
    let leadRays = null;
    let leadBtn = null;
    let lastPercent = null;

    function render(brightness) {
      el.style.display = brightness ? "" : "none";
      if (!brightness) return;
      const changed =
        lastPercent !== null && brightness.percent !== lastPercent;
      lastPercent = brightness.percent;
      if (changed && !options.showPercent && options.peekOnChange) peek.show();
      valueEl.textContent = `${brightness.percent}%`;
      el.title = `Brightness: ${brightness.percent}%`;
      popup.setValue(brightness.percent);
      // Radial fill: the level sweeps clockwise through the rays.
      segmentFill(rays, brightness.percent, 0.3);
      if (leadBtn?.isConnected) segmentFill(leadRays, brightness.percent, 0.3);
    }

    const popup = createSliderPopup({
      anchor: el,
      onChange: async (percent) => {
        try {
          render(await invoke("set_brightness", { percent }));
        } catch (err) {
          console.error("divebar: set_brightness failed", err);
        }
      },
      createLeading: () => {
        leadBtn = document.createElement("button");
        leadBtn.title = "Put display to sleep";
        leadRays = buildBulb(leadBtn);
        if (lastPercent !== null) segmentFill(leadRays, lastPercent, 0.3);
        leadBtn.addEventListener("click", async () => {
          popup.close();
          try {
            await invoke("display_off");
          } catch (err) {
            console.error("divebar: display_off failed", err);
          }
        });
        return leadBtn;
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
