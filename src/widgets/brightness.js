// Screen brightness widget: scroll to adjust. Hides itself when no
// backlight device exists (stats.brightness is null).

const SCROLL_STEP_PERCENT = 5;

export default {
  name: "brightness",
  css: `
    .widget-brightness { cursor: ns-resize; }
  `,
  create({ onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-brightness";
    el.innerHTML = `
      <span class="icon">\u{2600}\u{FE0F}</span>
      <span class="value">--%</span>
    `;
    const valueEl = el.querySelector(".value");

    function render(brightness) {
      el.style.display = brightness ? "" : "none";
      if (!brightness) return;
      valueEl.textContent = `${brightness.percent}%`;
    }

    el.addEventListener("wheel", async (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? SCROLL_STEP_PERCENT : -SCROLL_STEP_PERCENT;
      try {
        render(await invoke("adjust_brightness", { deltaPercent: delta }));
      } catch (err) {
        console.error("divebar: adjust_brightness failed", err);
      }
    });

    const unsubscribe = onStats((stats) => render(stats.brightness));
    return { el, destroy: unsubscribe };
  },
};
