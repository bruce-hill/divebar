// In-place layout editing on the real bar. While active, widget
// interactions are suppressed: dragging a widget reorders it live, a ✕
// badge on each widget removes it, and a pop-down toolbar under the bar
// offers "＋ Add widget" (inline picker) and "Done". Every change saves
// through save_config, so the bar re-renders itself via the usual
// divebar://config round trip — the host calls refresh() after each
// re-render to re-decorate the (possibly new) widget elements.

import WIDGET_NAMES from "../widgets/index.js";
import { createPopup } from "./popup.js";

const CSS = `
  .layout-editing #bar > * {
    position: relative;
    cursor: grab;
    outline: 1px dashed rgba(255, 255, 255, 0.28);
    outline-offset: 2px;
    border-radius: var(--chip-radius);
  }
  .layout-editing #bar > .layout-dragging {
    opacity: 0.55;
    outline: 2px solid var(--accent);
  }
  /* Spacers are invisible and can collapse to zero width; keep them
     grabbable while editing. */
  .layout-editing .widget-spacer { min-width: var(--chip-height); }
  .layout-x {
    position: absolute;
    top: -3px;
    right: -3px;
    z-index: 5;
    width: 16px;
    height: 16px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--critical);
    color: #10121a;
    font-size: 10px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .layout-toolbar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    font-family: var(--font);
    font-size: calc(var(--bar-font) * 0.8);
    color: var(--bar-fg);
  }
  .layout-hint { color: var(--bar-fg-dim); text-align: center; }
  .layout-buttons { display: flex; gap: 8px; justify-content: center; }
  .layout-toolbar button {
    font: inherit;
    color: var(--bar-fg);
    background: var(--chip-bg);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 5px 12px;
    cursor: pointer;
  }
  .layout-toolbar button:hover { background: var(--chip-bg-hover); }
  .layout-toolbar button.primary {
    background: var(--accent);
    border-color: transparent;
    color: #10121a;
    font-weight: 600;
  }
  .layout-add-menu {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    /* The window is only POPUP_SPACE (320px) tall below the bar. */
    max-height: 200px;
    overflow-y: auto;
  }
  .layout-add-menu:empty { display: none; }
  .layout-add-menu button { text-align: left; }
`;

let stylesInjected = false;

// The sibling the dragged element should sit in front of at pointer
// position x, or null to move it to the end of the bar.
export function reorderTarget(barEl, draggedEl, x) {
  for (const child of barEl.children) {
    if (child === draggedEl) continue;
    const r = child.getBoundingClientRect();
    if (x < r.left + r.width / 2) return child;
  }
  return null;
}

