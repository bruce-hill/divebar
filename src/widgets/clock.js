// Clock widget. Format: "Fri Jul 31 · 2:27pm"
// Date and time sections are fixed-width (ch units on the mono font) so the
// bar layout never jitters as the values change.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(d) {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function formatTime(d) {
  const ampm = d.getHours() >= 12 ? "pm" : "am";
  const hour = d.getHours() % 12 || 12;
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}${ampm}`;
}

export default {
  name: "clock",
  css: `
    .widget-clock {
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .widget-clock .date {
      width: 10ch; /* "Fri Jul 31" */
      text-align: left;
    }
    .widget-clock .sep {
      color: var(--bar-fg-dim);
    }
    .widget-clock .time {
      width: 7ch; /* "12:27pm" */
      text-align: right;
    }
  `,
  create({ options }) {
    const el = document.createElement("div");
    el.className = "chip widget-clock";

    const dateEl = document.createElement("span");
    dateEl.className = "date";
    const sepEl = document.createElement("span");
    sepEl.className = "sep";
    sepEl.textContent = options.separator ?? "\u{00B7}"; // ·
    const timeEl = document.createElement("span");
    timeEl.className = "time";
    el.append(dateEl, sepEl, timeEl);

    const render = () => {
      const now = new Date();
      dateEl.textContent = formatDate(now);
      timeEl.textContent = formatTime(now);
    };
    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
