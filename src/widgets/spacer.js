// Invisible spacer that absorbs spare width, for pushing widget groups
// apart without relying on the window title's flex-grow. Multiple spacers
// split space proportionally to their grow values.

export default {
  name: "spacer",
  css: `
    .widget-spacer {
      min-width: 0;
      align-self: stretch;
    }
  `,
  settings: [
    {
      key: "grow",
      label: "Flex grow",
      type: "number",
      min: 0,
      max: 20,
      default: 1,
    },
  ],
  create({ options }) {
    const el = document.createElement("div");
    el.className = "widget-spacer";
    el.style.flexGrow = options.grow;
    return { el };
  },
};
