// Time widget. Format: "2:27pm", fixed width so the bar never jitters.

export default {
  name: "time",
  css: `
    .widget-time .text {
      width: 7ch; /* "12:27pm" */
      text-align: right;
      font-family: var(--font-mono);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
  create() {
    const el = document.createElement("div");
    el.className = "chip widget-time";
    const textEl = document.createElement("span");
    textEl.className = "text";
    el.appendChild(textEl);

    const render = () => {
      const d = new Date();
      const ampm = d.getHours() >= 12 ? "pm" : "am";
      const hour = d.getHours() % 12 || 12;
      const minute = String(d.getMinutes()).padStart(2, "0");
      textEl.textContent = `${hour}:${minute}${ampm}`;
    };
    render();
    const timer = setInterval(render, 1000);
    return { el, destroy: () => clearInterval(timer) };
  },
};
