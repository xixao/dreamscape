import type { SerializedNodes } from '@craftjs/core';
import type { Page, Screen } from '@/lib/files/repository';
import type { CommentThread } from '@/lib/comments/store';
import type { ComponentDefinition } from '@/lib/custom-components/model';
import type { Interaction } from '@/lib/interactions';
import type { DiagramData } from '@/lib/diagram/store';
import { renderDiagramSvg } from '@/lib/diagram/export';
import { selectionCode } from '../selection-code';
export type Snapshot = { id:string; createdAt:string; fileId:string; fileName:string; appearance:string; pages:Page[]; screens:Screen[]; components:ComponentDefinition[]; notes:CommentThread[] };
export type Connection = {screenId:string;nodeId:string;label:string;interaction:Interaction};
export function readNodes(screen:Screen):SerializedNodes { return JSON.parse(screen.layout); }
export function connections(screens:Screen[]):Connection[] {
  return screens.flatMap(screen=>Object.entries(readNodes(screen)).flatMap(([nodeId,node])=>{
    const i=node.custom?.interactions?.[0] as Interaction | undefined;
    return i ? [{screenId:screen.id,nodeId,label:String(node.custom?.layerName || node.displayName || nodeId),interaction:i}] : [];
  }));
}
export function connectedScope(screens:Screen[],start:string):string[] {
  const edges=connections(screens); const seen=new Set<string>(); const todo=[start];
  while(todo.length) { const id=todo.shift()!; if(seen.has(id)||!screens.some(s=>s.id===id))continue; seen.add(id); edges.filter(e=>e.screenId===id).forEach(e=>{if('targetScreenId' in e.interaction)todo.push(e.interaction.targetScreenId);}); }
  return [...seen];
}
export function buildPackage(snapshot:Snapshot,ids:string[],start:string) {
  const included=new Set(ids); const screens=snapshot.screens.filter(s=>included.has(s.id)); const edges=connections(screens);
  const issues:string[]=[];
  if(!included.has(start))issues.push('The starting frame is outside this scope.');
  const reachable=new Set(connectedScope(snapshot.screens,start));
  screens.filter(s=>!reachable.has(s.id)).forEach(s=>issues.push(`${s.name}: not reachable from the starting frame.`));
  const diagram:DiagramData={nodes:screens.map((s,i)=>({id:s.id,kind:s.id===start?'terminal':'rounded',x:80+(i%3)*380,y:80+Math.floor(i/3)*220,width:240,height:120,text:`${s.id===start?'Start · ':''}${s.name}\n${snapshot.pages.find(p=>p.id===s.pageId)?.name || 'Page'}`,color:s.id===start?'green':'neutral'})),edges:[]};
  const behavior:string[]=[];
  edges.forEach((e,i)=>{
    const source=screens.find(s=>s.id===e.screenId)!; const action=e.interaction;
    let destination='';
    if('targetScreenId' in action) {
      const target=snapshot.screens.find(s=>s.id===action.targetScreenId);
      destination=target?.name || `Missing frame (${action.targetScreenId})`;
      if(!target)issues.push(`${source.name} / ${e.label}: destination no longer exists.`);
      else if(!included.has(target.id))issues.push(`${source.name} / ${e.label}: destination ${target.name} is outside this scope.`);
      if(action.action==='openOverlay' && target?.kind!=='overlay')issues.push(`${source.name} / ${e.label}: overlay destination is not an overlay frame.`);
      if(included.has(action.targetScreenId))diagram.edges.push({id:`edge-${i}`,source:{nodeId:e.screenId,side:'right'},target:{nodeId:action.targetScreenId,side:'left'},kind:'curve',arrow:'end',label:`Click ${e.label} · ${action.action}`});
    } else if(action.action==='openDialog') {
      const target=readNodes(source)[action.targetNodeId]; destination=String(target?.displayName || action.targetNodeId);
      if(!target)issues.push(`${source.name} / ${e.label}: dialog destination no longer exists.`);
    }
    if(!('targetScreenId' in action)) {
      const nodeId=`action-${i}`;
      diagram.nodes.push({id:nodeId,kind:'note',x:80+(diagram.nodes.length%3)*380,y:80+Math.floor(diagram.nodes.length/3)*220,width:240,height:120,text:action.action==='back'?'Back to previous screen':action.action==='closeOverlay'?'Close current overlay':`Open dialog · ${destination}`,color:'violet'});
      diagram.edges.push({id:`edge-${i}`,source:{nodeId:e.screenId},target:{nodeId},kind:'curve',arrow:'end',label:`Click ${e.label}`});
    }
    if (action.intendedCondition?.trim()) behavior.push(`- Intended condition for ${source.name} / ${e.label}: ${action.intendedCondition.trim()} (documentation only; prototype simulates on click).`);
    behavior.push(`- [ ] ${source.name} / ${e.label}: on ${action.trigger}, ${action.action}${destination?` → ${destination}`:''}.`);
  });
  const notes=snapshot.notes.filter(n=>n.screenId?included.has(n.screenId):screens.some(s=>s.pageId===n.pageId));
  const questions=['What data sources and API contracts are required?','Which permissions and validation rules apply?','Which loading, empty, error, and success states are required?','Which accessibility requirements still need verification?'];
  const spec=`# ${snapshot.fileName} — Implementation specification\n\nSnapshot: ${snapshot.id}\nCaptured: ${snapshot.createdAt}\nDefault theme: ${snapshot.appearance}\n\nThis draft is generated from configured design data, not AI. Acceptance checks below describe prototype behavior; they have not been verified against a production implementation.\n\n## Scope\n${screens.map(s=>`- ${s.name} (${s.id}) · ${snapshot.pages.find(p=>p.id===s.pageId)?.name || 'Page'} · ${s.stageWidth}px wide · theme ${s.appearance || 'file default'}`).join('\n')}\n\n## Configured behavior and acceptance checks\n${behavior.join('\n') || 'No prototype interactions configured in this scope.'}\n\n## Designer, accessibility, and review notes\n${notes.map(n=>`- [${n.kind || 'comment'}${n.resolvedAt?', resolved':''}] ${n.title?`${n.title}: `:''}${n.text}${n.replies.map(r=>`\n  - ${r.author}: ${r.text}`).join('')}`).join('\n') || 'No notes attached to this scope.'}\n\n## Review findings\n${issues.map(x=>`- ${x}`).join('\n') || 'No broken or out-of-scope links detected.'}\n\n## Open questions — not defined by the prototype\n${questions.map(q=>`- ${q}`).join('\n')}\n\n## Implementation boundary\nThe code uses Dreamscape’s Craft renderer, component registry, and stage context. It is a UI preview, not a standalone production app. Navigation, services, permissions, and backend behavior need application integration. Runtime component source is not bundled here.\n`;
  const svg=renderDiagramSvg({...diagram,frames:[],measureText:(text,font)=>text.length*font.size*.56})?.svg || '';
  const files:Record<string,string>={
    'spec.md':spec,'flow.svg':svg,'flow.diagram.json':JSON.stringify(diagram,null,2),
    'snapshot.json':JSON.stringify({...snapshot,screens,pages:snapshot.pages.filter(p=>screens.some(s=>s.pageId===p.id)),notes},null,2),
    'README.md':`# ${snapshot.fileName} handoff\n\nSnapshot ${snapshot.id}.\n\n- spec.md: editable requirements draft and open questions.\n- flow.svg: portable prototype flow diagram.\n- flow.diagram.json: Dreamscape diagram model (editable node/edge data).\n- snapshot.json: scoped design, custom component definitions, and notes.\n- screens/: per-screen Craft UI previews requiring the Dreamscape runtime.\n\nAI generation and GitHub delivery are not connected. Exporting this package does not publish or push anything.\n`,
  };
  screens.forEach(s=>{const nodes=readNodes(s);if(nodes.ROOT)files[`screens/${s.id}.tsx`]=selectionCode(nodes,'ROOT');else issues.push(`${s.name}: missing root component; preview could not be exported.`);});
  return {files,diagram,issues,spec,screens,questions};
}
export function changesSince(before:Snapshot|undefined,after:Snapshot) {
  if(!before)return ['First local handoff for this file.'];
  const changes:string[]=[];
  after.screens.forEach(s=>{const old=before.screens.find(x=>x.id===s.id);if(!old)changes.push(`Added: ${s.name}`);else if(JSON.stringify(old)!==JSON.stringify(s))changes.push(`Updated: ${s.name}`);});
  before.screens.filter(s=>!after.screens.some(x=>x.id===s.id)).forEach(s=>changes.push(`Removed: ${s.name}`));
  if(before.appearance!==after.appearance)changes.push('Updated file theme.');
  if(JSON.stringify(before.notes)!==JSON.stringify(after.notes))changes.push('Updated review notes.');
  if(JSON.stringify(before.components)!==JSON.stringify(after.components))changes.push('Updated custom component definitions.');
  return changes.length?changes:['No design changes since the last local handoff.'];
}
