import { describe, it, expect } from 'vitest';
import { placeDiagramShape } from './placement';
import type { Box } from './geometry';
const size = { width:160, height:80 };
const area = { x:0, y:0, width:1000, height:600 };
const overlaps = (a: Box,b: Box) => a.x < b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y;
describe('diagram click placement',()=>{
  it('centers in the visible canvas when clear, including negative panned coordinates',()=>{
    expect(placeDiagramShape(size,area,[],24)).toEqual({position:{x:420,y:260},reveal:false});
    expect(placeDiagramShape(size,{...area,x:-2000,y:1500},[],24)).toEqual({position:{x:-1580,y:1760},reveal:false});
  });
  it('finds the nearest visible spot beside a frame instead of placing on it',()=>{
    const frame={x:300,y:100,width:400,height:400};
    const result=placeDiagramShape(size,area,[frame],24);
    expect(result).toEqual({position:{x:116,y:260},reveal:false});
    expect(overlaps({...size,...result.position},frame)).toBe(false);
  });
  it('keeps repeat insertions separate from previous diagram shapes',()=>{
    const first=placeDiagramShape(size,area,[],24);
    const second=placeDiagramShape(size,area,[{...first.position,...size}],24);
    expect(second.reveal).toBe(false);
    expect(overlaps({...size,...first.position},{...size,...second.position})).toBe(false);
  });
  it('reveals the closest empty canvas when a frame covers the entire viewport',()=>{
    const result=placeDiagramShape(size,area,[area],24);
    expect(result.reveal).toBe(true);
    expect(overlaps({...size,...result.position},area)).toBe(false);
  });
  it('avoids all frames, including adjacent frames outside the viewport',()=>{
    const frames=[area,{x:0,y:-500,width:1000,height:500},{x:0,y:600,width:1000,height:500}];
    const result=placeDiagramShape(size,area,frames,24);
    expect(result.reveal).toBe(true);
    for(const frame of frames) expect(overlaps({...size,...result.position},frame)).toBe(false);
  });
  it('handles a shape larger than the usable viewport',()=>{
    const result=placeDiagramShape(size,{x:0,y:0,width:100,height:60},[],24);
    expect(result.reveal).toBe(true);
    expect(Number.isFinite(result.position.x)).toBe(true);
  });
});
