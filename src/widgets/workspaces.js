// herbstluftwm workspace (tag) switcher. Renders one button per tag from the
// `divebar://hlwm` event stream; clicking a tag switches to it.

export default {
  name: "workspaces",
  css: `
    .widget-workspaces {
      display: flex;
      align-items: center;
      gap: 2px;
      height: var(--chip-height);
      padding: 0 3px;
      border-radius: var(--chip-radius);
      background: rgba(0, 0, 0, 0.26);
      box-shadow:
        inset 0 1px 2px rgba(0, 0, 0, 0.35),
        inset 0 -1px 0 rgba(255, 255, 255, 0.04);
    }
    .widget-workspaces .tag {
      min-width: 1.3em;
      height: calc(var(--chip-height) - 6px);
      padding: 0 0.25em;
      border: none;
      border-radius: calc((var(--chip-height) - 6px) / 2);
      background: transparent;
      color: var(--bar-fg-dim);
      font: inherit;
      font-variant-numeric: tabular-nums;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease;
    }
    .widget-workspaces .tag:hover { background: var(--chip-bg-hover); }
    .widget-workspaces .tag.empty { color: rgba(255, 255, 255, 0.25); }
    .widget-workspaces .tag.occupied { color: var(--bar-fg); }
    .widget-workspaces .tag.visible,
    .widget-workspaces .tag.focused-elsewhere {
      color: var(--bar-fg);
      background: var(--chip-bg-hover);
    }
    .widget-workspaces .tag.focused {
      color: #10121a;
      background: var(--accent);
      font-weight: 700;
    }
    .widget-workspaces .tag.urgent {
      color: #10121a;
      background: var(--critical);
      font-weight: 700;
      animation: divebar-urgent-pulse 1.6s ease-in-out infinite;
    }
    @keyframes divebar-urgent-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(247, 118, 142, 0); filter: brightness(1); }
      50%      { box-shadow: 0 0 8px 1px rgba(247, 118, 142, 0.55); filter: brightness(1.18); }
    }
  `,
  settings: [
    {
      key: "labels",
      label: "Tag labels",
      type: "select",
      choices: ["numbers", "names"],
      default: "numbers",
    },
  ],
  create({ options, onEvent, invoke }) {
    const el = document.createElement("div");
    el.className = "widget-workspaces";

    const unsubscribe = onEvent("divebar://hlwm", ({ tags }) => {
      if (!tags) return;
      // Rebuild only when the tag list changes; otherwise just update classes.
      const buttons = el.querySelectorAll(".tag");
      const sameTags =
        buttons.length === tags.length &&
        tags.every((tag, i) => buttons[i].dataset.tag === tag.name);

      if (!sameTags) {
        el.replaceChildren(
          ...tags.map((tag, i) => {
            const btn = document.createElement("button");
            btn.className = "tag";
            btn.dataset.tag = tag.name;
            // Position number by default; the name is always used for
            // switching and shown as a tooltip.
            btn.textContent =
              options.labels === "names" ? tag.name : String(i + 1);
            btn.title = tag.name;
            btn.addEventListener("click", () =>
              invoke("hlwm_use_tag", { tag: tag.name }),
            );
            return btn;
          }),
        );
      }
      el.querySelectorAll(".tag").forEach((btn, i) => {
        btn.className = `tag ${tags[i].state}`;
      });
    });

    return { el, destroy: unsubscribe };
  },
};
