import { useState } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CanvasViewportProvider } from './canvas';
import { CanvasMinimap, CursorMinimap, minimapBounds } from './canvas-minimap';
afterEach(()=>{cleanup();localStorage.clear();});
function Harness(){const [viewport,setViewport]=useState({x:0,y:0,zoom:0.5});return <CanvasViewportProvider viewport={viewport} setViewport={setViewport} viewportSize={{width:1000,height:600}} animateTo={()=>{}}><CanvasMinimap><button>Page 1</button></CanvasMinimap><CursorMinimap /><output>{JSON.stringify(viewport)}</output></CanvasViewportProvider>;}
it('remembers visibility and pans with the keyboard without changing zoom',()=>{const view=render(<Harness/>);fireEvent.click(screen.getByRole('button',{name:'Show minimap'}));fireEvent.keyDown(screen.getByRole('application'),{key:'ArrowRight'});expect(screen.getByRole('status').textContent).toBe('{"x":-50,"y":0,"zoom":0.5}');view.unmount();render(<Harness/>);expect(screen.getByRole('button',{name:'Hide minimap'})).toHaveAttribute('aria-pressed','true');});
it('includes negative-position objects and the viewport with an undistorted aspect ratio',()=>{const box=minimapBounds([{x:-3000,y:-1000,width:100,height:200}],{x:0,y:0,width:1000,height:600});expect(box.x).toBeLessThan(-3000);expect(box.y).toBeLessThan(-1000);expect(box.x+box.width).toBeGreaterThan(1000);expect(box.y+box.height).toBeGreaterThan(600);expect(box.width/box.height).toBeCloseTo(1.6);});

it('clamps captured drags outside every edge and stops moving after release',()=>{
  render(<Harness/>);
  fireEvent.click(screen.getByRole('button',{name:'Show minimap'}));
  const map=screen.getByRole('application');
  map.setPointerCapture=()=>{};map.releasePointerCapture=()=>{};
  map.getBoundingClientRect=()=>({left:0,top:0,width:240,height:150,right:240,bottom:150,x:0,y:0,toJSON:()=>({})});
  const original=map.getAttribute('viewBox');
  const [x,y,width,height]=original!.split(' ').map(Number);
  fireEvent.pointerDown(map,{button:0,buttons:1,pointerId:1,clientX:120,clientY:75});
  for(const [clientX,clientY] of [[-100000,-100000],[100000,100000],[-100000,100000],[100000,-100000]]){
    fireEvent.pointerMove(map,{buttons:1,pointerId:1,clientX,clientY});
    const viewport=JSON.parse(screen.getByRole('status').textContent!);
    expect(viewport.zoom).toBe(0.5);
    expect(-viewport.x/viewport.zoom).toBeGreaterThanOrEqual(x-0.001);
    expect(-viewport.x/viewport.zoom+2000).toBeLessThanOrEqual(x+width+0.001);
    expect(-viewport.y/viewport.zoom).toBeGreaterThanOrEqual(y-0.001);
    expect(-viewport.y/viewport.zoom+1200).toBeLessThanOrEqual(y+height+0.001);
    expect(map.getAttribute('viewBox')).toBe(original);
  }
  fireEvent.pointerUp(map,{pointerId:1,clientX:100000,clientY:-100000});
  const released=screen.getByRole('status').textContent;
  fireEvent.pointerMove(map,{buttons:0,pointerId:1,clientX:120,clientY:75});
  expect(screen.getByRole('status').textContent).toBe(released);
  fireEvent.pointerDown(map,{button:0,buttons:1,pointerId:2,clientX:120,clientY:75});
  fireEvent.pointerCancel(map,{pointerId:2});
  const cancelled=screen.getByRole('status').textContent;
  fireEvent.pointerMove(map,{buttons:1,pointerId:2,clientX:0,clientY:0});
  expect(screen.getByRole('status').textContent).toBe(cancelled);
});

it('opens at the pointer, closes on release, and does not change the panel preference',()=>{
  render(<Harness/>);
  fireEvent.pointerMove(document,{clientX:400,clientY:300});
  fireEvent.keyDown(document,{key:'m',metaKey:true});
  const floating=document.querySelector('[data-cursor-minimap]') as HTMLElement;
  expect(floating).toHaveStyle({left:'270px',top:'216px'});
  const map=screen.getByRole('application');
  map.setPointerCapture=()=>{};map.releasePointerCapture=()=>{};
  map.getBoundingClientRect=()=>({left:278,top:224,width:244,height:152.5,right:522,bottom:376.5,x:278,y:224,toJSON:()=>({})});
  fireEvent.pointerDown(map,{button:0,buttons:1,pointerId:5,clientX:400,clientY:300});
  fireEvent.pointerMove(map,{buttons:1,pointerId:5,clientX:450,clientY:330});
  fireEvent.pointerUp(map,{pointerId:5});
  expect(document.querySelector('[data-cursor-minimap]')).toBeNull();
  expect(screen.getByRole('button',{name:'Show minimap'})).toHaveAttribute('aria-pressed','false');
  expect(localStorage.getItem('dreamscape:minimap-visible')).toBeNull();
  fireEvent.keyDown(document,{key:'m',metaKey:true});
  expect(document.querySelector('[data-cursor-minimap]')).not.toBeNull();
  fireEvent.keyDown(document,{key:'Escape'});
  expect(document.querySelector('[data-cursor-minimap]')).toBeNull();
});

it.each(['pointerUp', 'pointerCancel', 'lostPointerCapture', 'releasedOutside'] as const)(
  'ends an out-of-bounds floating drag safely on %s even after native capture expires', end => {
    render(<Harness/>);
    fireEvent.keyDown(document,{key:'m',metaKey:true});
    const map=screen.getByRole('application');
    map.setPointerCapture=()=>{};
    map.releasePointerCapture=()=>{throw new DOMException('No active pointer', 'NotFoundError');};
    map.getBoundingClientRect=()=>({left:0,top:0,width:240,height:150,right:240,bottom:150,x:0,y:0,toJSON:()=>({})});
    fireEvent.pointerDown(map,{button:0,buttons:1,pointerId:7,clientX:120,clientY:75});
    fireEvent.pointerMove(map,{buttons:1,pointerId:7,clientX:100000,clientY:-100000});
    const viewport=JSON.parse(screen.getByRole('status').textContent!);
    expect(Object.values(viewport).every(value=>Number.isFinite(value))).toBe(true);
    if(end==='releasedOutside') fireEvent.pointerMove(map,{buttons:0,pointerId:7,clientX:100001,clientY:-100001});
    else fireEvent[end](map,{pointerId:7});
    expect(document.querySelector('[data-cursor-minimap]')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(JSON.stringify(viewport));
    fireEvent.keyDown(document,{key:'m',metaKey:true});
    expect(screen.getByRole('application')).toBeInTheDocument();
  }
);
