// herbstluftwm workspace (tag) switcher. Renders one button per tag from the
// `divebar://hlwm` event stream; clicking a tag switches to it.

export default {
  name: "workspaces",
  css: `
    .widget-workspaces {
      position: relative;
      display: flex;
      align-items: center;
      gap: 2px;
      height: var(--chip-height);
      padding: 0 3px;
      border-radius: var(--chip-radius);
      background: var(--chip-bg);
    }
    /* Accent pill that glides between tags instead of teleporting. */
    .widget-workspaces .tag-indicator {
      position: absolute;
      top: 3px;
      bottom: 3px;
      border-radius: calc((var(--chip-height) - 6px) / 2);
      background: var(--accent);
      opacity: 0;
      transition:
        left 220ms cubic-bezier(0.45, 0, 0.2, 1),
        width 220ms cubic-bezier(0.45, 0, 0.2, 1),
        opacity 150ms ease;
    }
    .widget-workspaces .tag {
      position: relative;
      z-index: 1;
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
      font-weight: 700;
    }
    .widget-workspaces .tag.urgent {
      color: #10121a;
      background: var(--critical);
      font-weight: 700;
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
    const indicator = document.createElement("div");
    indicator.className = "tag-indicator";
    el.appendChild(indicator);

    let positioned = false;

    function moveIndicator() {
      // rAF so offsets are valid after (re)mounting or rebuilding.
      requestAnimationFrame(() => {
        const focused = el.querySelector(".tag.focused");
        if (!focused) {
          indicator.style.opacity = "0";
          return;
        }
        // Jump (no glide) into the first position after mount.
        if (!positioned) {
          indicator.style.transition = "none";
          requestAnimationFrame(() => (indicator.style.transition = ""));
          positioned = true;
        }
        indicator.style.left = `${focused.offsetLeft}px`;
        indicator.style.width = `${focused.offsetWidth}px`;
        indicator.style.opacity = "1";
      });
    }

    const unsubscribe = onEvent("divebar://hlwm", ({ tags }) => {
      if (!tags) return;
      // Rebuild only when the tag list changes; otherwise just update classes.
      const buttons = el.querySelectorAll(".tag");
      const sameTags =
        buttons.length === tags.length &&
        tags.every((tag, i) => buttons[i].dataset.tag === tag.name);

      if (!sameTags) {
        el.replaceChildren(
          indicator,
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
        positioned = false;
      }
      el.querySelectorAll(".tag").forEach((btn, i) => {
        btn.className = `tag ${tags[i].state}`;
      });
      moveIndicator();
    });

    return { el, destroy: unsubscribe };
  },
};
