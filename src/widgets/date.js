// Date widget. Format: "Fri Jul 31" (optionally with year). Natural width —
// it only changes once per day. Click opens a month calendar pop-down.

import { createCalendarPopup } from "../lib/calendar-popup.js";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default {
  name: "date",
  css: `
    .widget-date .text {
      text-align: center;
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
  settings: [
    { key: "showYear", label: "Show year", type: "boolean", default: false },
  ],
  create({ options, listen }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-date";
    el.style.cursor = "pointer";
    const popup = createCalendarPopup({ anchor: el });
    el.addEventListener("click", () => popup.toggle());
    const textEl = document.createElement("span");
    textEl.className = "text";
    el.appendChild(textEl);

    // The date only changes at midnight; a minute-aligned tick keeps the
    // widget current with rare wakeups. The backend also pings resume
    // from suspend directly, so a sleep spanning midnight doesn't leave
    // yesterday's date up for the rest of the pending minute.
    let timer;
    const render = () => {
      clearTimeout(timer);
      const d = new Date();
      const year = options.showYear ? ` ${d.getFullYear()}` : "";
      textEl.textContent = `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()}${year}`;
      timer = setTimeout(render, 60000 - d.getSeconds() * 1000 - d.getMilliseconds() + 20);
    };
    render();
    const unlisten = listen("divebar://resume", render);
    return {
      el,
      destroy() {
        clearTimeout(timer);
        unlisten.then((f) => f());
        popup.close();
      },
    };
  },
};
