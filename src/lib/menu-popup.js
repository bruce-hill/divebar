// Pop-down context menu for tray items (rendered dbusmenu). Popup
// mechanics live in popup.js; this module renders the item tree.
// Submenus expand inline; clicking a leaf item forwards to the app via
// the tray_menu_click command.

import { createPopup } from "./popup.js";

const CSS = `
  .dmenu {
    min-width: 200px;
    max-width: 340px;
    max-height: 290px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 6px;
    font-size: calc(var(--bar-font) * 0.85);
  }
  .dmenu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--bar-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dmenu-item:hover:not(:disabled) { background: var(--chip-bg-hover); }
  .dmenu-item:disabled { color: var(--bar-fg-dim); opacity: 0.6; cursor: default; }
  .dmenu-item .check { width: 1.1em; flex: none; color: var(--accent); }
  .dmenu-item .arrow { margin-left: auto; color: var(--bar-fg-dim); font-size: 0.8em; }
  .dmenu-sep { height: 1px; background: rgba(255, 255, 255, 0.09); margin: 4px 8px; flex: none; }
  .dmenu-sub { display: none; flex-direction: column; padding-left: 16px; }
  .dmenu-sub.open { display: flex; }
`;

let stylesInjected = false;

// dbusmenu labels use "_" as an access-key marker and "__" as a literal
// underscore.
function cleanLabel(label) {
  return (label ?? "")
    .replaceAll("__", "\u0000")
    .replaceAll("_", "")
    .replaceAll("\u0000", "_");
}

export function openTrayMenu({ anchor, invoke, address, menuPath, items }) {
  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.dataset.lib = "menu-popup";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  const popup = createPopup({
    anchor,
    className: "dmenu",
    render(el) {
      buildItems(el, items);
    },
  });

  function pick(id) {
    invoke("tray_menu_click", { address, menuPath, id }).catch((err) =>
      console.error("divebar: tray_menu_click failed", err),
    );
    popup.close();
  }

  function buildItems(container, list) {
    for (const item of list ?? []) {
      if (item.type === "separator") {
        const sep = document.createElement("div");
        sep.className = "dmenu-sep";
        container.append(sep);
        continue;
      }
      const btn = document.createElement("button");
      btn.className = "dmenu-item";
      btn.disabled = item.enabled === false;
      const check = document.createElement("span");
      check.className = "check";
      check.textContent = item.checked === true ? "✓" : "";
      const label = document.createElement("span");
      label.textContent = cleanLabel(item.label);
      btn.append(check, label);

      if (item.children?.length) {
        const arrow = document.createElement("span");
        arrow.className = "arrow";
        arrow.textContent = "▸";
        btn.append(arrow);
        const sub = document.createElement("div");
        sub.className = "dmenu-sub";
        buildItems(sub, item.children);
        btn.addEventListener("click", () => {
          sub.classList.toggle("open");
          arrow.textContent = sub.classList.contains("open") ? "▾" : "▸";
        });
        container.append(btn, sub);
      } else {
        btn.addEventListener("click", () => pick(item.id));
        container.append(btn);
      }
    }
  }

  popup.open();
}
