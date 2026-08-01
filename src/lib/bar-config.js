// Single source of truth for bar-level configuration: the settings
// schema (rendered generically by the settings window, like widget
// settings) and how a config's bar block maps onto the bar's CSS
// variables. Absent keys mean "use the defaults here". The backend keeps
// one mirror: main.rs DEFAULT_BAR_HEIGHT, needed to size the window
// before the webview loads — keep it equal to the height default below.

export const BAR_SETTINGS = [
  { key: "height", label: "Bar height (px)", type: "number", min: 24, max: 128, default: 48 },
  { key: "paddingX", label: "Horizontal padding (px)", type: "number", min: 0, max: 48, default: 10 },
  { key: "paddingY", label: "Vertical padding (px)", type: "number", min: 0, max: 24, default: 6 },
  { key: "accent", label: "Accent color", type: "color", default: "#7aa2f7" },
  { key: "font", label: "Font", type: "font", default: "" },
];

export function barDefaults() {
  return Object.fromEntries(BAR_SETTINGS.map((s) => [s.key, s.default]));
}

// Derive all sizing (chip height, font, icons) from the configured bar
// height and padding, so widgets scale with the available space. Accent
// and font are overrides: unset, the stylesheet defaults apply.
export function applyBarStyle(config) {
  const bar = config?.bar ?? {};
  const defaults = barDefaults();
  const height = bar.height ?? defaults.height;
  const padX = bar.paddingX ?? defaults.paddingX;
  const padY = bar.paddingY ?? defaults.paddingY;
  const chip = Math.max(14, height - 2 * padY);
  const root = document.documentElement.style;
  root.setProperty("--bar-height", `${height}px`);
  root.setProperty("--bar-pad-x", `${padX}px`);
  root.setProperty("--bar-pad-y", `${padY}px`);
  root.setProperty("--chip-height", `${chip}px`);
  root.setProperty("--chip-radius", `${chip / 2}px`);
  root.setProperty("--bar-font", `${Math.round(chip * 0.55)}px`);
  root.setProperty("--icon-size", `${Math.round(chip * 0.88)}px`);
  if (bar.accent) root.setProperty("--accent", bar.accent);
  else root.removeProperty("--accent");
  if (bar.font) {
    root.setProperty("--font", `"${bar.font}", Inter, Cantarell, system-ui, sans-serif`);
  } else {
    root.removeProperty("--font");
  }
}
