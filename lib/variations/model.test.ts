import { describe,it,expect } from 'vitest';
import { emptyLayoutJson } from '@/components/blocks/known-types';
import { cloneExploration, explorationSchema, parseGeneration, safeLayout } from './model';
import { validatePages } from '@/lib/files/validate';
const snapshot={name:'Screen',layout:emptyLayoutJson(),width:1440,height:900};
const rationale={hypothesis:'Prioritize tasks',assumption:'Users need direction',tradeoff:'Less overview',decisions:[],precedents:[],test:'Find a blocked task'};
const result={name:'Tasks first',screens:[snapshot],rationale};
describe('variation generation boundary',()=>{
 it('accepts registered coded layouts and rejects unknown components or cycles',()=>{
  expect(safeLayout(snapshot.layout)).toBe(true);
  const tree=JSON.parse(snapshot.layout);tree.ROOT.type.resolvedName='script';expect(safeLayout(JSON.stringify(tree))).toBe(false);
  tree.ROOT.type.resolvedName='LayoutBox';tree.ROOT.nodes=['ROOT'];expect(safeLayout(JSON.stringify(tree))).toBe(false);
 });
 it('requires the requested count and assigns independent IDs',()=>{
  const parsed=parseGeneration(JSON.stringify({variations:[result,result]}),2,[],[]);
  expect(parsed[0].id).not.toBe(parsed[1].id);
  expect(()=>parseGeneration(JSON.stringify({variations:[result]}),3,[],[])).toThrow();
 });
 it('rejects unexpected changes outside the selected subtree',()=>{
  const tree=JSON.parse(snapshot.layout);tree.ROOT.props.gapPx={mobile:88};
  expect(()=>parseGeneration(JSON.stringify({variations:[{...result,screens:[{...snapshot,layout:JSON.stringify(tree)}]}]}),1,[snapshot],['missing'])).toThrow('outside');
 });
 it('round-trips exploration pages and rejects forward/cyclic lineage',()=>{
  const data={brief:'Brief',source:[snapshot],selectedIds:[],sets:[{id:'set1',parentId:null,prompt:'Try',count:1,teach:true,status:'ready' as const,variations:[{...result,id:'var1'}]}]};
  const page={id:'page000001',name:'Ideas',kind:'variations' as const,exploration:data};
  expect(validatePages([page])).toEqual({ok:true,pages:[page]});
  expect(explorationSchema.safeParse({...data,sets:[{...data.sets[0],parentId:'var1'}]}).success).toBe(false);
  expect(validatePages([{id:'page000001',name:'Original'}])).toEqual({ok:true,pages:[{id:'page000001',name:'Original'}]});
 });
});

it('copies a complete branch with new identities and no destination links', () => {
 const parent = {...result,id:'parent',promoted:{pageId:'design',screenIds:['screen']}};
 const data = {brief:'Brief',source:[snapshot],selectedIds:[],sets:[
  {id:'one',parentId:null,prompt:'Initial',count:1,teach:true,status:'ready' as const,variations:[parent]},
  {id:'two',parentId:'parent',prompt:'Follow up',count:1,teach:true,status:'pending' as const,variations:[]},
 ]};
 const copy=cloneExploration(data);
 expect(explorationSchema.safeParse(copy).success).toBe(true);
 expect(copy.sets[0].variations[0].id).not.toBe(parent.id);
 expect(copy.sets[1].parentId).toBe(copy.sets[0].variations[0].id);
 expect(copy.sets[0].variations[0].promoted).toBeUndefined();
 expect(copy.sets[1].status).toBe('error');
 expect(data.sets[0].variations[0].promoted).toBeDefined();
});
