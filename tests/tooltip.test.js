// Drives the tooltip through real pointer events: title interception, the
// show delay, live updates while hovered, and yielding to popup claims.

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { initTooltips } from "../src/lib/tooltip.js";
import { initCoordinator, claim, release } from "../src/lib/coordinator.js";

function fakeInvoke() {
  const invoke = vi.fn(() => Promise.resolve());
  invoke.shapeCalls = () =>
    invoke.mock.calls
      .filter(([cmd]) => cmd === "set_popup_open")
      .map(([, args]) => args);
  return invoke;
}

const ZERO_RECT = { x: 0, y: 0, width: 0, height: 0 };
const SHOW_DELAY = 350;

let invoke;

beforeAll(() => {
  initTooltips(); // installs document-level listeners once
});

beforeEach(() => {
  vi.useFakeTimers();
  invoke = fakeInvoke();
  initCoordinator(invoke);
});

afterEach(() => {
  document.dispatchEvent(new Event("pointerdown")); // hide any tooltip
  initCoordinator(() => Promise.resolve());
  release(claim({ el: document.createElement("div"), kind: "popup" }));
  vi.useRealTimers();
  document.body.replaceChildren();
});

function makeChip(title) {
  const el = document.createElement("div");
  el.title = title;
  document.body.appendChild(el);
  return el;
}

function hover(el) {
  el.dispatchEvent(new Event("pointerover", { bubbles: true }));
}

function unhover(el) {
  el.dispatchEvent(new MouseEvent("pointerout", { bubbles: true }));
}

describe("initTooltips", () => {
  it("stashes the title on hover and shows after the delay", () => {
    const el = makeChip("hello");
    hover(el);

    // Title intercepted immediately so the native tooltip never shows.
    expect(el.hasAttribute("title")).toBe(false);
    expect(el.dataset.tip).toBe("hello");
    expect(document.querySelector(".dtooltip")).toBeNull();

    vi.advanceTimersByTime(SHOW_DELAY);

    expect(document.querySelector(".dtooltip").textContent).toBe("hello");
    expect(invoke.shapeCalls()).toEqual([{ open: true, rect: ZERO_RECT }]);
  });

  it("live-updates the tooltip when the title is re-set while hovered", async () => {
    const el = makeChip("old");
    hover(el);
    vi.advanceTimersByTime(SHOW_DELAY);

    el.title = "new";
    await Promise.resolve(); // MutationObserver delivery

    expect(el.dataset.tip).toBe("new");
    expect(document.querySelector(".dtooltip").textContent).toBe("new");
  });

  it("hides on pointerout and shrinks the shape", () => {
    const el = makeChip("hello");
    hover(el);
    vi.advanceTimersByTime(SHOW_DELAY);

    unhover(el);

    expect(document.querySelector(".dtooltip")).toBeNull();
    expect(invoke.shapeCalls().at(-1)).toEqual({ open: false, rect: null });
  });

  it("does not show while a popup holds the space", () => {
    const popupEl = document.createElement("div");
    document.body.appendChild(popupEl);
    const popup = claim({ el: popupEl, kind: "popup" });

    const el = makeChip("hello");
    hover(el);
    vi.advanceTimersByTime(SHOW_DELAY);

    expect(document.querySelector(".dtooltip")).toBeNull();
    // The yield must not shrink the shape the popup owns.
    expect(invoke.shapeCalls().filter((s) => !s.open)).toHaveLength(0);
    release(popup);
  });

  it("is evicted when a popup claims the space, leaving the popup's shape intact", () => {
    const el = makeChip("hello");
    hover(el);
    vi.advanceTimersByTime(SHOW_DELAY);
    expect(document.querySelector(".dtooltip")).not.toBeNull();

    const popupEl = document.createElement("div");
    document.body.appendChild(popupEl);
    claim({ el: popupEl, kind: "popup" });

    expect(document.querySelector(".dtooltip")).toBeNull();
    expect(invoke.shapeCalls().at(-1)).toEqual({ open: true, rect: ZERO_RECT });
    expect(invoke.shapeCalls().filter((s) => !s.open)).toHaveLength(0);
  });
});
