// Weather widget: condition icon + temperature from wttr.in (fetched by
// the backend; divebar://weather events). Location auto-detects by IP
// unless set in settings. Details (conditions, feels-like, area) in the
// tooltip.

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
      label: "Location (empty = auto)",
      type: "text",
      default: "",
    },
  ],
  create({ options, onEvent }) {
    const el = document.createElement("div");
    el.className = "chip widget-weather";
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

    const unsubscribe = onEvent("divebar://weather", (weather) => {
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

    return { el, destroy: unsubscribe };
  },
};
