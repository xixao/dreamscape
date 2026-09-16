import { describe, it, expect } from 'vitest';
import { sectionFrames, fitSection, translateSection, sectionsSchema } from './sections';
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
