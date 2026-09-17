import { expect, it } from 'vitest';
import type { Interaction } from '@/lib/interactions';
import type { Screen } from '@/lib/files/repository';
import { buildPackage, connectedScope, changesSince, type Snapshot } from './model';
import { createInitialDiagramState, diagramReducer } from '@/lib/diagram/store';
function frame(id:string,pageId:string,interaction?:Interaction):Screen {
  return {id,name:id,pageId,stageWidth:800,layout:JSON.stringify({ROOT:{type:{resolvedName:'LayoutBox'},isCanvas:true,props:{},displayName:'Frame',custom:interaction?{interactions:[interaction]}:{},nodes:[],linkedNodes:{},parent:null,hidden:false}})};
}
const snapshot:Snapshot={id:'version',createdAt:'2026-09-16T00:00:00Z',fileId:'file',fileName:'Demo',appearance:'light',pages:[{id:'p1',name:'One'},{id:'p2',name:'Two'}],screens:[frame('a','p1',{id:'i',trigger:'click',action:'navigate',targetScreenId:'b'}),frame('b','p2',{id:'i2',trigger:'click',action:'navigate',targetScreenId:'a'}),frame('c','p2')],components:[],notes:[]};
it('follows cross-page links, terminates cycles, and excludes disconnected frames',()=>{
  expect(connectedScope(snapshot.screens,'a')).toEqual(['a','b']);
  const result=buildPackage(snapshot,['a','b'],'a');
  expect(result.diagram.edges).toHaveLength(2);expect(result.issues).toEqual([]);
  expect(JSON.parse(result.files['snapshot.json']).screens.map((s:Screen)=>s.id)).toEqual(['a','b']);
  expect(result.files['screens/a.tsx']).toContain('SelectionPreview');expect(result.files['flow.svg']).toContain('<svg');
});
it('flags excluded and broken destinations and documents history-dependent actions',()=>{
  expect(buildPackage(snapshot,['a'],'a').issues[0]).toContain('outside this scope');
  const data={...snapshot,screens:[frame('a','p1',{id:'broken',trigger:'click',action:'navigate',targetScreenId:'gone'}),frame('b','p1',{id:'back',trigger:'click',action:'back'})]};
  const result=buildPackage(data,['a','b'],'a');
  expect(result.issues.some(s=>s.includes('no longer exists'))).toBe(true);
  expect(result.diagram.nodes.some(n=>n.text==='Back to previous screen')).toBe(true);
  expect(result.spec).toContain('not AI');expect(result.spec).toContain('not a standalone production app');
});
it('adds a generated diagram as one undoable action without overwriting the existing diagram',()=>{
  const data=buildPackage(snapshot,['a','b'],'a').diagram;
  const before=createInitialDiagramState();const next=diagramReducer(before,{type:'insertDiagram',data});
  expect(next.nodes).toHaveLength(2);expect(next.history.past).toHaveLength(1);
  expect(diagramReducer(next,{type:'undo'}).nodes).toEqual(before.nodes);
});
it('reports changes against the previous captured version',()=>{
  expect(changesSince(snapshot,{...snapshot,screens:[{...snapshot.screens[0],name:'Renamed'}]})).toEqual(['Updated: Renamed','Removed: b','Removed: c']);
});
