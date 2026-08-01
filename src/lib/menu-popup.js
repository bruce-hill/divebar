// Pop-down context menu for tray items (rendered dbusmenu). Renders in the
// transparent window space below the bar, like the slider popups, and
// shares the same input-region mechanics via set_popup_open. Submenus
// expand inline; clicking a leaf item forwards to the app via the
// tray_menu_click command.

import { popupWillOpen, popupDidClose } from "./popup-state.js";

const CSS = `
  .dmenu {
    position: fixed;
    top: calc(var(--bar-height) + 8px);
    min-width: 200px;
    max-width: 340px;
    max-height: 290px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 6px;
    background: var(--bar-bg);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
    font-family: var(--font);
    font-size: calc(var(--bar-font) * 0.85);
    z-index: 10;
  }
  :root.no-compositor .dmenu {
    border-radius: 0 0 14px 14px;
    box-shadow: none;
    top: var(--bar-height);
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

  const el = document.createElement("div");
  el.className = "dmenu";
  let closed = false;
  let leaveTimer = null;

  const disarm = () => {
    if (leaveTimer) clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  const arm = () => {
    disarm();
    leaveTimer = setTimeout(close, 900);
  };

  function onDocDown(e) {
    if (!el.contains(e.target) && !anchor.contains(e.target)) close();
  }

  function close() {
    if (closed) return;
    closed = true;
    disarm();
    document.removeEventListener("pointerdown", onDocDown, true);
    anchor.removeEventListener("pointerenter", disarm);
    anchor.removeEventListener("pointerleave", arm);
    const anim = el.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(-6px)" },
      ],
      { duration: 110, easing: "ease-in" },
    );
    anim.onfinish = () => el.remove();
    popupDidClose(close);
    invoke("set_popup_open", { open: false, rect: null }).catch((err) =>
      console.error("divebar: set_popup_open failed", err),
    );
  }

  function sendRect() {
    const r = el.getBoundingClientRect();
    invoke("set_popup_open", {
      open: true,
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
    }).catch((err) => console.error("divebar: set_popup_open failed", err));
  }

  function pick(id) {
    invoke("tray_menu_click", { address, menuPath, id }).catch((err) =>
      console.error("divebar: tray_menu_click failed", err),
    );
    close();
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
          sendRect(); // popup size changed; update the window shape
        });
        container.append(btn, sub);
      } else {
        btn.addEventListener("click", () => pick(item.id));
        container.append(btn);
      }
    }
  }

  buildItems(el, items);
  document.body.appendChild(el);
  el.animate(
    [
      { opacity: 0, transform: "translateY(-8px)" },
      { opacity: 1, transform: "none" },
    ],
    { duration: 150, easing: "ease-out" },
  );

  // Center under the anchor, clamped to the screen edges.
  const rect = anchor.getBoundingClientRect();
  const width = el.offsetWidth;
  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  el.style.left = `${left}px`;

  document.addEventListener("pointerdown", onDocDown, true);
  el.addEventListener("pointerenter", disarm);
  el.addEventListener("pointerleave", arm);
  anchor.addEventListener("pointerenter", disarm);
  anchor.addEventListener("pointerleave", arm);

  popupWillOpen(close);
  sendRect();
}
