// Time widget. Format: "2:27pm" (or 24-hour / with seconds via settings).
// Fixed width so the bar never jitters.

function format(d, { hour24, seconds }) {
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = seconds ? `:${String(d.getSeconds()).padStart(2, "0")}` : "";
  if (hour24) {
    return `${String(d.getHours()).padStart(2, "0")}:${mm}${ss}`;
  }
  const ampm = d.getHours() >= 12 ? "pm" : "am";
  const hour = d.getHours() % 12 || 12;
  return `${hour}:${mm}${ss}${ampm}`;
}

// Widest possible string per format, for the fixed width.
function widthCh({ hour24, seconds }) {
  if (hour24) return seconds ? 8 : 5; // "23:27:33"
  return seconds ? 10 : 7; // "12:27:33pm"
}

export default {
  name: "time",
  css: `
    .widget-time .text {
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
  settings: [
    { key: "hour24", label: "24-hour clock", type: "boolean", default: false },
    { key: "seconds", label: "Show seconds", type: "boolean", default: false },
  ],
  create({ options }) {
    const el = document.createElement("div");
    el.className = "chip widget-time";
    const textEl = document.createElement("span");
    textEl.className = "text";
    textEl.style.width = `${widthCh(options)}ch`;
    el.appendChild(textEl);

    const render = () => (textEl.textContent = format(new Date(), options));
    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
