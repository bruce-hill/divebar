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
          <path d="M5.5 8.5 V18.5 a1.8 1.8 0 0 0 1.8 1.8 h5.9 a1.8 1.8 0 0 0 1.8-1.8 V8.5"/>
          <path d="M15 11 h1.6 a2.4 2.4 0 0 1 2.4 2.4 v0.4 a2.4 2.4 0 0 1 -2.4 2.4 H15"/>
          <circle cx="7.4" cy="7.6" r="1.9" fill="currentColor" stroke="none"/>
          <circle cx="10.5" cy="6.8" r="2.1" fill="currentColor" stroke="none"/>
          <circle cx="13.6" cy="7.6" r="1.9" fill="currentColor" stroke="none"/>
        </svg>
      </span>
      <span>divebar</span>`;
    return { el };
  },
};
