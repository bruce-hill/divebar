// Custom tooltips for the bar. Native X11 tooltips are slow and
// GTK-themed; these render instantly in the popup space below the bar,
// styled like the other panels. Works by intercepting the standard
// `title` attribute on hover — widgets keep using el.title and get slick
// tooltips for free (the attribute is stashed to data-tip so the native
// one never shows).
//
// Not a popup (no dismissal, no coordinator slot — it yields to real
// popups instead), but it shares the panel mechanics from panel.js.

import { hasOpenPopup } from "./popup-state.js";
import { centerUnder, animateIn, sendShape, clearShape } from "./panel.js";

const SHOW_DELAY_MS = 350;

const CSS = `
  .dtooltip {
    position: fixed;
    top: calc(var(--bar-height) + 4px);
    max-width: 420px;
    padding: 7px 12px;
    background: var(--bar-bg);
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 9px;
    box-shadow: 0 8px 22px rgba(0, 0, 0, 0.45);
    color: var(--bar-fg);
    font-family: var(--font);
    font-size: calc(var(--bar-font) * 0.78);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    z-index: 20;
    pointer-events: none;
  }
  :root.no-compositor .dtooltip {
    box-shadow: none;
    top: var(--bar-height);
    border-radius: 0 0 9px 9px;
  }
`;

export function initTooltips(invoke) {
  const style = document.createElement("style");
  style.dataset.lib = "tooltip";
  style.textContent = CSS;
  document.head.appendChild(style);

  let tipEl = null;
  let showTimer = null;
  let currentTarget = null;
  let shapeOpen = false;

  // Widgets re-set el.title on every data refresh; keep stashing it while
  // hovered so the native tooltip never appears, and live-update ours.
  const titleObserver = new MutationObserver(() => {
    if (currentTarget) stash(currentTarget);
  });

  function stash(target) {
    if (target.title) {
      target.dataset.tip = target.title;
      target.removeAttribute("title");
      if (tipEl && currentTarget === target) {
        tipEl.textContent = target.dataset.tip;
      }
    }
  }

  function hide() {
    if (showTimer) clearTimeout(showTimer);
    showTimer = null;
    currentTarget = null;
    titleObserver.disconnect();
    if (tipEl) {
      tipEl.remove();
      tipEl = null;
      // Don't shrink the shape if a real popup owns it now.
      if (shapeOpen && !hasOpenPopup()) clearShape(invoke);
      shapeOpen = false;
    }
  }

  function show(target, text) {
    if (hasOpenPopup()) return;
    tipEl?.remove();
    tipEl = document.createElement("div");
    tipEl.className = "dtooltip";
    tipEl.textContent = text;
    document.body.appendChild(tipEl);
    centerUnder(tipEl, target);
    animateIn(tipEl, { dy: -4, duration: 120 });
    shapeOpen = true;
    sendShape(invoke, tipEl);
  }

  document.addEventListener("pointerover", (e) => {
    const target = e.target.closest?.("[title], [data-tip]");
    if (!target || target === currentTarget) return;
    hide();
    currentTarget = target;
    stash(target);
    titleObserver.observe(target, { attributes: true, attributeFilter: ["title"] });
    showTimer = setTimeout(() => {
      const text = target.dataset.tip;
      if (text) show(target, text);
    }, SHOW_DELAY_MS);
  });

  document.addEventListener("pointerout", (e) => {
    if (currentTarget && !currentTarget.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("pointerdown", hide, true);
}
