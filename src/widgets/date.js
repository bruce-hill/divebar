// Date widget. Format: "Fri Jul 31", fixed width so the bar never jitters.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default {
  name: "date",
  css: `
    .widget-date .text {
      width: 10ch; /* "Fri Jul 31" */
      text-align: left;
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
  create() {
    const el = document.createElement("div");
    el.className = "chip widget-date";
    const textEl = document.createElement("span");
    textEl.className = "text";
    el.appendChild(textEl);

    const render = () => {
      const d = new Date();
      textEl.textContent = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
    };
    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
