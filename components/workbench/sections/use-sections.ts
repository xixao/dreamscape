'use client';
import { useCallback, useEffect, useState } from 'react';
import { frameRect } from '@/lib/canvas/viewport';
import { nanoid } from 'nanoid';
import { defaultScreen } from '@/components/blocks/known-types';
import { useEditor } from '@craftjs/core';
import { useCanvasDocument } from '../canvas-frame';
import { isEditableTarget } from '@/lib/dom';
import { containsRect, fitSection, type CanvasSection, type SectionChange } from '@/lib/canvas/sections';
import type { Screen } from '@/lib/files/repository';
import type { SectionsController } from './section-context';
export function useSectionsController(options: {
  pages?: import('@/lib/files/repository').Page[];
  moveToPage?: (section: CanvasSection, pageId: string) => void;
  diagramEdges?: import('@/lib/diagram/store').DiagramEdge[];
  diagramNodes?: import('@/lib/diagram/store').DiagramNode[];
  pageId:string; sections:CanvasSection[]; screens:Screen[]; heights:ReadonlyMap<string,number>;
  selectedFrameIds:ReadonlySet<string>; focusedScreenId:string;
  commit:(change:SectionChange)=>void; onStart:()=>void;
  focusFrame:(id:string)=>void; zoomTo:(section:CanvasSection)=>void;
}): SectionsController {
  const {actions,query,hasNodeSelection}=useEditor(state=>({hasNodeSelection:state.events.selected.size>0}));const canvas=useCanvasDocument();
  const [selected,setSelected]=useState<string|null>(null);
  const [drawing,setDrawing]=useState(false);
  const [page,setPage]=useState(options.pageId);
  if(page!==options.pageId){setPage(options.pageId);setSelected(null);setDrawing(false);}
  if(hasNodeSelection && selected!==null)setSelected(null);
  const onCommit=options.commit;
  const commit=useCallback((change:SectionChange)=>{
    if(!query.getState().nodes.ROOT) actions.history.ignore().deserialize(defaultScreen().layout);
    onCommit(change);
  },[actions,query,onCommit]);
  function select(id:string|null){setSelected(id);if(id){actions.selectNode();options.onStart();}}
  function remove(section:CanvasSection, deleteContents=false){
    const removedScreens=deleteContents?options.screens.filter(s=>containsRect(section,frameRect(s,options.heights))).map(s=>s.id):[];
    const removedNodes=deleteContents?(options.diagramNodes??[]).filter(n=>containsRect(section,n)).map(n=>n.id):[];
    commit({sections:options.sections.filter(s=>s.id!==section.id&&(!deleteContents||!containsRect(section,s))),positions:[],...(deleteContents?{
      screens:options.screens.filter(s=>!removedScreens.includes(s.id)),
      diagram:{nodes:(options.diagramNodes??[]).filter(n=>!removedNodes.includes(n.id)),edges:(options.diagramEdges??[]).filter(e=>![e.source,e.target].some(end=>removedNodes.includes(end.nodeId??'')||removedScreens.includes(end.screenId??'')))}
    }:{})});setSelected(null);
  }
  function start(){options.onStart();actions.selectNode();setSelected(null);setDrawing(true);}
  function wrap(ids?:string[]){
    const chosen=new Set(ids??(options.selectedFrameIds.size?[...options.selectedFrameIds]:[options.focusedScreenId]));
    const bounds=fitSection(options.screens.filter(s=>chosen.has(s.id)),options.heights);if(!bounds)return;
    const section={id:nanoid(10),name:`Section ${options.sections.length+1}`,...bounds};
    commit({sections:[...options.sections,section],positions:[]});select(section.id);setDrawing(false);options.zoomTo(section);
  }
  useEffect(()=>{
    function key(event:KeyboardEvent){
      if(event.defaultPrevented||isEditableTarget(event.target)||document.querySelector('[role="dialog"],[role="menu"]'))return;
      if(event.key==='Escape'){setSelected(null);setDrawing(false);}
      if(selected && options.sections.some(s=>s.id===selected) && (event.key==='Delete'||event.key==='Backspace')){
        event.preventDefault();event.stopImmediatePropagation();
        commit({sections:options.sections.filter(s=>s.id!==selected),positions:[]});setSelected(null);
      }
    }
    function clear(){setSelected(null);}
    document.addEventListener('keydown',key,true);
    canvas?.document.addEventListener('pointerdown',clear);
    return()=>{document.removeEventListener('keydown',key,true);canvas?.document.removeEventListener('pointerdown',clear);};
  },[selected,options.sections,commit,canvas]);
  return {...options,remove,commit,selected:options.sections.some(s=>s.id===selected)?selected:null,select,drawing,setDrawing,start,wrap};
}
