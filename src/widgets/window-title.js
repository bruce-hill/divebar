// Focused window title. Expands to fill available space (flex-grow) and
// fades out at the edge when truncated. Shows the app's real icon
// (_NET_WM_ICON via the backend) and optionally the app name, strips the
// redundant " — AppName" suffix from titles, animates changes, and falls
// back to the current workspace name when nothing is focused.

// Strips trailing " — Mozilla Firefox" style suffixes when they contain
// the window class.
function stripAppSuffix(title, cls) {
  if (!cls) return title;
  const esc = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\s+[-—–|·]\\s+[^-—–|·]*${esc}[^-—–|·]*$`, "i");
  return title.replace(re, "");
}

const ENTER_ANIMATION = [
  { opacity: 0, transform: "translateY(3px)" },
  { opacity: 1, transform: "none" },
];

export default {
  name: "window-title",
  css: `
    .widget-window-title {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.5em;
      padding: 0 6px;
    }
    .widget-window-title .app-badge {
      display: none;
      align-items: center;
      gap: 0.5em;
      height: var(--chip-height);
      font-size: calc(var(--bar-font) * 0.72);
      font-weight: 600;
      letter-spacing: 0.02em;
      padding: 0 calc(var(--chip-height) * 0.3) 0 calc(var(--chip-height) * 0.18);
      border-radius: var(--chip-radius);
      white-space: nowrap;
      color: var(--bar-fg-dim);
    }
    .widget-window-title .app-badge .app-icon {
      display: none;
      width: calc(var(--chip-height) * 0.62);
      height: calc(var(--chip-height) * 0.62);
      border-radius: 4px;
    }
    /* No icon → even side padding */
    .widget-window-title .app-badge.no-icon {
      padding-left: calc(var(--chip-height) * 0.3);
    }
    /* Icon only → the text padding just adds a gap before the title */
    .widget-window-title .app-badge.no-name {
      padding: 0;
    }
    .widget-window-title .title-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      color: var(--bar-fg);
      font-weight: 500;
    }
    .widget-window-title .title-text.dim {
      color: var(--bar-fg-dim);
      font-weight: 400;
    }
    /* Truncation fades out instead of showing an ellipsis; side depends
       on text alignment. */
    .widget-window-title .title-text.fade-right {
      -webkit-mask-image: linear-gradient(to right, black calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, black calc(100% - 28px), transparent);
    }
    .widget-window-title .title-text.fade-left {
      -webkit-mask-image: linear-gradient(to left, black calc(100% - 28px), transparent);
      mask-image: linear-gradient(to left, black calc(100% - 28px), transparent);
    }
    .widget-window-title .title-text.fade-both {
      -webkit-mask-image: linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent);
      mask-image: linear-gradient(to right, transparent, black 28px, black calc(100% - 28px), transparent);
    }
  `,
  settings: [
    { key: "showAppIcon", label: "Show app icon", type: "boolean", default: true },
    { key: "showAppName", label: "Show app name", type: "boolean", default: false },
    {
      key: "align",
      label: "Text alignment",
      type: "select",
      choices: ["left", "center", "right"],
      default: "left",
    },
    {
      key: "font",
      label: "Font",
      type: "font",
      default: "", // empty = the bar's default font
    },
  ],
  create({ options, onEvent }) {
    const el = document.createElement("div");
    el.className = "widget-window-title";
    if (options.font) el.style.fontFamily = `"${options.font}"`;

    const badgeEl = document.createElement("span");
    badgeEl.className = "app-badge";
    const iconEl = document.createElement("img");
    iconEl.className = "app-icon";
    const nameEl = document.createElement("span");
    badgeEl.append(iconEl, nameEl);
    const textEl = document.createElement("span");
    textEl.className = "title-text";
    textEl.style.textAlign = options.align;
    textEl.classList.add(
      { left: "fade-right", right: "fade-left", center: "fade-both" }[
        options.align
      ] ?? "fade-right",
    );
    el.append(badgeEl, textEl);

    let lastClass = null;
    let lastWindowId = null;
    let seenFirst = false;

    const unsubscribe = onEvent(
      "divebar://hlwm",
      ({ windowId, windowTitle, windowClass, windowIcon, tags }) => {
        const cls = windowClass ?? "";
        // Animate only when focus moves to a different window — the same
        // window renaming itself (page loads, terminal titles) should
        // update the text quietly, or rapid renames flicker.
        const windowChanged = windowId !== lastWindowId;
        lastWindowId = windowId;
        let title = stripAppSuffix(windowTitle ?? "", cls).trim();
        const empty = !title && !cls;
        if (empty) {
          const tag = tags?.find?.((t) => t.state === "focused")?.name;
          title = tag ? `workspace ${tag}` : "";
        }

        textEl.classList.toggle("dim", empty);
        el.title = windowTitle ?? "";

        if (textEl.textContent !== title) {
          textEl.textContent = title;
          if (seenFirst && windowChanged) {
            for (const a of textEl.getAnimations()) a.cancel();
            textEl.animate(ENTER_ANIMATION, { duration: 140, easing: "ease-out" });
          }
        }

        const showIcon = options.showAppIcon && Boolean(windowIcon) && !empty;
        const showName = options.showAppName && Boolean(cls) && !empty;
        if (showIcon || showName) {
          nameEl.textContent = cls.toLowerCase();
          badgeEl.style.display = "flex";
          if (cls !== lastClass && seenFirst && windowChanged) {
            for (const a of badgeEl.getAnimations()) a.cancel();
            badgeEl.animate(ENTER_ANIMATION, { duration: 140, easing: "ease-out" });
          }
        } else {
          badgeEl.style.display = "none";
        }
        lastClass = cls;

        if (showIcon && iconEl.src !== windowIcon) iconEl.src = windowIcon;
        iconEl.style.display = showIcon ? "block" : "none";
        nameEl.style.display = showName ? "" : "none";
        badgeEl.classList.toggle("no-icon", !showIcon);
        badgeEl.classList.toggle("no-name", !showName);

        seenFirst = true;
      },
    );

    return { el, destroy: unsubscribe };
  },
};
