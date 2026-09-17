import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CanvasPromptControls } from './canvas-prompt-controls';
import { lassoEncloses } from './lasso';
beforeEach(() => localStorage.clear());
it('defaults on and remembers a disabled preference across mounts', () => {
  const view = render(<CanvasPromptControls />);
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(screen.getByRole('switch'));
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  view.unmount(); render(<CanvasPromptControls />);
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
});
it('lets designers explicitly select an area even with canvas prompts off', () => {
  localStorage.setItem('dreamscape:canvas-prompts', 'false');
  const start = vi.fn(); window.addEventListener('dreamscape:ask-area', start);
  render(<CanvasPromptControls />); fireEvent.click(screen.getByRole('button', {name:'Ask AI about an area'}));
  expect(start).toHaveBeenCalledOnce(); window.removeEventListener('dreamscape:ask-area', start);
});
it('targets enclosed visible components, excluding larger ancestors and hidden nodes', () => {
  const area = [{x:100,y:100},{x:300,y:100},{x:300,y:300},{x:100,y:300}];
  expect(lassoEncloses(area,{left:110,top:120,width:60,height:30})).toBe(true);
  expect(lassoEncloses(area,{left:0,top:0,width:1000,height:1000})).toBe(false);
  expect(lassoEncloses(area,{left:110,top:120,width:0,height:0})).toBe(false);
});
