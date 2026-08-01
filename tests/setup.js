// jsdom has no Web Animations API; panel.js only needs animate() to return
// something whose onfinish fires after the animation "ends".
Element.prototype.animate = function () {
  const anim = { onfinish: null, cancel() {} };
  queueMicrotask(() => anim.onfinish?.());
  return anim;
};
