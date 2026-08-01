// Memory widget: RAM icon + fill meter, with an optional text readout
// (percent, usage, or usage fraction). Exact numbers always available in
// the tooltip.

const GIB = 1024 ** 3;

// Fixed width per display mode so the chip never resizes.
const MODE_WIDTH_CH = {
  percent: 4, // "100%"
  usage: 8, // "31.8 GiB"
  fraction: 13, // "31.8 / 32 GiB"
};

export default {
  name: "memory",
  css: `
    .widget-memory .value { text-align: left; }
    .widget-memory .meter {
      width: calc(var(--chip-height) * 1.5);
      height: calc(var(--chip-height) * 0.32);
      border-radius: calc(var(--chip-height) * 0.16);
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
    }
    .widget-memory .meter-fill {
      height: 100%;
      width: 0%;
      border-radius: inherit;
      background: var(--accent);
      transition: width 400ms ease, background 400ms ease;
    }
    .widget-memory.warn .meter-fill     { background: var(--warn); }
    .widget-memory.critical .meter-fill { background: var(--critical); }
    .widget-memory.critical .value      { color: var(--critical); }
  `,
  settings: [
    {
      key: "display",
      label: "Text display",
      type: "select",
      choices: ["none", "percent", "usage", "fraction"],
      default: "none",
    },
  ],
  create({ options, onStats }) {
    const el = document.createElement("div");
    el.className = "chip widget-memory";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round">
          <rect x="2.5" y="7" width="19" height="8.5" rx="1.5"/>
          <rect x="5.5" y="9.5" width="3.4" height="3.6" rx="0.8" fill="currentColor" stroke="none"/>
          <rect x="10.3" y="9.5" width="3.4" height="3.6" rx="0.8" fill="currentColor" stroke="none"/>
          <rect x="15.1" y="9.5" width="3.4" height="3.6" rx="0.8" fill="currentColor" stroke="none"/>
          <path d="M5.5 15.5 V18 M8.5 15.5 V18 M11.5 15.5 V18 M14.5 15.5 V18 M17.5 15.5 V18"/>
        </svg>
      </span>
      <span class="value"></span>
      <div class="meter"><div class="meter-fill"></div></div>
    `;
    const valueEl = el.querySelector(".value");
    const fillEl = el.querySelector(".meter-fill");

    const mode = options.display;
    if (mode === "none") {
      valueEl.style.display = "none";
    } else {
      valueEl.style.width = `${MODE_WIDTH_CH[mode] ?? 4}ch`;
    }

    const unsubscribe = onStats((stats) => {
      const used = stats.memory?.usedBytes ?? 0;
      const total = stats.memory?.totalBytes ?? 0;
      const pct = total > 0 ? (used / total) * 100 : 0;
      const usedGib = (used / GIB).toFixed(1);
      const totalGib = (total / GIB).toFixed(0);

      if (mode === "percent") valueEl.textContent = `${Math.round(pct)}%`;
      else if (mode === "usage") valueEl.textContent = `${usedGib} GiB`;
      else if (mode === "fraction")
        valueEl.textContent = `${usedGib} / ${totalGib} GiB`;

      el.title = `Memory: ${usedGib} / ${totalGib} GiB (${Math.round(pct)}%)`;
      fillEl.style.width = `${Math.min(pct, 100)}%`;
      el.classList.toggle("warn", pct >= 75 && pct < 90);
      el.classList.toggle("critical", pct >= 90);
    });

    return { el, destroy: unsubscribe };
  },
};
