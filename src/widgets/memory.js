// Memory widget: used/total in GiB.

const GIB = 1024 ** 3;

export default {
  name: "memory",
  css: `
    .widget-memory .total {
      color: var(--bar-fg-dim);
    }
    .widget-memory.critical .value {
      color: var(--critical);
    }
  `,
  create({ onStats }) {
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
      <span class="value">--</span>
      <span class="value total"></span>
    `;
    const valueEl = el.querySelector(".value");
    const totalEl = el.querySelector(".total");

    const unsubscribe = onStats((stats) => {
      const used = stats.memory?.usedBytes ?? 0;
      const total = stats.memory?.totalBytes ?? 0;
      valueEl.textContent = `${(used / GIB).toFixed(1)}`;
      totalEl.textContent = `/ ${(total / GIB).toFixed(0)} GiB`;
      el.classList.toggle("critical", total > 0 && used / total >= 0.9);
    });

    return { el, destroy: unsubscribe };
  },
};
