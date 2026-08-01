// Battery widget: SVG battery whose fill width tracks the exact charge
// percent; a bolt overlay appears while charging. Hides itself entirely on
// machines with no battery (stats.battery is null).

// Interior fill geometry: the body rect is x=1.5..34.5, the fill inset to
// x=3.7..32.3, so full charge is 28.6 units wide.
const FILL_X = 3.7;
const FILL_MAX_WIDTH = 28.6;

export default {
  name: "battery",
  css: `
    .widget-battery { display: none; }
    .widget-battery .value { width: 4ch; text-align: left; } /* "100%" */
    .widget-battery.compact .value { display: none; }
    /* Wide battery so the fill level reads accurately at a glance */
    .widget-battery .icon svg {
      width: calc(var(--icon-size) * 5 / 3);
      height: var(--icon-size);
    }
    .widget-battery.present { display: flex; }
    .widget-battery.charging .icon { color: var(--accent); }
    /* Highlight sweeping across the fill while charging */
    .widget-battery .shimmer { display: none; }
    .widget-battery.charging .shimmer {
      display: block;
      animation: divebar-bat-shimmer 2.2s linear infinite;
    }
    @keyframes divebar-bat-shimmer {
      from { transform: translateX(0); }
      to   { transform: translateX(52px); }
    }
    .widget-battery.low .icon,
    .widget-battery.low .value { color: var(--critical); }
  `,
  settings: [
    { key: "showPercent", label: "Show percent", type: "boolean", default: false },
    {
      key: "lowThreshold",
      label: "Low battery threshold (%)",
      type: "number",
      min: 5,
      max: 50,
      default: 15,
    },
  ],
  create({ options, onStats }) {
    const el = document.createElement("div");
    el.className = "chip widget-battery";
    el.classList.toggle("compact", !options.showPercent);
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <defs>
            <clipPath id="divebar-bat-clip">
              <rect class="clip" x="${FILL_X}" y="7.2" width="0" height="9.6" rx="1.4"/>
            </clipPath>
            <linearGradient id="divebar-bat-shine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stop-color="#fff" stop-opacity="0"/>
              <stop offset="0.5" stop-color="#fff" stop-opacity="0.45"/>
              <stop offset="1" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <rect x="1.5" y="5" width="33" height="14" rx="3"/>
          <rect x="35.5" y="9" width="3" height="6" rx="1.2" fill="currentColor" stroke="none"/>
          <rect class="fill" x="${FILL_X}" y="7.2" width="0" height="9.6" rx="1.4"
                fill="currentColor" stroke="none"/>
          <g clip-path="url(#divebar-bat-clip)">
            <rect class="shimmer" x="-10" y="7.2" width="9" height="9.6"
                  fill="url(#divebar-bat-shine)" stroke="none"/>
          </g>
          <path class="bolt" d="M20.5 6 L14 13.4 h4.2 l-2.2 4.6 6.5-7.4 h-4.2 z"
                fill="var(--bar-bg)" stroke="currentColor" stroke-width="1"
                stroke-linejoin="round" style="display: none"/>
        </svg>
      </span>
      <span class="value">--%</span>
    `;
    const fillEl = el.querySelector(".fill");
    const clipEl = el.querySelector(".clip");
    const boltEl = el.querySelector(".bolt");
    const valueEl = el.querySelector(".value");

    const unsubscribe = onStats((stats) => {
      const battery = stats.battery;
      el.classList.toggle("present", battery != null);
      if (battery == null) return;
      valueEl.textContent = `${battery.percent}%`;
      let title = `Battery: ${battery.percent}%${battery.charging ? " (charging)" : ""}`;
      const mins = battery.timeRemainingMinutes;
      if (mins != null) {
        const t = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
        title += battery.charging ? ` · ${t} until full` : ` · ${t} remaining`;
      }
      el.title = title;
      const fillWidth = ((battery.percent / 100) * FILL_MAX_WIDTH).toFixed(2);
      fillEl.setAttribute("width", fillWidth);
      clipEl.setAttribute("width", fillWidth);
      // Continuous green (100%) → yellow (50%) → red (0%) via HSL hue,
      // kept low-saturation so the chip doesn't pull the eye.
      fillEl.setAttribute("fill", `hsl(${1.2 * battery.percent}, 30%, 55%)`);
      boltEl.style.display = battery.charging ? "" : "none";
      el.classList.toggle("charging", battery.charging);
      el.classList.toggle(
        "low",
        !battery.charging && battery.percent <= options.lowThreshold,
      );
    });

    return { el, destroy: unsubscribe };
  },
};
