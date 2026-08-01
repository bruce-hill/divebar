// createSettingInput turns one settings-schema entry into a form
// control that reports coerced values through onChange. Both the
// settings window and the bar's right-click popup trust this contract.

import { describe, it, expect, vi } from "vitest";
import { createSettingInput } from "../src/lib/setting-inputs.js";

function make(schema, current, { invoke } = {}) {
  const onChange = vi.fn();
  const el = createSettingInput(schema, current, {
    invoke: invoke ?? (() => Promise.resolve(null)),
    onChange,
  });
  document.body.appendChild(el);
  return { el, onChange };
}

function fireChange(input) {
  input.dispatchEvent(new Event("change"));
}

describe("createSettingInput", () => {
  it("boolean renders a checkbox and reports toggles", () => {
    const { el, onChange } = make({ type: "boolean", key: "x" }, true);
    expect(el.type).toBe("checkbox");
    expect(el.checked).toBe(true);
    el.checked = false;
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("select renders the choices and reports the picked one", () => {
    const { el, onChange } = make(
      { type: "select", key: "x", choices: ["a", "b"] },
      "b",
    );
    expect([...el.options].map((o) => o.value)).toEqual(["a", "b"]);
    expect(el.value).toBe("b");
    el.value = "a";
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("number clamps to min/max (an emptied field counts as 0)", () => {
    const { el, onChange } = make(
      { type: "number", key: "x", min: 10, max: 20, default: 15 },
      12,
    );
    el.value = "99";
    fireChange(el);
    expect(onChange).toHaveBeenLastCalledWith(20);
    el.value = "";
    fireChange(el);
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("unknown types fall back to a text input", () => {
    const { el, onChange } = make({ key: "x" }, "hello");
    expect(el.type).toBe("text");
    el.value = "world";
    fireChange(el);
    expect(onChange).toHaveBeenCalledWith("world");
  });

  it("location shows what the value resolves to", async () => {
    const invoke = vi.fn(() =>
      Promise.resolve({ area: "Greenwich Village", region: "New York", country: "USA" }),
    );
    const { el } = make({ type: "location", key: "x" }, "10001", { invoke });
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith("resolve_location", { location: "10001" });
    expect(el.querySelector(".loc-status").textContent).toBe(
      "→ Greenwich Village, New York, USA",
    );
  });

  it("location surfaces resolve failures", async () => {
    const invoke = vi.fn(() => Promise.reject("couldn't resolve this location"));
    const { el } = make({ type: "location", key: "x" }, "Brooklyn", { invoke });
    await Promise.resolve();
    await Promise.resolve();
    const status = el.querySelector(".loc-status");
    expect(status.textContent).toBe("couldn't resolve this location");
    expect(status.classList.contains("error")).toBe(true);
  });
});
