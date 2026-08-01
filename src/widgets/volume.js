// Volume widget: SVG speaker whose sound waves fade in proportionally to
// the level (inner wave over 0-50%, outer over 50-100%); an X replaces the
// waves when muted. Clicking the chip opens a pop-down slider; the slider
// has a speaker button that toggles mute.

import { createSliderPopup } from "../lib/slider-popup.js";

const clamp01 = (x) => Math.min(1, Math.max(0, x));

const SPEAKER_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z"
          fill="currentColor" stroke="none"/>
    <path class="wave1" d="M14.5 10 Q16.2 12 14.5 14"/>
    <path class="wave2" d="M16.3 8.5 Q19 12 16.3 15.5"/>
    <path class="wave3" d="M18.1 7 Q21.8 12 18.1 17"/>
    <g class="mute" style="display: none">
      <path d="M15.5 9.5 L20.5 14.5 M20.5 9.5 L15.5 14.5"/>
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
  // Each wave covers a third of the range and fades in across it.
  waves.forEach((wave, i) => {
    wave.style.opacity = volume.muted
      ? 0
      : 0.15 + 0.85 * clamp01((volume.percent - i * 33.4) / 33.4);
  });
}

export default {
  name: "volume",
  css: `
    .widget-volume { cursor: pointer; }
    .widget-volume .value {
      width: 4ch; /* "100%" */
      text-align: left;
      overflow: hidden;
      transition: width 200ms ease, opacity 200ms ease, margin-left 200ms ease;
    }
    /* Collapsed: zero width plus a negative margin to cancel the chip gap */
    .widget-volume.compact .value {
      width: 0;
      opacity: 0;
      margin-left: -5px;
    }
    .widget-volume.muted .value,
    .widget-volume.muted .icon { color: var(--bar-fg-dim); }
    .widget-volume.muted .value { text-decoration: line-through; }
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
    el.className = "chip clickable widget-volume";
    el.classList.toggle("compact", !options.showPercent);
    el.innerHTML = `
      <span class="icon">${SPEAKER_SVG}</span>
      <span class="value">--%</span>
    `;
    const iconEl = el.querySelector(".icon");
    const valueEl = el.querySelector(".value");
    let leadBtn = null;
    let peekTimer = null;
    let lastPercent = null;
    let lastMuted = null;

    // Temporarily reveal the percentage after a change, then re-collapse.
    function peek() {
      el.classList.remove("compact");
      if (peekTimer) clearTimeout(peekTimer);
      peekTimer = setTimeout(() => {
        el.classList.add("compact");
        peekTimer = null;
      }, 2500);
    }

    function render(volume) {
      el.style.display = volume ? "" : "none";
      if (!volume) return;
      const changed =
        lastPercent !== null &&
        (volume.percent !== lastPercent || volume.muted !== lastMuted);
      lastPercent = volume.percent;
      lastMuted = volume.muted;
      if (changed && !options.showPercent && options.peekOnChange) peek();
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
      invoke,
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
        if (peekTimer) clearTimeout(peekTimer);
        popup.close();
        unsubscribe();
      },
    };
  },
};
