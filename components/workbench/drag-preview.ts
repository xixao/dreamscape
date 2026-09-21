/** A noninteractive visual copy, including styles from the canvas iframe. */
export function cloneDragPreview(element: HTMLElement): HTMLElement {
  const clone = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll('*')];
  const copies = [clone, ...clone.querySelectorAll('*')];
  originals.forEach((original, index) => {
    const copy = copies[index] as HTMLElement;
    const css = original.ownerDocument.defaultView!.getComputedStyle(original);
    for (let i = 0; i < css.length; i++) {
      const key = css.item(i);
      copy.style.setProperty(key, css.getPropertyValue(key));
    }
    copy.removeAttribute('id');
    copy.removeAttribute('autofocus');
    copy.setAttribute('tabindex', '-1');
    copy.style.pointerEvents = 'none';
    copy.style.animation = 'none';
    copy.style.transition = 'none';
    if (original.tagName === 'INPUT') (copy as HTMLInputElement).value = (original as HTMLInputElement).value;
    if (original.tagName === 'TEXTAREA') (copy as HTMLTextAreaElement).value = (original as HTMLTextAreaElement).value;
  });
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  return clone;
}
