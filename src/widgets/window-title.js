// Focused window title. Expands to fill available space in its zone and
// truncates with an ellipsis when the title is too long.

export default {
  name: "window-title",
  css: `
    .widget-window-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--bar-fg-dim);
      padding: 0 4px;
    }
  `,
  settings: [
    {
      key: "align",
      label: "Text alignment",
      type: "select",
      choices: ["left", "center", "right"],
      default: "left",
    },
  ],
  create({ options, onEvent }) {
    const el = document.createElement("div");
    el.className = "widget-window-title";
    el.style.textAlign = options.align;

    const unsubscribe = onEvent("divebar://hlwm", ({ windowTitle }) => {
      el.textContent = windowTitle ?? "";
      el.title = windowTitle ?? ""; // native tooltip shows the full title
    });

    return { el, destroy: unsubscribe };
  },
};
