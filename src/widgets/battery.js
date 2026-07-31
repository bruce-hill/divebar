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
    /* Wide battery so the fill level reads accurately at a glance */
    .widget-battery .icon svg { width: 50px; height: 30px; }
    .widget-battery.present { display: flex; }
    .widget-battery.charging .icon { color: var(--accent); }
    .widget-battery.low .icon,
    .widget-battery.low .value { color: var(--critical); }
  `,
  settings: [
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
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="1.5" y="5" width="33" height="14" rx="3"/>
          <rect x="35.5" y="9" width="3" height="6" rx="1.2" fill="currentColor" stroke="none"/>
          <rect class="fill" x="${FILL_X}" y="7.2" width="0" height="9.6" rx="1.4"
                fill="currentColor" stroke="none"/>
          <path class="bolt" d="M20.5 6 L14 13.4 h4.2 l-2.2 4.6 6.5-7.4 h-4.2 z"
                fill="var(--bar-bg)" stroke="currentColor" stroke-width="1"
                stroke-linejoin="round" style="display: none"/>
        </svg>
      </span>
      <span class="value">--%</span>
    `;
    const fillEl = el.querySelector(".fill");
    const boltEl = el.querySelector(".bolt");
    const valueEl = el.querySelector(".value");

    const unsubscribe = onStats((stats) => {
      const battery = stats.battery;
      el.classList.toggle("present", battery != null);
      if (battery == null) return;
      valueEl.textContent = `${battery.percent}%`;
      fillEl.setAttribute(
        "width",
        ((battery.percent / 100) * FILL_MAX_WIDTH).toFixed(2),
      );
      // Continuous green (100%) → yellow (50%) → red (0%) via HSL hue.
      fillEl.setAttribute("fill", `hsl(${1.2 * battery.percent}, 75%, 50%)`);
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
