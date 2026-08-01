// Volume widget: SVG speaker whose sound waves fade in proportionally to
// the level; an X replaces the waves when muted. Clicking the chip opens
// a pop-down slider; the slider has a speaker button that toggles mute.

import { createSliderPopup } from "../lib/slider-popup.js";
import {
  METER_SETTINGS,
  meterValueCss,
  makePeek,
  segmentFill,
} from "../lib/meter.js";

const SPEAKER_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <!-- The artwork only spans ~13 of the 24 viewBox units; scale it up
         so the icon reads as large as the other widgets' icons. The
         scale also multiplies the stroke, hence 1.5 (≈1.8 rendered). -->
    <g transform="translate(12 12) scale(1.2) translate(-12 -12)">
      <path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z"
            fill="currentColor" stroke="none"/>
      <path class="wave1" d="M14.5 10 Q16.2 12 14.5 14"/>
      <path class="wave2" d="M16.3 8.5 Q19 12 16.3 15.5"/>
      <path class="wave3" d="M18.1 7 Q21.8 12 18.1 17"/>
      <g class="mute" style="display: none">
        <path d="M15.5 9.5 L20.5 14.5 M20.5 9.5 L15.5 14.5"/>
      </g>
    </g>
  </svg>
`;

// Updates any speaker SVG (chip icon or popup button) to match the state.
function paintSpeaker(root, volume) {
  const waves = [
    root.querySelector(".wave1"),
    root.querySelector(".wave2"),
    root.querySelector(".wave3"),
  ];
  const mute = root.querySelector(".mute");
  if (!waves[0]) return;
  mute.style.display = volume.muted ? "" : "none";
  if (volume.muted) waves.forEach((wave) => (wave.style.opacity = 0));
  else segmentFill(waves, volume.percent, 0.15);
}

export default {
  name: "volume",
  css: `
    .widget-volume { cursor: pointer; }
    ${meterValueCss("widget-volume")}
    .widget-volume.muted .value,
    .widget-volume.muted .icon { color: var(--bar-fg-dim); }
    .widget-volume.muted .value { text-decoration: line-through; }
  `,
  settings: METER_SETTINGS,
  create({ options, onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-volume";
    el.classList.toggle("compact", !options.showPercent);
    el.innerHTML = `
      <span class="icon">${SPEAKER_SVG}</span>
      <span class="value">--%</span>
    `;
    const iconEl = el.querySelector(".icon");
    const peek = makePeek(el);
    const valueEl = el.querySelector(".value");
    let leadBtn = null;
    let lastPercent = null;
    let lastMuted = null;

    function render(volume) {
      el.style.display = volume ? "" : "none";
      if (!volume) return;
      const changed =
        lastPercent !== null &&
        (volume.percent !== lastPercent || volume.muted !== lastMuted);
      lastPercent = volume.percent;
      lastMuted = volume.muted;
      if (changed && !options.showPercent && options.peekOnChange) peek.show();
      valueEl.textContent = `${volume.percent}%`;
      el.title = volume.muted ? `Volume: muted` : `Volume: ${volume.percent}%`;
      popup.setValue(volume.percent);
      el.classList.toggle("muted", volume.muted);
      paintSpeaker(iconEl, volume);
      if (leadBtn?.isConnected) {
        paintSpeaker(leadBtn, volume);
        leadBtn.style.color = volume.muted ? "var(--bar-fg-dim)" : "";
      }
      lastVolume = volume;
    }

    let lastVolume = null;

    const popup = createSliderPopup({
      anchor: el,
      onChange: async (percent) => {
        try {
          render(await invoke("set_volume", { percent }));
        } catch (err) {
          console.error("divebar: set_volume failed", err);
        }
      },
      createLeading: () => {
        leadBtn = document.createElement("button");
        leadBtn.title = "Toggle mute";
        leadBtn.innerHTML = SPEAKER_SVG;
        if (lastVolume) {
          paintSpeaker(leadBtn, lastVolume);
          leadBtn.style.color = lastVolume.muted ? "var(--bar-fg-dim)" : "";
        }
        leadBtn.addEventListener("click", async () => {
          try {
            render(await invoke("toggle_mute"));
          } catch (err) {
            console.error("divebar: toggle_mute failed", err);
          }
        });
        return leadBtn;
      },
    });

    el.addEventListener("click", () => popup.toggle());

    const unsubscribe = onStats((stats) => render(stats.volume));
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
