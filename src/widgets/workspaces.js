// herbstluftwm workspace (tag) switcher. Renders one button per tag from the
// `divebar://hlwm` event stream; clicking a tag switches to it.

export default {
  name: "workspaces",
  css: `
    .widget-workspaces {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 34px;
      padding: 0 3px;
      border-radius: 17px;
      background: var(--chip-bg);
    }
    .widget-workspaces .tag {
      min-width: 26px;
      height: 28px;
      padding: 0 5px;
      border: none;
      border-radius: 14px;
      background: transparent;
      color: var(--bar-fg-dim);
      font: inherit;
      font-size: 18px;
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
    }
  `,
  create({ onEvent, invoke }) {
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
            // Show the tag's position number; the name is still used for
            // switching and shown as a tooltip.
            btn.textContent = String(i + 1);
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
