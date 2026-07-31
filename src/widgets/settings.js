// Gear chip that opens the settings window.

export default {
  name: "settings",
  css: `
    .widget-settings { cursor: pointer; }
    .widget-settings .icon { color: var(--bar-fg-dim); }
    .widget-settings:hover .icon { color: var(--bar-fg); }
  `,
  create({ invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-settings";
    el.title = "divebar settings";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3.2"/>
          <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6A7.6 7.6 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z"/>
        </svg>
      </span>
    `;
    el.addEventListener("click", () => {
      invoke("open_settings").catch((err) =>
        console.error("divebar: open_settings failed", err),
      );
    });
    return { el };
  },
};
