// CPU usage widget: percentage plus a small meter bar, colored by load.

export default {
  name: "cpu",
  css: `
    .widget-cpu .meter {
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
    }
    .widget-cpu .meter-fill {
      height: 100%;
      width: 0%;
      border-radius: 2px;
      background: var(--accent);
      transition: width 400ms ease, background 400ms ease;
    }
    .widget-cpu.warn .meter-fill     { background: var(--warn); }
    .widget-cpu.critical .meter-fill { background: var(--critical); }
  `,
  create({ onStats }) {
    const el = document.createElement("div");
    el.className = "chip widget-cpu";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round">
          <rect x="6.5" y="6.5" width="11" height="11" rx="2"/>
          <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" stroke="none"/>
          <path d="M9 6.5 V3.5 M12 6.5 V3.5 M15 6.5 V3.5
                   M9 17.5 V20.5 M12 17.5 V20.5 M15 17.5 V20.5
                   M6.5 9 H3.5 M6.5 12 H3.5 M6.5 15 H3.5
                   M17.5 9 H20.5 M17.5 12 H20.5 M17.5 15 H20.5"/>
        </svg>
      </span>
      <span class="value">--%</span>
      <div class="meter"><div class="meter-fill"></div></div>
    `;
    const valueEl = el.querySelector(".value");
    const fillEl = el.querySelector(".meter-fill");

    const unsubscribe = onStats((stats) => {
      const pct = stats.cpu?.usagePercent ?? 0;
      valueEl.textContent = `${Math.round(pct)}%`;
      fillEl.style.width = `${Math.min(pct, 100)}%`;
      el.classList.toggle("warn", pct >= 60 && pct < 85);
      el.classList.toggle("critical", pct >= 85);
    });

    return { el, destroy: unsubscribe };
  },
};
