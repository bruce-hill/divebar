// Weather widget: condition icon + temperature from wttr.in (fetched by
// the backend; divebar://weather events). Location auto-detects by IP
// unless set in settings. Details (conditions, feels-like, area) in the
// tooltip; click opens a 3-day forecast pop-down.

import { createPopup } from "../lib/popup.js";

// wttr.in uses WWO condition codes; group them into icon categories.
const CODE_ICONS = [
  { icon: "sun", codes: [113] },
  { icon: "partly", codes: [116] },
  { icon: "cloud", codes: [119, 122] },
  { icon: "fog", codes: [143, 149, 248, 260] },
  {
    icon: "rain",
    codes: [
      176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353,
      356, 359,
    ],
  },
  { icon: "thunder", codes: [200, 386, 389, 392, 395] },
  {
    icon: "snow",
    codes: [
      179, 182, 185, 227, 230, 317, 320, 323, 326, 329, 332, 335, 338, 350,
      362, 365, 368, 371, 374, 377,
    ],
  },
];

const SUN_CORE = `
  <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>
  <path d="M12 3.5 V5.5 M12 18.5 V20.5 M3.5 12 H5.5 M18.5 12 H20.5
           M6 6 L7.4 7.4 M16.6 16.6 L18 18 M18 6 L16.6 7.4 M7.4 16.6 L6 18"/>`;

const CLOUD = `
  <path d="M7 17.5 a4 4 0 0 1 -0.6-7.96 A5 5 0 0 1 16 8.3 a3.8 3.8 0 0 1 1.4 7.2 z"
        transform="translate(0,-1)"/>`;

const ICONS = {
  sun: SUN_CORE,
  partly: `
    <g transform="translate(-3,-3) scale(0.75)">${SUN_CORE}</g>
    <g transform="translate(2,3) scale(0.85)">${CLOUD.replace('stroke="none"', "")}</g>`,
  cloud: CLOUD,
  fog: `
    <g transform="scale(0.8) translate(3,-2)">${CLOUD}</g>
    <path d="M5 16.5 H19 M7 19.5 H17"/>`,
  rain: `
    <g transform="scale(0.85) translate(2,-1)">${CLOUD}</g>
    <path d="M8.5 17 L7.5 20 M12 17 L11 20 M15.5 17 L14.5 20"/>`,
  thunder: `
    <g transform="scale(0.85) translate(2,-1)">${CLOUD}</g>
    <path d="M12.5 15.5 L10 19 h2.4 l-1.4 3" stroke-width="1.4"/>`,
  snow: `
    <g transform="scale(0.85) translate(2,-1)">${CLOUD}</g>
    <path d="M8.5 18.2 v0.01 M12 19.8 v0.01 M15.5 18.2 v0.01" stroke-width="2.4"/>`,
};

function iconFor(code) {
  for (const group of CODE_ICONS) {
    if (group.codes.includes(code)) return group.icon;
  }
  return "cloud";
}

