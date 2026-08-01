// jsdom has no Web Animations API; panel.js only needs animate() to return
// something whose onfinish fires after the animation "ends".
Element.prototype.animate = function () {
  const anim = { onfinish: null, cancel() {} };
  queueMicrotask(() => anim.onfinish?.());
  return anim;
};

// jsdom has no ResizeObserver; the Coordinator uses one to re-place a
// claimed panel and re-send the shape when its content resizes. jsdom never
// resizes anything, so tests fire it by hand: ResizeObserver.trigger()
// invokes every currently-observing observer's callback.
const activeObservers = new Set();
globalThis.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {
    activeObservers.add(this);
  }
  disconnect() {
    activeObservers.delete(this);
  }
  static trigger() {
    for (const observer of [...activeObservers]) observer.cb([]);
  }
};
