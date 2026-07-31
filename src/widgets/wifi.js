// Wifi widget: SVG with three signal arcs that brighten proportionally to
// signal strength (one arc per third of the range, each fading in
// continuously); a slash overlays the icon when offline. Clicking launches
// the external wifi-gui tool.

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export default {
  name: "wifi",
  css: `
    .widget-wifi { cursor: pointer; }
    .widget-wifi.offline .icon,
    .widget-wifi.offline .value { color: var(--bar-fg-dim); }
  `,
  create({ onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-wifi";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none"/>
          <path class="arc1" d="M8.8 15.3 a4.5 4.5 0 0 1 6.4 0"/>
          <path class="arc2" d="M6.3 12.8 a8 8 0 0 1 11.4 0"/>
          <path class="arc3" d="M3.8 10.3 a11.5 11.5 0 0 1 16.4 0"/>
          <line class="slash" x1="4.5" y1="4" x2="19.5" y2="20"
                style="display: none"/>
        </svg>
      </span>
      <span class="value">--</span>
    `;
    const arcEls = [
      el.querySelector(".arc1"),
      el.querySelector(".arc2"),
      el.querySelector(".arc3"),
    ];
    const slashEl = el.querySelector(".slash");
    const valueEl = el.querySelector(".value");

    el.addEventListener("click", () => {
      invoke("launch_wifi_gui").catch((err) =>
        console.error("divebar: launch_wifi_gui failed", err),
      );
    });

    const unsubscribe = onStats((stats) => {
      const wifi = stats.wifi ?? {};
      const connected = wifi.ssid != null;
      el.classList.toggle("offline", !connected);
      slashEl.style.display = connected ? "none" : "";
      valueEl.textContent = connected ? wifi.ssid : "offline";

      // Each arc covers a third of the signal range and fades in
      // continuously across it.
      const signal = connected ? (wifi.signalPercent ?? 100) : 0;
      arcEls.forEach((arc, i) => {
        const t = clamp01((signal - i * 33.4) / 33.4);
        arc.style.opacity = connected ? 0.2 + 0.8 * t : 0.35;
      });
    });

    return { el, destroy: unsubscribe };
  },
};
