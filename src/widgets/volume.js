// Volume widget: SVG speaker whose sound waves fade in proportionally to
// the level (inner wave over 0-50%, outer over 50-100%); an X replaces the
// waves when muted. Clicking the chip opens a pop-down slider; clicking the
// icon itself toggles mute.

import { createSliderPopup } from "../lib/slider-popup.js";

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export default {
  name: "volume",
  css: `
    .widget-volume { cursor: pointer; }
    .widget-volume .value { width: 4ch; text-align: left; } /* "100%" */
    .widget-volume.compact .value { display: none; }
    .widget-volume.muted .value,
    .widget-volume.muted .icon { color: var(--bar-fg-dim); }
    .widget-volume.muted .value { text-decoration: line-through; }
  `,
  settings: [
    { key: "showPercent", label: "Show percent", type: "boolean", default: false },
  ],
  create({ options, onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-volume";
    el.classList.toggle("compact", !options.showPercent);
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z"
                fill="currentColor" stroke="none"/>
          <path class="wave1" d="M15 9.2 Q17.4 12 15 14.8"/>
          <path class="wave2" d="M17.2 6.8 Q21.2 12 17.2 17.2"/>
          <g class="mute" style="display: none">
            <path d="M15.5 9.5 L20.5 14.5 M20.5 9.5 L15.5 14.5"/>
          </g>
        </svg>
      </span>
      <span class="value">--%</span>
    `;
    const iconEl = el.querySelector(".icon");
    const wave1El = el.querySelector(".wave1");
    const wave2El = el.querySelector(".wave2");
    const muteEl = el.querySelector(".mute");
    const valueEl = el.querySelector(".value");

    function render(volume) {
      el.style.display = volume ? "" : "none";
      if (!volume) return;
      valueEl.textContent = `${volume.percent}%`;
      el.title = volume.muted ? `Volume: muted` : `Volume: ${volume.percent}%`;
      popup.setValue(volume.percent);
      el.classList.toggle("muted", volume.muted);
      muteEl.style.display = volume.muted ? "" : "none";
      const showWaves = !volume.muted;
      wave1El.style.opacity = showWaves
        ? 0.15 + 0.85 * clamp01(volume.percent / 50)
        : 0;
      wave2El.style.opacity = showWaves
        ? 0.15 + 0.85 * clamp01((volume.percent - 50) / 50)
        : 0;
    }

    const popup = createSliderPopup({
      anchor: el,
      invoke,
      onChange: async (percent) => {
        try {
          render(await invoke("set_volume", { percent }));
        } catch (err) {
          console.error("divebar: set_volume failed", err);
        }
      },
    });

    iconEl.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        render(await invoke("toggle_mute"));
      } catch (err) {
        console.error("divebar: toggle_mute failed", err);
      }
    });

    el.addEventListener("click", () => popup.toggle());

    const unsubscribe = onStats((stats) => render(stats.volume));
    return {
      el,
      destroy() {
        popup.close();
        unsubscribe();
      },
    };
  },
};
