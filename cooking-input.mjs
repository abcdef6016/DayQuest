// Provide native button activation for keyboard and assistive technology, plus
// captured drag and tap activation for touch WebViews.
export function bindCookingButtons(root, { move, drop, clear, isBusy = () => false }) {
  let gesture;
  const handled = new WeakSet();

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (button && event.detail && handled.has(button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handled.delete(button);
    }
  }, true);

  root.addEventListener('pointerdown', event => {
    const button = event.target.closest('button');
    if (!button || button.disabled || event.button !== 0 || gesture || isBusy()) return;
    handled.delete(button);
    const { target } = button.dataset;
    if (!target && event.pointerType !== 'touch') return;
    gesture = { button, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    if (target) button.setPointerCapture(event.pointerId);
  });

  root.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 7) return;
    gesture.moved = true;
    if (gesture.button.dataset.target) move(gesture.button, event);
  });

  function end(event) {
    if (gesture?.id !== event.pointerId) return;
    const { button, moved } = gesture;
    gesture = null;
    if (moved && button.dataset.target) clear();
    if (event.type !== 'pointerup') return;
    if (moved) {
      handled.add(button);
      if (button.dataset.target) drop(button, event);
    } else if (event.pointerType === 'touch') {
      handled.add(button);
      button.click();
    }
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(type, end);
  return () => Boolean(gesture);
}

export function svgPoint(scene, event) {
  const { left, top, width, height } = scene.getBoundingClientRect();
  const box = scene.viewBox.baseVal;
  return {
    x: Math.round(box.x + (event.clientX - left) * box.width / width),
    y: Math.round(box.y + (event.clientY - top) * box.height / height)
  };
}
