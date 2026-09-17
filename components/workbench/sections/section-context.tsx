'use client';
import { createContext, useContext } from 'react';
import type { CanvasSection, SectionChange } from '@/lib/canvas/sections';
import type { Screen } from '@/lib/files/repository';
export type SectionsController = {
  pages?: import('@/lib/files/repository').Page[]; pageId?: string;
  moveToPage?: (section: CanvasSection, pageId: string) => void;
  diagramNodes?: import('@/lib/diagram/store').DiagramNode[];
  sections: CanvasSection[]; screens: Screen[]; heights: ReadonlyMap<string,number>;
  selected: string|null; select: (id:string|null)=>void;
  drawing: boolean; setDrawing:(active:boolean)=>void;
  remove: (section: CanvasSection, deleteContents?: boolean) => void;
  commit:(change:SectionChange)=>void; start:()=>void; wrap:(ids?:string[])=>void;
  focusFrame:(id:string)=>void; zoomTo:(section:CanvasSection)=>void;
};
export const SectionsContext=createContext<SectionsController|null>(null);
export const useSections=()=>useContext(SectionsContext);
