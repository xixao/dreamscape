import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {CURSORS,CURSOR_SIZES,DEFAULT_CURSOR_SIZE,cursorStyles,cursorValue,parseCursorSize} from './ui-cursor';

describe('cursor sizes',()=>{
 it('defaults to 48 px and falls back for sizes that are not offered',()=>{
  expect(DEFAULT_CURSOR_SIZE).toBe(48);
  expect(CURSOR_SIZES.map(option=>option.size)).toEqual([48,64,96]);
  expect(parseCursorSize(null)).toBe(48);
  expect(parseCursorSize('64')).toBe(64);
  expect(parseCursorSize('96')).toBe(96);
  expect(parseCursorSize('72')).toBe(48);
  expect(parseCursorSize('huge')).toBe(48);
 });

 it('points at the image for the size and scales the click point with it',()=>{
  expect(cursorValue('unicorn')).toBe('url("/cursors/unicorn-48.png") 6 4, auto');
  expect(cursorValue('unicorn',64)).toBe('url("/cursors/unicorn-64.png") 8 5, auto');
  expect(cursorValue('unicorn',96)).toBe('url("/cursors/unicorn-96.png") 12 8, auto');
  expect(cursorValue('default',96)).toBe('auto');
  expect(cursorStyles('cat',96)).toContain('url("/cursors/cat-96.png")');
  expect(cursorStyles('default',96)).toBe('');
 });

 it('ships an image for every cursor at every size',()=>{
  for(const cursor of CURSORS){
   if(cursor.id==='default')continue;
   for(const {size} of CURSOR_SIZES){
    const file=`${cursor.id}-${size}.png`;
    expect(existsSync(join(process.cwd(),'public','cursors',file)),file).toBe(true);
   }
  }
 });
});
