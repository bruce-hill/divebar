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
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 4 H20 L12 13 Z"/>
          <path d="M12 13 V20 M8 20 H16"/>
          <circle cx="14.8" cy="7" r="1.7" fill="currentColor" stroke="none"/>
        </svg>
      </span>
      <span>divebar</span>`;
    return { el };
  },
};
