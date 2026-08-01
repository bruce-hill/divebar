// Drives createPopup through its interface: a fake invoke behind the
// Coordinator records the set_popup_open traffic, fake timers drive the
// pointer-leave close path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPopup } from "../src/lib/popup.js";
import { initCoordinator, claim, release } from "../src/lib/coordinator.js";

function fakeInvoke() {
  const invoke = vi.fn(() => Promise.resolve());
  invoke.shapeCalls = () =>
    invoke.mock.calls
      .filter(([cmd]) => cmd === "set_popup_open")
      .map(([, args]) => args);
  return invoke;
}

function makeAnchor() {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  return anchor;
}

const flushMicrotasks = () => Promise.resolve();

let invoke;

beforeEach(() => {
  vi.useFakeTimers();
  invoke = fakeInvoke();
  initCoordinator(invoke);
});

afterEach(async () => {
  // Leave the popup space empty for the next test.
  initCoordinator(() => Promise.resolve());
  release(claim({ el: document.createElement("div"), kind: "popup" }));
  vi.useRealTimers();
  await flushMicrotasks();
  document.body.replaceChildren();
});

describe("createPopup", () => {
  it("open() renders the body into a .dpanel and widens the shape", () => {
    const render = vi.fn((el, greeting) => {
      el.textContent = greeting;
    });
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render,
    });

    expect(popup.isOpen()).toBe(false);
    popup.open("hello");

    expect(popup.isOpen()).toBe(true);
    const el = document.querySelector(".dpanel.dtest");
    expect(el).not.toBeNull();
    expect(el.textContent).toBe("hello");
    expect(render).toHaveBeenCalledOnce();
    expect(invoke.shapeCalls()).toEqual([
      { open: true, rect: { x: 0, y: 0, width: 0, height: 0 } },
    ]);

    // Re-opening while open is a no-op.
    popup.open("again");
    expect(render).toHaveBeenCalledOnce();
  });

  it("close() removes the panel and shrinks the shape", async () => {
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render: () => {},
    });

    popup.open();
    popup.close();

    expect(popup.isOpen()).toBe(false);
    expect(invoke.shapeCalls().at(-1)).toEqual({ open: false, rect: null });
    await flushMicrotasks(); // out-animation finishes
    expect(document.querySelector(".dpanel")).toBeNull();
  });

  it("toggle() forwards args to render and round-trips", () => {
    const render = vi.fn();
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render,
    });

    popup.toggle("a", "b");
    expect(render).toHaveBeenCalledWith(expect.anything(), "a", "b");
    popup.toggle();
    expect(popup.isOpen()).toBe(false);
  });

  it("a pointerdown outside closes; inside the popup or anchor does not", () => {
    const anchor = makeAnchor();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const popup = createPopup({
      anchor,
      className: "dtest",
      render: () => {},
    });

    popup.open();
    const el = document.querySelector(".dpanel");
    el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    anchor.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.isOpen()).toBe(true);

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(popup.isOpen()).toBe(false);
  });

  it("closes when the pointer leaves for longer than leaveDelay", () => {
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render: () => {},
      leaveDelay: 700,
    });

    popup.open();
    const el = document.querySelector(".dpanel");

    el.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(600);
    expect(popup.isOpen()).toBe(true);

    // Coming back disarms the timer entirely.
    el.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(2000);
    expect(popup.isOpen()).toBe(true);

    el.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(700);
    expect(popup.isOpen()).toBe(false);
  });

  it("holdOpen re-arms the leave timer instead of closing", () => {
    let dragging = true;
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render: () => {},
      leaveDelay: 700,
      holdOpen: () => dragging,
    });

    popup.open();
    document.querySelector(".dpanel").dispatchEvent(new Event("pointerleave"));

    vi.advanceTimersByTime(2100); // three timer rounds, all held open
    expect(popup.isOpen()).toBe(true);

    dragging = false;
    vi.advanceTimersByTime(700);
    expect(popup.isOpen()).toBe(false);
  });

  it("onClose fires however the popup closes", () => {
    const onClose = vi.fn();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render: () => {},
      onClose,
    });

    popup.open();
    popup.close();
    expect(onClose).toHaveBeenCalledOnce();

    popup.open();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("opening a second popup closes the first (shared shape)", () => {
    const a = createPopup({
      anchor: makeAnchor(),
      className: "da",
      render: () => {},
    });
    const b = createPopup({
      anchor: makeAnchor(),
      className: "db",
      render: () => {},
    });

    a.open();
    b.open();
    expect(a.isOpen()).toBe(false);
    expect(b.isOpen()).toBe(true);
    // The eviction never shrank the shape b now owns.
    expect(invoke.shapeCalls().filter((s) => !s.open)).toHaveLength(0);
  });

  it("a content resize re-sends the shape while open, and not after close", () => {
    const popup = createPopup({
      anchor: makeAnchor(),
      className: "dtest",
      render: () => {},
    });

    popup.open();
    ResizeObserver.trigger();
    expect(invoke.shapeCalls().filter((s) => s.open)).toHaveLength(2);

    popup.close();
    ResizeObserver.trigger();
    expect(invoke.shapeCalls().at(-1)).toEqual({ open: false, rect: null });
  });
});

describe("popup library callers", () => {
  it("all popup-space modules import cleanly against the new seam", async () => {
    await import("../src/lib/slider-popup.js");
    await import("../src/lib/menu-popup.js");
    await import("../src/lib/calendar-popup.js");
    await import("../src/lib/tooltip.js");
  });
});