// getConfig() returns the live config object; entryFor(el) maps a bar
// child element back to its config.widgets entry (both provided by
// main.js, which owns the mounted-widget bookkeeping).
export function createLayoutEditor({ barEl, invoke, getConfig, entryFor }) {
  let active = false;
  let toolbar = null;
  let drag = null; // { el, startX, moved }

  function save(widgets) {
    const config = { ...getConfig(), widgets };
    invoke("save_config", { config }).catch((err) =>
      console.error("divebar: save_config failed", err),
    );
  }

  function widgetsInDomOrder() {
    return [...barEl.children].map(entryFor).filter(Boolean);
  }

  function removeWidget(el) {
    save([...barEl.children].filter((c) => c !== el).map(entryFor).filter(Boolean));
  }

  // ✕ badge on every widget that doesn't have one yet (re-renders keep
  // existing widget elements, so this is idempotent per element).
  function decorate() {
    for (const widgetEl of barEl.children) {
      if (widgetEl.querySelector(":scope > .layout-x")) continue;
      const x = document.createElement("button");
      x.className = "layout-x";
      x.textContent = "✕";
      x.title = "Remove";
      x.addEventListener("click", () => removeWidget(widgetEl));
      widgetEl.append(x);
    }
  }

  // --- Drag to reorder -------------------------------------------------

  function onPointerDown(e) {
    if (!barEl.contains(e.target) || e.target.closest(".layout-x")) return;
    // Swallow the event so the widget under the pointer never reacts.
    e.preventDefault();
    e.stopPropagation();
    if (e.button !== 0) return;
    const el = [...barEl.children].find((c) => c.contains(e.target));
    if (!el) return;
    drag = { el, startX: e.clientX, moved: false };
    // Keep receiving moves even when the pointer leaves the window.
    try {
      barEl.setPointerCapture?.(e.pointerId);
    } catch {
      /* no pointer capture in this environment */
    }
  }

  function onPointerMove(e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.startX) < 5) return;
      drag.moved = true;
      drag.el.classList.add("layout-dragging");
    }
    // Reorder live: the dragged widget snaps into the slot under the
    // pointer, so the bar always previews the drop result.
    const before = reorderTarget(barEl, drag.el, e.clientX);
    if (before !== drag.el.nextElementSibling) barEl.insertBefore(drag.el, before);
  }

  function onPointerUp() {
    if (!drag) return;
    const { el, moved } = drag;
    drag = null;
    el.classList.remove("layout-dragging");
    if (moved) save(widgetsInDomOrder());
  }

  // --- Suppress normal widget interactions -----------------------------

  function onClick(e) {
    if (!barEl.contains(e.target) || e.target.closest(".layout-x")) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onWheel(e) {
    if (!barEl.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
  }

  function onContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") stop();
  }

  // --- Toolbar ---------------------------------------------------------

  function button(label, className = "") {
    const b = document.createElement("button");
    if (className) b.className = className;
    b.textContent = label;
    return b;
  }

  function buildToolbar() {
    return createPopup({
      anchor: barEl,
      invoke,
      className: "layout-toolbar",
      holdOpen: () => true, // never auto-close on pointer-leave
      onClose: teardown,
      render(el) {
        const hint = document.createElement("div");
        hint.className = "layout-hint";
        hint.textContent = "Drag widgets to rearrange · ✕ removes";

        const buttons = document.createElement("div");
        buttons.className = "layout-buttons";
        const add = button("＋ Add widget");
        const done = button("Done", "primary");

        const menu = document.createElement("div");
        menu.className = "layout-add-menu";
        add.addEventListener("click", () => {
          if (menu.childElementCount > 0) {
            menu.replaceChildren();
            return;
          }
          for (const name of [...WIDGET_NAMES].sort()) {
            const item = button(name);
            item.addEventListener("click", () => {
              menu.replaceChildren();
              save([...widgetsInDomOrder(), { widget: name, options: {} }]);
            });
            menu.append(item);
          }
        });
        done.addEventListener("click", () => stop());

        buttons.append(add, done);
        el.append(hint, buttons, menu);
      },
    });
  }

  // --- Lifecycle -------------------------------------------------------

  const interceptors = [
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerUp],
    ["click", onClick],
    ["wheel", onWheel],
    ["contextmenu", onContextMenu],
    ["keydown", onKeyDown],
  ];

  function start() {
    if (active) return;
    if (!stylesInjected) {
      stylesInjected = true;
      const style = document.createElement("style");
      style.dataset.lib = "layout-edit";
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    active = true;
    document.documentElement.classList.add("layout-editing");
    for (const [name, fn] of interceptors) {
      document.addEventListener(name, fn, { capture: true, passive: false });
    }
    decorate();
    toolbar = buildToolbar();
    toolbar.open();
  }

  // Runs when the toolbar closes by any path (Done, Escape, click-away).
  function teardown() {
    if (!active) return;
    active = false;
    toolbar = null;
    drag = null;
    document.documentElement.classList.remove("layout-editing");
    for (const [name, fn] of interceptors) {
      document.removeEventListener(name, fn, { capture: true });
    }
    for (const x of barEl.querySelectorAll(".layout-x")) x.remove();
  }

  function stop() {
    toolbar?.close(); // close → onClose → teardown
  }

  return {
    start,
    stop,
    isActive: () => active,
    // Re-decorate after the bar re-renders (new widgets need badges).
    refresh() {
      if (active) decorate();
    },
  };
}
