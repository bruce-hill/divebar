// Static branding widget. Mostly here as the smallest possible example of
// the widget contract.

export default {
  name: "logo",
  css: `
    .widget-logo {
      background: linear-gradient(135deg, rgba(122, 162, 247, 0.25), rgba(187, 154, 247, 0.25));
      font-weight: 600;
      letter-spacing: 0.02em;
    }
  `,
  create() {
    const el = document.createElement("div");
    el.className = "chip widget-logo";
    el.innerHTML = `<span class="icon">🍸</span><span>divebar</span>`;
    return { el };
  },
};
