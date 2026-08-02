// Lock-screen widget: a padlock icon that runs `slock` when clicked.

export default {
  name: "lock",
  css: `
    .widget-lock { cursor: pointer; }
  `,
  create({ invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-lock";
    el.title = "Lock screen";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5.5" y="11" width="13" height="9" rx="1.6"/>
          <path d="M8 11 V8 a4 4 0 0 1 8 0 v3"/>
          <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>
        </svg>
      </span>
    `;

    el.addEventListener("click", () => {
      invoke("lock_screen").catch((err) =>
        console.error("divebar: lock_screen failed", err),
      );
    });

    return { el };
  },
};
