import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { beginSelectionRequest, setChatSelection, useSelectionOutline } from './selection-chip';
const polygon = [{x:10,y:10},{x:100,y:20},{x:80,y:100}];
it('keeps the outline after submitting the draft until the request finishes', () => {
  setChatSelection('pending', [{id:'a',name:'Card'}], polygon);
  const {result} = renderHook(() => useSelectionOutline('pending'));
  let finish!: () => void;
  act(() => { finish=beginSelectionRequest('pending'); setChatSelection('pending', []); });
  expect(result.current).toEqual(polygon);
  act(() => finish()); expect(result.current).toEqual([]);
});
it('clears a removed draft and does not let an old response clear a new request', () => {
  setChatSelection('ordering', [{id:'a',name:'Card'}], polygon);
  const {result} = renderHook(() => useSelectionOutline('ordering'));
  act(() => setChatSelection('ordering', [])); expect(result.current).toEqual([]);
  let old!:()=>void; let current!:()=>void;
  act(() => {
    setChatSelection('ordering', [{id:'a',name:'Card'}], polygon); old=beginSelectionRequest('ordering');
    setChatSelection('ordering', [{id:'b',name:'Button'}], polygon); current=beginSelectionRequest('ordering');
    setChatSelection('ordering', []); old();
  });
  expect(result.current).toEqual(polygon);
  act(() => current()); expect(result.current).toEqual([]);
});
