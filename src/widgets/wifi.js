// Wifi widget: shows the connected SSID + signal strength; clicking it
// launches the external wifi-gui tool.

export default {
  name: "wifi",
  css: `
    .widget-wifi { cursor: pointer; }
    .widget-wifi .signal { color: var(--bar-fg-dim); font-size: 17px; }
    .widget-wifi.offline .value { color: var(--bar-fg-dim); }
  `,
  create({ onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-wifi";
    el.innerHTML = `
      <span class="icon">\u{1F4F6}</span>
      <span class="value">--</span>
      <span class="signal"></span>
    `;
    const valueEl = el.querySelector(".value");
    const signalEl = el.querySelector(".signal");

    el.addEventListener("click", () => {
      invoke("launch_wifi_gui").catch((err) =>
        console.error("divebar: launch_wifi_gui failed", err),
      );
    });

    const unsubscribe = onStats((stats) => {
      const wifi = stats.wifi ?? {};
      const connected = wifi.ssid != null;
      el.classList.toggle("offline", !connected);
      valueEl.textContent = connected ? wifi.ssid : "offline";
      signalEl.textContent =
        connected && wifi.signalPercent != null ? `${wifi.signalPercent}%` : "";
    });

    return { el, destroy: unsubscribe };
  },
};
