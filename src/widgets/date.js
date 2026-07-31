// Date widget. Format: "Fri Jul 31" (optionally with year), fixed width so
// the bar never jitters.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default {
  name: "date",
  css: `
    .widget-date .text {
      text-align: left;
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
  settings: [
    { key: "showYear", label: "Show year", type: "boolean", default: false },
  ],
  create({ options }) {
    const el = document.createElement("div");
    el.className = "chip widget-date";
    const textEl = document.createElement("span");
    textEl.className = "text";
    // "Fri Jul 31" = 10ch, "Fri Jul 31 2026" = 15ch
    textEl.style.width = options.showYear ? "15ch" : "10ch";
    el.appendChild(textEl);

    const render = () => {
      const d = new Date();
      const year = options.showYear ? ` ${d.getFullYear()}` : "";
      textEl.textContent = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
    };
    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
