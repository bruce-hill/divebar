// jsdom has no Web Animations API; panel.js only needs animate() to return
// something whose onfinish fires after the animation "ends".
Element.prototype.animate = function () {
  const anim = { onfinish: null, cancel() {} };
  queueMicrotask(() => anim.onfinish?.());
  return anim;
};

// jsdom has no ResizeObserver; popup.js only needs observe/disconnect
// (jsdom never resizes anything, so the callback would never fire anyway).
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};
