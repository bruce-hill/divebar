// Battery widget: percentage + charging state. Hides itself entirely on
// machines with no battery (stats.battery is null).

export default {
  name: "battery",
  css: `
    .widget-battery { display: none; }
    .widget-battery .value { width: 4ch; text-align: right; } /* "100%" */
    .widget-battery.present { display: flex; }
    .widget-battery.charging .icon { color: var(--accent); }
    .widget-battery.low .value { color: var(--critical); }
  `,
  create({ onStats }) {
    const el = document.createElement("div");
    el.className = "chip widget-battery";
    el.innerHTML = `
      <span class="icon"></span>
      <span class="value">--%</span>
    `;
    const iconEl = el.querySelector(".icon");
    const valueEl = el.querySelector(".value");

    const unsubscribe = onStats((stats) => {
      const battery = stats.battery;
      el.classList.toggle("present", battery != null);
      if (battery == null) return;
      valueEl.textContent = `${battery.percent}%`;
      iconEl.textContent = battery.charging ? "\u{26A1}" : "\u{1F50B}";
      el.classList.toggle("charging", battery.charging);
      el.classList.toggle("low", !battery.charging && battery.percent <= 15);
    });

    return { el, destroy: unsubscribe };
  },
};
