// Month-grid calendar pop-down for the date widget. Same popup mechanics
// as the sliders/menus (shape integration, coordinator, animations).

import { popupWillOpen, popupDidClose } from "./popup-state.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const CSS = `
  .dcal {
    position: fixed;
    top: calc(var(--bar-height) + 8px);
    padding: 14px 16px;
    background: var(--bar-bg);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    font-family: var(--font);
    font-size: calc(var(--bar-font) * 0.8);
    color: var(--bar-fg);
    z-index: 10;
    user-select: none;
  }
  :root.no-compositor .dcal {
    border-radius: 0 0 14px 14px;
    box-shadow: none;
    top: var(--bar-height);
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

export function createCalendarPopup({ anchor, invoke }) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "calendar-popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let popupEl = null;
  let viewYear = 0;
  let viewMonth = 0;
  let leaveTimer = null;

  const disarm = () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  const arm = () => {
    disarm();
    leaveTimer = setTimeout(close, 900);
  };
  function onDocDown(e) {
    if (!popupEl.contains(e.target) && !anchor.contains(e.target)) close();
  }

  function sendRect() {
    const r = popupEl.getBoundingClientRect();
    invoke("set_popup_open", {
      open: true,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    }).catch((err) => console.error("divebar: set_popup_open failed", err));
  }

  function renderMonth() {
    const now = new Date();
    popupEl.replaceChildren();

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
    popupEl.append(head, grid);
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
    sendRect();
  }

  function open() {
    if (popupEl) return;
    popupWillOpen(close);
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    popupEl = document.createElement("div");
    popupEl.className = "dcal";
    renderMonth();
    document.body.appendChild(popupEl);
    popupEl.animate(
      [
        { opacity: 0, transform: "translateY(-8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 150, easing: "ease-out" },
    );

    const rect = anchor.getBoundingClientRect();
    const width = popupEl.offsetWidth;
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    popupEl.style.left = `${left}px`;

    document.addEventListener("pointerdown", onDocDown, true);
    popupEl.addEventListener("pointerenter", disarm);
    popupEl.addEventListener("pointerleave", arm);
    anchor.addEventListener("pointerenter", disarm);
    anchor.addEventListener("pointerleave", arm);
    sendRect();
  }

  function close() {
    if (!popupEl) return;
    disarm();
    document.removeEventListener("pointerdown", onDocDown, true);
    anchor.removeEventListener("pointerenter", disarm);
    anchor.removeEventListener("pointerleave", arm);
    const closingEl = popupEl;
    popupEl = null;
    popupDidClose(close);
    const anim = closingEl.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-6px)" },
      ],
      { duration: 110, easing: "ease-in" },
    );
    anim.onfinish = () => closingEl.remove();
    invoke("set_popup_open", { open: false, rect: null }).catch((err) =>
      console.error("divebar: set_popup_open failed", err),
    );
  }

  return { open, close, toggle: () => (popupEl ? close() : open()) };
}