function iconSvg(code) {
  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      ${ICONS[iconFor(code)]}
    </svg>`;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// wttr.in strings (area, descriptions) get interpolated into popup markup.
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );

function dayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toDateString() === new Date().toDateString()
    ? "Today"
    : DAYS[date.getDay()];
}

function hourLabel(hour) {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
}

// The next 24 hours of 3-hour forecast slots, spilling into tomorrow.
function upcomingSlots(forecast) {
  const slots = [];
  for (const day of forecast) {
    const [y, m, d] = day.date.split("-").map(Number);
    for (const h of day.hourly ?? []) {
      slots.push({ ...h, at: new Date(y, m - 1, d, h.hour) });
    }
  }
  // Keep a slot until it's half over (each covers 3 hours).
  const cutoff = Date.now() - 90 * 60 * 1000;
  return slots.filter((s) => s.at.getTime() >= cutoff).slice(0, 8);
}

export default {
  name: "weather",
  css: `
    .widget-weather { display: none; }
    .widget-weather.present { display: flex; }
    /* The composed cloud icons fill their box more fully than the other
       widget icons — draw them slightly smaller so heights match. */
    .widget-weather .icon svg {
      width: calc(var(--icon-size) * 0.85);
      height: calc(var(--icon-size) * 0.85);
    }
    .widget-weather .value { width: 4ch; text-align: center; } /* "104°" */

    /* Forecast pop-down */
    .wxcast {
      padding: 12px 16px 14px;
      font-size: calc(var(--bar-font) * 0.8);
      color: var(--bar-fg);
      user-select: none;
    }
    .wxcast-head { font-weight: 600; margin-bottom: 2px; }
    .wxcast-now { color: var(--bar-fg-dim); margin-bottom: 10px; }
    .wxcast-hours {
      display: flex;
      gap: 2px;
      margin-bottom: 12px;
    }
    .wxcast-hours .slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      min-width: 3.2em;
    }
    .wxcast-hours .t { color: var(--bar-fg-dim); font-size: 0.85em; }
    .wxcast-hours svg { width: 1.3em; height: 1.3em; display: block; }
    .wxcast-hours .rain {
      color: var(--accent);
      font-size: 0.85em;
      min-height: 1.2em;
    }
    .wxcast-days {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 6px 12px;
      align-items: center;
    }
    .wxcast-days svg { width: 1.3em; height: 1.3em; display: block; }
    .wxcast-desc { color: var(--bar-fg-dim); padding-right: 8px; }
    .wxcast-desc .rain { color: var(--accent); }
    .wxcast-temps { text-align: right; font-variant-numeric: tabular-nums; }
    .wxcast-temps .lo { color: var(--bar-fg-dim); }
  `,
  settings: [
    {
      key: "units",
      label: "Units",
      type: "select",
      choices: ["fahrenheit", "celsius"],
      default: "fahrenheit",
    },
    {
      key: "location",
      label: "Location",
      type: "location",
      placeholder: "city, zip, or lat,lon — empty = auto",
      default: "",
    },
  ],
  create({ options, onEvent, invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-weather";
    el.style.cursor = "pointer";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        </svg>
      </span>
      <span class="value"></span>
    `;
    const svgEl = el.querySelector("svg");
    const valueEl = el.querySelector(".value");
    let currentIcon = null;
    let latest = null;

    const popup = createPopup({
      anchor: el,
      invoke,
      className: "wxcast",
      render(body) {
        const useF = options.units === "fahrenheit";
        const unit = useF ? "°F" : "°C";
        const temp = useF ? (latest.tempF ?? latest.tempC) : latest.tempC;
        const feels = useF ? (latest.feelsF ?? latest.feelsC) : latest.feelsC;
        const rows = latest.forecast
          .map((day) => {
            const hi = useF ? (day.maxF ?? day.maxC) : day.maxC;
            const lo = useF ? (day.minF ?? day.minC) : day.minC;
            const rain =
              day.rain > 0
                ? ` <span class="rain">${Math.round(day.rain)}%</span>`
                : "";
            return `
              <span>${dayLabel(day.date)}</span>
              ${iconSvg(day.code)}
              <span class="wxcast-desc">${esc(day.desc)}${rain}</span>
              <span class="wxcast-temps">${Math.round(hi)}°
                <span class="lo">${Math.round(lo)}°</span></span>`;
          })
          .join("");
        const hours = upcomingSlots(latest.forecast)
          .map((slot) => {
            const t = useF ? (slot.tempF ?? slot.tempC) : slot.tempC;
            const rain =
              slot.rain > 0 ? `${Math.round(slot.rain)}%` : "";
            return `
              <span class="slot">
                <span class="t">${hourLabel(slot.at.getHours())}</span>
                ${iconSvg(slot.code)}
                <span>${Math.round(t)}°</span>
                <span class="rain">${rain}</span>
              </span>`;
          })
          .join("");
        body.innerHTML = `
          <div class="wxcast-head">${esc(latest.area || "Weather")}</div>
          <div class="wxcast-now">${esc(latest.desc)}, ${Math.round(temp)}${unit}${
            feels != null ? ` (feels like ${Math.round(feels)}${unit})` : ""
          }</div>
          ${hours ? `<div class="wxcast-hours">${hours}</div>` : ""}
          <div class="wxcast-days">${rows}</div>`;
      },
    });
    el.addEventListener("click", () => {
      if (latest?.forecast?.length) popup.toggle();
    });

    const unsubscribe = onEvent("divebar://weather", (weather) => {
      latest = weather;
      const present = weather && weather.tempC != null;
      el.classList.toggle("present", Boolean(present));
      if (!present) return;

      const useF = options.units === "fahrenheit";
      const temp = useF ? (weather.tempF ?? weather.tempC) : weather.tempC;
      const feels = useF ? (weather.feelsF ?? weather.feelsC) : weather.feelsC;
      valueEl.textContent = `${Math.round(temp)}°`;

      const icon = iconFor(weather.code);
      if (icon !== currentIcon) {
        currentIcon = icon;
        svgEl.innerHTML = ICONS[icon];
      }

      const unit = useF ? "°F" : "°C";
      el.title =
        `${weather.desc}, ${Math.round(temp)}${unit}` +
        (feels != null ? ` (feels like ${Math.round(feels)}${unit})` : "") +
        (weather.area ? ` — ${weather.area}` : "");
    });

    return {
      el,
      destroy() {
        unsubscribe();
        popup.close();
      },
    };
  },
};
