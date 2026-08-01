// System tray: StatusNotifierItem icons hosted by the backend over D-Bus
// (divebar://tray events). Left click activates the app, middle click
// sends the secondary activation, right click opens the item's dbusmenu
// as a pop-down. Hides itself when there are no items. Legacy XEmbed-only
// tray apps are not supported.

import { openTrayMenu } from "../lib/menu-popup.js";

export default {
  name: "tray",
  css: `
    .widget-tray {
      display: none;
      align-items: center;
      gap: 4px;
      height: var(--chip-height);
      padding: 0 calc(var(--chip-height) * 0.2);
      border-radius: var(--chip-radius);
    }
    .widget-tray.has-items { display: flex; }
    .widget-tray .tray-item {
      display: flex;
      align-items: center;
      justify-content: center;
      width: calc(var(--chip-height) - 8px);
      height: calc(var(--chip-height) - 8px);
      border: none;
      padding: 0;
      border-radius: 6px;
      background: transparent;
      cursor: pointer;
      transition: background 120ms ease;
    }
    .widget-tray .tray-item:hover { background: var(--chip-bg-hover); }
    .widget-tray .tray-item img {
      width: calc(var(--chip-height) * 0.62);
      height: calc(var(--chip-height) * 0.62);
    }
    .widget-tray .tray-item.needs-attention {
      background: rgba(247, 118, 142, 0.25);
    }
    .widget-tray .tray-item .fallback {
      font-size: calc(var(--bar-font) * 0.7);
      color: var(--bar-fg-dim);
      font-weight: 700;
    }
  `,
  create({ onEvent, invoke }) {
    const el = document.createElement("div");
    el.className = "widget-tray";
    let knownAddresses = new Set();
    let seenFirst = false;

    function activate(item, e, secondary) {
      invoke("tray_activate", {
        address: item.address,
        secondary,
        x: Math.round(e.screenX),
        y: Math.round(e.screenY),
      }).catch((err) => console.error("divebar: tray_activate failed", err));
    }

    const unsubscribe = onEvent("divebar://tray", (items) => {
      if (!Array.isArray(items)) items = [];
      el.classList.toggle("has-items", items.length > 0);
      const isNew = (item) => seenFirst && !knownAddresses.has(item.address);
      knownAddresses = new Set(items.map((i) => i.address));
      seenFirst = true;
      el.replaceChildren(
        ...items.map((item) => {
          const btn = document.createElement("button");
          btn.className = "tray-item";
          btn.title = item.title || item.id;
          btn.classList.toggle(
            "needs-attention",
            item.status === "NeedsAttention",
          );
          if (item.icon) {
            const img = document.createElement("img");
            img.src = item.icon;
            btn.appendChild(img);
          } else {
            // No resolvable icon: show the app's initial.
            const span = document.createElement("span");
            span.className = "fallback";
            span.textContent = (item.id || "?")[0].toUpperCase();
            btn.appendChild(span);
          }
          btn.addEventListener("click", (e) => activate(item, e, false));
          btn.addEventListener("auxclick", (e) => {
            if (e.button === 1) activate(item, e, true);
          });
          if (isNew(item)) {
            btn.animate(
              [
                { opacity: 0, transform: "scale(0.4)" },
                { opacity: 1, transform: "none" },
              ],
              { duration: 180, easing: "cubic-bezier(0.34, 1.4, 0.64, 1)" },
            );
          }
          btn.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation(); // don't open divebar settings
            if (item.menu?.length && item.menuPath) {
              openTrayMenu({
                anchor: btn,
                invoke,
                address: item.address,
                menuPath: item.menuPath,
                items: item.menu,
              });
            }
          });
          return btn;
        }),
      );
    });

    return { el, destroy: unsubscribe };
  },
};
