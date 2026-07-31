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
      <span class="icon">\u{1F9E0}</span>
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
