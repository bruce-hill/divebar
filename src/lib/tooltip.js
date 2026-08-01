// Custom tooltips for the bar. Native X11 tooltips are slow and
// GTK-themed; these render instantly in the popup space below the bar,
// styled like the other panels. Works by intercepting the standard
// `title` attribute on hover — widgets keep using el.title and get slick
// tooltips for free (the attribute is stashed to data-tip so the native
// one never shows).
//
// Claims the popup space as a yielding "tooltip" participant: denied
// while a popup is open, evicted the moment one opens. No dismissal
// chrome of its own beyond hover/pointerdown hiding.

import { claim, release } from "./coordinator.js";
import { centerUnder, animateIn } from "./panel.js";

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

export function initTooltips() {
  const style = document.createElement("style");
  style.dataset.lib = "tooltip";
  style.textContent = CSS;
  document.head.appendChild(style);

  let tipEl = null;
  let tipClaim = null;
  let showTimer = null;
  let currentTarget = null;

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
      release(tipClaim); // no-op if a popup evicted us and owns the shape
      tipClaim = null;
    }
  }

  function show(target, text) {
    tipEl?.remove();
    tipEl = document.createElement("div");
    tipEl.className = "dtooltip";
    tipEl.textContent = text;
    document.body.appendChild(tipEl);
    tipClaim = claim({
      el: tipEl,
      kind: "tooltip",
      place: (el) => centerUnder(el, target),
      onEvict: hide,
    });
    if (!tipClaim) {
      // A popup owns the space; yield.
      tipEl.remove();
      tipEl = null;
      return;
    }
    animateIn(tipEl, { dy: -4, duration: 120 });
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
