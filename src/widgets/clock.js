// Clock widget: time + optional date, ticking on the minute-aligned second.

export default {
  name: "clock",
  css: `
    .widget-clock .time {
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .widget-clock .date {
      color: var(--bar-fg-dim);
      font-size: 12px;
    }
  `,
  create({ options }) {
    const el = document.createElement("div");
    el.className = "chip widget-clock";

    const timeEl = document.createElement("span");
    timeEl.className = "time";
    el.appendChild(timeEl);

    let dateEl = null;
    if (options.showDate) {
      dateEl = document.createElement("span");
      dateEl.className = "date";
      el.appendChild(dateEl);
    }

    function render() {
      const now = new Date();
      timeEl.textContent = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      if (dateEl) {
        dateEl.textContent = now.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
      }
    }

    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
