import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {CursorProvider} from './cursor-provider';
import {CursorSettings} from './cursor-settings';
import {CURSOR_SIZE_STORAGE_KEY,CURSOR_STORAGE_KEY,cursorStyles,CURSORS} from '@/lib/ui-cursor';
beforeEach(()=>localStorage.clear());
afterEach(cleanup);
it('offers larger cursor sizes, previews them, and persists and hydrates the choice',async()=>{
 const user=userEvent.setup();const view=render(<CursorProvider><CursorSettings/></CursorProvider>);
 await user.click(screen.getByRole('button',{name:'Use Unicorn cursor'}));
 await user.click(screen.getByRole('radio',{name:'Large'}));
 expect(localStorage.getItem(CURSOR_SIZE_STORAGE_KEY)).toBe('64');
 expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toContain('url("/cursors/unicorn-64.png") 8 5');
 expect(screen.getByRole('button',{name:'Use Unicorn cursor'}).querySelector('img')).toHaveAttribute('src','/cursors/unicorn-64.png');
 view.unmount();render(<CursorProvider><CursorSettings/></CursorProvider>);
 expect(screen.getByRole('radio',{name:'Large'})).toHaveAttribute('aria-checked','true');
 await user.click(screen.getByRole('radio',{name:'Default'}));
 expect(localStorage.getItem(CURSOR_SIZE_STORAGE_KEY)).toBe('48');
 expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toContain('unicorn-48.png');
});
it('syncs the size from other tabs and ignores stored sizes that are not offered',async()=>{
 localStorage.setItem(CURSOR_STORAGE_KEY,'fox');localStorage.setItem(CURSOR_SIZE_STORAGE_KEY,'999');render(<CursorProvider><CursorSettings/></CursorProvider>);
 expect(screen.getByRole('radio',{name:'Default'})).toHaveAttribute('aria-checked','true');
 fireEvent(window,new StorageEvent('storage',{key:CURSOR_SIZE_STORAGE_KEY,newValue:'96'}));
 await waitFor(()=>expect(screen.getByRole('radio',{name:'Extra large'})).toHaveAttribute('aria-checked','true'));
 expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toContain('fox-96.png');
});
it('applies a cursor, persists it, hydrates it and restores the system cursor',async()=>{
 const user=userEvent.setup();const view=render(<CursorProvider><CursorSettings/></CursorProvider>);
 expect(screen.getAllByRole('button')).toHaveLength(CURSORS.length);
 await user.click(screen.getByRole('button',{name:'Use Cat cursor'}));
 expect(localStorage.getItem(CURSOR_STORAGE_KEY)).toBe('cat');
 expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toContain('cat-48.png');
 view.unmount();render(<CursorProvider><CursorSettings/></CursorProvider>);
 expect(screen.getByRole('button',{name:'Use Cat cursor'})).toHaveAttribute('aria-pressed','true');
 await user.click(screen.getByRole('button',{name:'Use System default cursor'}));
 expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toBe('');
});
it('syncs other tabs and rejects unknown stored cursor values',async()=>{
 localStorage.setItem(CURSOR_STORAGE_KEY,'unknown');render(<CursorProvider><CursorSettings/></CursorProvider>);
 expect(screen.getByRole('button',{name:'Use System default cursor'})).toHaveAttribute('aria-pressed','true');
 fireEvent(window,new StorageEvent('storage',{key:CURSOR_STORAGE_KEY,newValue:'ufo'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Use UFO cursor'})).toHaveAttribute('aria-pressed','true'));
 expect(cursorStyles('ufo')).toContain('cursor: text');
 expect(cursorStyles('ufo')).toContain('cursor: grab');
});

it('offers and persists the supplied Naruto and Kuromi cursors',async()=>{
 const user=userEvent.setup();render(<CursorProvider><CursorSettings/></CursorProvider>);
 for(const name of ['Naruto','Kuromi']) {
  await user.click(screen.getByRole('button',{name:`Use ${name} cursor`}));
  expect(localStorage.getItem(CURSOR_STORAGE_KEY)).toBe(name.toLowerCase());
  expect(document.head.querySelector('[data-dreamscape-cursor]')?.textContent).toContain(`${name.toLowerCase()}-48.png`);
 }
});
