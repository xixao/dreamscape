import { Profiler } from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { CommentLayer, DEFAULT_STAGE_COMMENTS } from './comment-layer';

it('keeps an anchored marker attached when its element moves or resizes', async () => {
  let bounds = { left: 100, top: 120, width: 200, height: 80 };
  const thread = { id: 'n1', fileId: 'f1', number: 8, kind: 'annotation' as const, x: 0, y: 0, anchorNodeId: 'button', anchorOffset: { x: 0.5, y: 1 }, author: 'Designer', text: 'Keep centered', createdAt: new Date().toISOString(), replies: [] };
  const resolveAnchor = vi.fn(() => bounds);
  render(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[thread]} resolveAnchor={resolveAnchor} artboardRect={{ left: 0, top: 0, width: 1000, height: 800 }} zoom={1} />);
  const pin = await screen.findByRole('button', { name: 'Annotation 8' });
  await waitFor(() => expect(pin).toHaveStyle({ left: '200px', top: '172px' }));
  bounds = { left: 300, top: 200, width: 400, height: 100 };
  await waitFor(() => expect(pin).toHaveStyle({ left: '500px', top: '272px' }));
  fireEvent.pointerEnter(pin);
  expect(document.querySelector('.border-violet-400')).toHaveStyle({ left: '300px', width: '400px' });
});

it('does not create extra commits for fresh empty note arrays during canvas movement', () => {
  const commits = vi.fn();
  const view = render(<Profiler id="notes" onRender={commits}><CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[]} zoom={1} artboardRect={{left:0,top:0,width:1000,height:800}} /></Profiler>);
  commits.mockClear();
  for (let x=1;x<=60;x++) view.rerender(<Profiler id="notes" onRender={commits}><CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[]} zoom={1} artboardRect={{left:x,top:0,width:1000,height:800}} /></Profiler>);
  expect(commits).toHaveBeenCalledTimes(60);
});

it('does not synchronously remeasure anchors or recommit unchanged geometry on resolver replacement', () => {
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => { pending.set(++id,cb); return id; });
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => { pending.delete(key); });
  const commits = vi.fn();
  const bounds = {left:100,top:120,width:200,height:80};
  const thread = {id:'anchored',fileId:'f1',x:0,y:0,anchorNodeId:'button',author:'Designer',text:'Note',createdAt:'2026-09-17',replies:[]};
  const layer = () => <Profiler id="notes" onRender={commits}><CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[{...thread}]} resolveAnchor={()=>({...bounds})} zoom={1} artboardRect={{left:0,top:0,width:1000,height:800}} /></Profiler>;
  const flush = () => act(()=>{ const callbacks=[...pending.values()];pending.clear();callbacks.forEach(cb=>cb(16)); });
  const view = render(layer());
  try {
    flush();
    commits.mockClear();
    for(let n=0;n<60;n++) view.rerender(layer());
    expect(commits).toHaveBeenCalledTimes(60);
    commits.mockClear();
    flush(); flush();
    expect(commits).not.toHaveBeenCalled();
  } finally { view.unmount(); request.mockRestore(); cancel.mockRestore(); }
});

it('does not schedule any anchor measurements for empty layers during repeated navigation', () => {
  const request = vi.spyOn(window, 'requestAnimationFrame');
  const view = render(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[]} zoom={1} artboardRect={{left:0,top:0,width:1000,height:800}} />);
  try {
    request.mockClear();
    for(let x=0;x<120;x++) view.rerender(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[]} resolveAnchor={()=>null} zoom={1} artboardRect={{left:x,top:x,width:1000,height:800}} />);
    expect(request).not.toHaveBeenCalled();
  } finally { view.unmount(); request.mockRestore(); }
});
