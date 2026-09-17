import { expect, it } from 'vitest';
import { lassoEncloses } from './lasso';
it('uses the drawn outline rather than its rectangular bounds', () => {
  const diamond=[{x:100,y:0},{x:200,y:100},{x:100,y:200},{x:0,y:100}];
  expect(lassoEncloses(diamond,{left:80,top:80,width:40,height:40})).toBe(true);
  expect(lassoEncloses(diamond,{left:0,top:0,width:30,height:30})).toBe(false);
  expect(lassoEncloses([...diamond].reverse(),{left:80,top:80,width:40,height:40})).toBe(true);
});
it('excludes components cut by a concave boundary even when all corners fit', () => {
  const notch=[{x:0,y:0},{x:40,y:0},{x:50,y:70},{x:60,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  expect(lassoEncloses(notch,{left:20,top:20,width:60,height:60})).toBe(false);
});
it('ignores clicks and straight strokes', () => {
  expect(lassoEncloses([{x:0,y:0}],{left:0,top:0,width:10,height:10})).toBe(false);
  expect(lassoEncloses([{x:0,y:0},{x:50,y:50},{x:100,y:100}],{left:20,top:20,width:10,height:10})).toBe(false);
});
