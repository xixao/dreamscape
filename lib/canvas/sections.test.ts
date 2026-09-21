import { describe, it, expect } from 'vitest';
import { fitSectionObjects, growDiagramSections, sectionFrames, fitSection, translateSection, sectionsSchema } from './sections';
import { validatePages } from '../files/validate';
import type { Screen } from '../files/validate';
const section={id:'section001',name:'Checkout',x:0,y:0,width:1000,height:800};
const a={id:'screen0001',name:'A',layout:'{}',stageWidth:300,stageHeight:500,x:80,y:100} as Screen;
const b={...a,id:'screen0002',x:500};
describe('Canvas sections',()=>{
 it('groups only fully contained frames and picks one owner for overlaps',()=>{
  expect(sectionFrames(section,[section],[a,b,{...a,id:'out',x:950}]).map(s=>s.id)).toEqual([a.id,b.id]);
  const inner={...section,id:'section002',x:50,y:50,width:350,height:600};
  expect(sectionFrames(section,[section,inner],[a,b]).map(s=>s.id)).toEqual([b.id]);
 });
 it('fits actual frame sizes with room for labels, including measured auto heights',()=>{
  expect(fitSection([a,b])).toEqual({x:16,y:20,width:848,height:644});
  expect(fitSection([{...a,stageHeight:null}],new Map([[a.id,900]]))?.height).toBe(1044);
 });
 it('moves all members by a rounded delta without changing their sizes or layouts',()=>{
  const result=translateSection(section,[a,b],25.4,-50.3);
  expect(result.section).toEqual({...section,x:25,y:-50});
  expect(result.positions).toEqual([{id:a.id,x:105,y:50},{id:b.id,x:525,y:50}]);
  expect(a.x).toBe(80);
 });
 it('preserves optional highlight colors and rejects unsupported colors',()=>{
  expect(validatePages([{id:'page000001',name:'Page',sections:[{...section,color:'violet'}]}])).toEqual({ok:true,pages:[{id:'page000001',name:'Page',sections:[{...section,color:'violet'}]}]});
  expect(sectionsSchema.safeParse([{...section,color:'not-a-color'}]).success).toBe(false);
  expect(sectionsSchema.safeParse([section]).success).toBe(true);
 });
 it('validates and preserves sections through page normalization',()=>{
  expect(validatePages([{id:'page000001',name:'Page',sections:[section]}])).toEqual({ok:true,pages:[{id:'page000001',name:'Page',sections:[section]}]});
  expect(sectionsSchema.safeParse([section,section]).success).toBe(false);
  expect(sectionsSchema.safeParse([{...section,width:-1}]).success).toBe(false);
  expect(sectionsSchema.safeParse([{...section,x:Infinity}]).success).toBe(false);
 });
});

 describe('automatic diagram section growth', () => {
  const node = { id: 'node000001', kind: 'rect', x: 100, y: 100, width: 160, height: 80, text: '', color: 'neutral' } as import('../diagram/store').DiagramNode;
  const data = (nodes: typeof node[], edges: import('../diagram/store').DiagramEdge[] = []) => ({ nodes, edges });
  it.each([{ x: -100 }, { y: -100 }, { x: 980 }, { y: 780 }, { width: 1100, height: 900 }])('grows for a member crossing an edge: %o', patch => {
    const changed = { ...node, ...patch };
    const [grown] = growDiagramSections([section], data([node]), data([changed]));
    expect(grown.x).toBeLessThanOrEqual(changed.x);
    expect(grown.y).toBeLessThanOrEqual(changed.y);
    expect(grown.x + grown.width).toBeGreaterThanOrEqual(changed.x + changed.width);
    expect(grown.y + grown.height).toBeGreaterThanOrEqual(changed.y + changed.height);
    expect(sectionsSchema.safeParse([grown]).success).toBe(true);
  });
  it('grows for a newly dropped shape overlapping its edge', () => {
    const [grown] = growDiagramSections([section], data([]), data([{ ...node, x: 980 }]));
    expect(grown.width).toBe(1204);
  });
  it('grows when an outside shape is connected to the diagram', () => {
    const outside = { ...node, id: 'node000002', x: 1200 };
    const edge = { id: 'edge000001', source: { nodeId: node.id }, target: { nodeId: outside.id }, kind: 'straight', arrow: 'end' } as import('../diagram/store').DiagramEdge;
    expect(growDiagramSections([section], data([node, outside]), data([node, outside], [edge]))[0].width).toBe(1424);
  });
  it('does not resize on text edits, delete, or unrelated outside insertion', () => {
    const sections = [section];
    expect(growDiagramSections(sections, data([node]), data([{ ...node, text: 'edited' }]))).toBe(sections);
    expect(growDiagramSections(sections, data([node]), data([]))).toBe(sections);
    expect(growDiagramSections(sections, data([node]), data([node, { ...node, id: 'node000002', x: 2000 }]))).toBe(sections);
  });
  it('expands nested parents while leaving a neighboring section alone', () => {
    const inner = { ...section, id: 'section002', x: 50, y: 50, width: 300, height: 200 };
    const neighbor = { ...section, id: 'section003', x: 3000 };
    const result = growDiagramSections([section, inner, neighbor], data([node]), data([{ ...node, x: 1100 }]));
    expect(result[1].width).toBeGreaterThan(inner.width);
    expect(result[0].width).toBeGreaterThan(section.width);
    expect(result[2]).toBe(neighbor);
  });
 });

describe('diagram resize to fit',()=>{
 it('includes a shape crossing the section edge',()=>{expect(fitSectionObjects(section,[section],[],[{x:950,y:100,width:200,height:100}])).toEqual({x:886,y:20,width:328,height:244});});
 it('includes connected outside shapes but excludes members of another section',()=>{
  const nodes=[{id:'a',x:100,y:100,width:100,height:100},{id:'b',x:1200,y:100,width:100,height:100}];
  const edges=[{source:{nodeId:'a'},target:{nodeId:'b'}}] as import('../diagram/store').DiagramEdge[];
  expect(fitSectionObjects(section,[section],[],nodes,undefined,edges)?.width).toBe(1328);
  expect(fitSectionObjects(section,[section,{...section,id:'other00001',x:1150}],[],nodes,undefined,edges)?.width).toBe(228);
 });
});
