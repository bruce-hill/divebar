// Drives the meter toolkit (peek, ticker, segment fill) through its
// interfaces with fake timers and a spied animate.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  METER_SETTINGS,
  meterValueCss,
  makePeek,
  makeValueTicker,
  segmentFill,
} from "../src/lib/meter.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("makePeek", () => {
  it("reveals the value and re-collapses after the delay", () => {
    const el = document.createElement("div");
    el.classList.add("compact");
    const peek = makePeek(el);

    peek.show();
    expect(el.classList.contains("compact")).toBe(false);
    vi.advanceTimersByTime(2500);
    expect(el.classList.contains("compact")).toBe(true);
  });

  it("another change extends the reveal instead of collapsing early", () => {
    const el = document.createElement("div");
    const peek = makePeek(el);

    peek.show();
    vi.advanceTimersByTime(2000);
    peek.show(); // change arrives while revealed
    vi.advanceTimersByTime(2000);
    expect(el.classList.contains("compact")).toBe(false);
    vi.advanceTimersByTime(500);
    expect(el.classList.contains("compact")).toBe(true);
  });

  it("cancel() stops the pending collapse", () => {
    const el = document.createElement("div");
    const peek = makePeek(el);

    peek.show();
    peek.cancel();
    vi.advanceTimersByTime(10000);
    expect(el.classList.contains("compact")).toBe(false);
  });
});

describe("makeValueTicker", () => {
  function makeValueEl() {
    const valueEl = document.createElement("span");
    valueEl.animate = vi.fn();
    return valueEl;
  }

  it("sets the text without animating when unchanged", () => {
    const valueEl = makeValueEl();
    const ticker = makeValueTicker(valueEl);
    ticker.update(50, false);
    expect(valueEl.textContent).toBe("50%");
    expect(valueEl.animate).not.toHaveBeenCalled();
  });

  it("animates direction-aware on change", () => {
    const valueEl = makeValueEl();
    const ticker = makeValueTicker(valueEl);
    ticker.update(50, false);
    ticker.update(60, true); // up
    expect(valueEl.animate).toHaveBeenCalledOnce();
    expect(valueEl.animate.mock.calls[0][0][0].transform).toBe("translateY(5px)");
    ticker.update(40, true); // down
    expect(valueEl.animate.mock.calls[1][0][0].transform).toBe("translateY(-5px)");
    expect(valueEl.textContent).toBe("40%");
  });

  it("skips the animation when the text would not change", () => {
    const valueEl = makeValueEl();
    const ticker = makeValueTicker(valueEl);
    ticker.update(50, false);
    ticker.update(50, true); // changed flag set, but same rendered text
    expect(valueEl.animate).not.toHaveBeenCalled();
  });
});

describe("segmentFill", () => {
  const opacities = (els) => els.map((el) => Number(el.style.opacity));

  it("fades each element across its own slice of the range", () => {
    const els = [1, 2, 3].map(() => document.createElement("i"));
    segmentFill(els, 50, 0.15);
    // Slice = 33.3: first full, second halfway, third at the floor.
    expect(opacities(els)[0]).toBeCloseTo(1.0, 2);
    expect(opacities(els)[1]).toBeCloseTo(0.575, 2);
    expect(opacities(els)[2]).toBeCloseTo(0.15, 2);
  });

  it("full and empty values hit the bounds", () => {
    const els = [1, 2, 3, 4].map(() => document.createElement("i"));
    segmentFill(els, 100, 0.3);
    expect(opacities(els)).toEqual([1, 1, 1, 1]);
    segmentFill(els, 0, 0.3);
    expect(opacities(els)).toEqual([0.3, 0.3, 0.3, 0.3]);
  });
});

describe("shared schema and CSS", () => {
  it("exposes the showPercent/peekOnChange settings pair", () => {
    expect(METER_SETTINGS.map((s) => s.key)).toEqual([
      "showPercent",
      "peekOnChange",
    ]);
  });

  it("scopes the value CSS to the given widget class", () => {
    const css = meterValueCss("widget-volume");
    expect(css).toContain(".widget-volume .value");
    expect(css).toContain(".widget-volume.compact .value");
  });
});
