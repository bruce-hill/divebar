// File manager widget: a folder icon that launches `pcmanfm` when clicked.

export default {
  name: "files",
  css: `
    .widget-files { cursor: pointer; }
  `,
  create({ invoke }) {
    const el = document.createElement("div");
    el.className = "chip clickable widget-files";
    el.title = "File manager";
    el.innerHTML = `
      <span class="icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3.5 7.5 a1.5 1.5 0 0 1 1.5 -1.5 h4.2 l2 2.2 h7.8
                   a1.5 1.5 0 0 1 1.5 1.5 v8.3 a1.5 1.5 0 0 1 -1.5 1.5
                   h-14 a1.5 1.5 0 0 1 -1.5 -1.5 z"/>
          <path d="M3.5 10.5 h17"/>
        </svg>
      </span>
    `;

    el.addEventListener("click", () => {
      invoke("launch_file_manager").catch((err) =>
        console.error("divebar: launch_file_manager failed", err),
      );
    });

    return { el };
  },
};
