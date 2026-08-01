// Month-grid calendar pop-down for the date widget. Popup mechanics live
// in popup.js; this module renders the month grid.

import { createPopup } from "./popup.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const CSS = `
  .dcal {
    padding: 14px 16px;
    font-size: calc(var(--bar-font) * 0.8);
    color: var(--bar-fg);
    user-select: none;
  }
  .dcal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 8px;
  }
  .dcal-title { font-weight: 600; }
  .dcal-nav {
    border: none;
    background: transparent;
    color: var(--bar-fg-dim);
    font: inherit;
    cursor: pointer;
    padding: 2px 10px;
    border-radius: 7px;
  }
  .dcal-nav:hover { background: var(--chip-bg-hover); color: var(--bar-fg); }
  .dcal-grid {
    display: grid;
    grid-template-columns: repeat(7, 2.2em);
    gap: 2px;
    text-align: center;
  }
  .dcal-grid .dow {
    color: var(--bar-fg-dim);
    font-size: 0.85em;
    padding: 2px 0;
  }
  .dcal-grid .day {
    padding: 3px 0;
    border-radius: 7px;
    font-variant-numeric: tabular-nums;
  }
  .dcal-grid .day.other { color: rgba(255, 255, 255, 0.18); }
  .dcal-grid .day.today {
    background: var(--accent);
    color: #10121a;
    font-weight: 700;
  }
`;

let stylesInjected = false;

export function createCalendarPopup({ anchor }) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "calendar-popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let bodyEl = null;
  let viewYear = 0;
  let viewMonth = 0;

  function renderMonth() {
    const now = new Date();
    bodyEl.replaceChildren();

    const head = document.createElement("div");
    head.className = "dcal-head";
    const prev = document.createElement("button");
    prev.className = "dcal-nav";
    prev.textContent = "‹";
    const title = document.createElement("span");
    title.className = "dcal-title";
    title.textContent = `${MONTHS[viewMonth]} ${viewYear}`;
    const next = document.createElement("button");
    next.className = "dcal-nav";
    next.textContent = "›";
    prev.addEventListener("click", () => shiftMonth(-1));
    next.addEventListener("click", () => shiftMonth(1));
    head.append(prev, title, next);

    const grid = document.createElement("div");
    grid.className = "dcal-grid";
    for (const dow of DAY_HEADERS) {
      const cell = document.createElement("span");
      cell.className = "dow";
      cell.textContent = dow;
      grid.append(cell);
    }
    const first = new Date(viewYear, viewMonth, 1);
    const start = new Date(viewYear, viewMonth, 1 - first.getDay());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const cell = document.createElement("span");
      cell.className = "day";
      cell.textContent = d.getDate();
      if (d.getMonth() !== viewMonth) cell.classList.add("other");
      if (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      ) {
        cell.classList.add("today");
      }
      grid.append(cell);
    }
    bodyEl.append(head, grid);
  }

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    } else if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderMonth();
  }

  const popup = createPopup({
    anchor,
    className: "dcal",
    render(el) {
      const now = new Date();
      viewYear = now.getFullYear();
      viewMonth = now.getMonth();
      bodyEl = el;
      renderMonth();
    },
  });

  return { open: popup.open, close: popup.close, toggle: popup.toggle };
}
