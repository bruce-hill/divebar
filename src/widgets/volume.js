// Volume widget: click to toggle mute, scroll to adjust. Applies the state
// returned by control commands immediately; the stats poll keeps it in sync
// with changes made elsewhere (media keys, mixers).

const SCROLL_STEP_PERCENT = 3;

export default {
  name: "volume",
  css: `
    .widget-volume { cursor: pointer; }
    .widget-volume.muted .value,
    .widget-volume.muted .icon { color: var(--bar-fg-dim); }
    .widget-volume.muted .value { text-decoration: line-through; }
  `,
  create({ onStats, invoke }) {
    const el = document.createElement("div");
    el.className = "chip widget-volume";
    el.innerHTML = `
      <span class="icon"></span>
      <span class="value">--%</span>
    `;
    const iconEl = el.querySelector(".icon");
    const valueEl = el.querySelector(".value");

    function render(volume) {
      el.style.display = volume ? "" : "none";
      if (!volume) return;
      valueEl.textContent = `${volume.percent}%`;
      iconEl.textContent = volume.muted
        ? "\u{1F507}" // 🔇
        : volume.percent >= 50
          ? "\u{1F50A}" // 🔊
          : "\u{1F509}"; // 🔉
      el.classList.toggle("muted", volume.muted);
    }

    el.addEventListener("click", async () => {
      try {
        render(await invoke("toggle_mute"));
      } catch (err) {
        console.error("divebar: toggle_mute failed", err);
      }
    });

    el.addEventListener("wheel", async (e) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? SCROLL_STEP_PERCENT : -SCROLL_STEP_PERCENT;
      try {
        render(await invoke("adjust_volume", { deltaPercent: delta }));
      } catch (err) {
        console.error("divebar: adjust_volume failed", err);
      }
    });

    const unsubscribe = onStats((stats) => render(stats.volume));
    return { el, destroy: unsubscribe };
  },
};
