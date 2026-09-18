'use client';
import { useNode } from '@craftjs/core';
import { useEffect, useRef, type ReactElement } from 'react';
import { useWriter } from './context';

/** Display-contents wrappers preserve flex/grid geometry; no Craft drag/select handlers. */
export function WriterNode({ render }: { render: ReactElement }) {
  const { id } = useNode();
  const writer = useWriter();
  const host = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([writer?.scope ?? id, writer?.scope ? id : null]);
  useEffect(() => {
    const element = host.current?.firstElementChild as HTMLElement | null;
    if (!element || writer?.selected !== key) return;
    const previous = element.style.outline;
    element.style.outline = '2px solid #9694ed';
    return () => { element.style.outline = previous; };
  }, [writer?.selected, key]);
  return <div ref={host} style={{ display: 'contents' }} data-writer-node={key}
    onClickCapture={event => { if ((event.target as HTMLElement).closest('[data-writer-node]') === host.current) writer?.select(key); }}
    onClick={event => { if (writer) { event.stopPropagation(); writer.select(key); } }}
    onDoubleClick={event => {
      if (!writer) return;
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-writer-prop]');
      if (!element || element.closest('[data-writer-node]') !== host.current) return;
      event.preventDefault(); event.stopPropagation();
      const prop = element.dataset.writerProp!;
      const before = element.textContent ?? '';
      if (element.isContentEditable) return;
      element.setAttribute('contenteditable', 'true'); element.setAttribute('role', 'textbox'); element.setAttribute('aria-label', 'Edit text');
      element.focus();
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      let finished = false;
      const finish = (cancel = false) => {
        if (finished) return; finished = true;
        const value = element.innerText ?? element.textContent ?? '';
        element.setAttribute('contenteditable', 'false'); element.removeAttribute('role'); element.removeAttribute('aria-label');
        element.textContent = before;
        element.removeEventListener('keydown', onKey); element.removeEventListener('blur', onBlur); element.removeEventListener('paste', onPaste);
        if (!cancel) writer.edit(key, prop, value);
      };
      const onBlur = () => finish();
      const onKey = (e: KeyboardEvent) => { e.stopPropagation(); if (e.isComposing) return; if (e.key === 'Escape') { e.preventDefault(); finish(true); } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(); } };
      const onPaste = (e: ClipboardEvent) => {
        e.preventDefault(); const selection = window.getSelection(); if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0); range.deleteContents(); const text = document.createTextNode(e.clipboardData?.getData('text/plain') ?? ''); range.insertNode(text); range.setStartAfter(text); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
      };
      element.addEventListener('keydown', onKey); element.addEventListener('blur', onBlur); element.addEventListener('paste', onPaste);
    }}>{render}</div>;
}
