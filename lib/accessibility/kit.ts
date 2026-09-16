import { DESIGNER_KIT, DESIGNER_KINDS, type DesignerKind } from './designer-kit';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { DiagramNode } from '@/lib/diagram/store';

export const CATEGORIES = ['landmark', 'tab-order', 'image', 'page-title', 'interactive', 'heading', 'reading-order', 'other'] as const;
export const FORMATS = ['pin', 'lasso', 'bracket', 'card', 'summary', 'sticky'] as const;
export const annotationSchema = z.object({
  library: z.enum(['accessibility','designer']).optional(), template: z.enum(DESIGNER_KINDS).optional(),
  category: z.enum(CATEGORIES), format: z.enum(FORMATS),
  number: z.number().int().min(1).max(9999),
  position: z.enum(['above', 'below', 'left', 'right', 'center']),
  audience: z.enum(['Default', 'Dev', 'Designer', 'Both', 'None']),
  resolved: z.boolean(), showNumber: z.boolean(),
  values: z.record(z.string().max(60), z.string().max(4000)),
});
export type Annotation = z.infer<typeof annotationSchema>;
export type Category = Annotation['category'];
export type KitField = { key: string; label: string; options?: string[] };
export const KIT: Record<Category, { label: string; color: string; fields: KitField[] }> = {
  landmark: { label: 'Landmark', color: '#A65D4D', fields: [{key:'element',label:'Element',options:['Header','Navigation','Main','Section','Aside','Form','Footer']},{key:'name',label:'Accessible name'}] },
  'tab-order': { label: 'Tab Order', color: '#876D38', fields: [{key:'order',label:'Tab order'}] },
  image: { label: 'Image', color: '#34845D', fields: [{key:'imageType',label:'Image type',options:['Decorative','Informative','Functional']},{key:'alt',label:'Alt text'}] },
  'page-title': { label: 'Page Title', color: '#54732F', fields: [{key:'pageTitle',label:'Page title'}] },
  interactive: { label: 'Interactive Element', color: '#36799A', fields: [{key:'element',label:'Element',options:['Button','Link','Input']},{key:'name',label:'Accessible name'},{key:'role',label:'Role',options:['Button','Tab','Combo Box','Switch','Menu Item','Checkbox','Radio','Slider']},{key:'type',label:'Type'}] },
  heading: { label: 'Heading', color: '#5855A5', fields: [{key:'level',label:'Heading level',options:['H1','H2','H3','H4','H5','H6']},{key:'heading',label:'Heading text'},{key:'hidden',label:'Visually hidden',options:['No','Yes']},{key:'cssOnly',label:'CSS-only',options:['No','Yes']}] },
  'reading-order': { label: 'Reading Order', color: '#99539F', fields: [{key:'order',label:'Reading order'}] },
  other: { label: 'Other', color: '#AA4D56', fields: [{key:'title',label:'Card title'},{key:'concern',label:'Concern'},{key:'issues',label:'Possible issues'},{key:'dependencies',label:'Dependencies'},{key:'recommendation',label:'Recommendation'}] },
};
export const SUMMARY_FIELDS: KitField[] = [{key:'pageName',label:'Page name'},{key:'author',label:'Annotated by'},{key:'sectionTitle',label:'Section title'},{key:'notes',label:'Section notes'}];
export function annotationFields(a: Annotation): KitField[] {
  if(a.library==='designer' && a.template) return [{key:'title',label:'Title'},...DESIGNER_KIT[a.template].fields,...(a.template==='post-it'?[]:[{key:'details',label:'Additional details'},{key:'code',label:'Code snippet'},{key:'docs',label:'Documentation link'}])];
  return a.format === 'summary' ? SUMMARY_FIELDS : [...KIT[a.category].fields, {key:'notes',label:'Note'}, {key:'code',label:'Code snippet'}];
}
export function stampLabel(a: Annotation): string {
  const v = a.values;
  if(a.library==='designer'&&a.template)return v.label||v.title||v.level||v.element||v.type||DESIGNER_KIT[a.template].label;
  return a.category === 'heading' ? v.level || 'Heading' : a.category === 'image' ? v.imageType || 'Image' : a.category === 'landmark' ? v.element || 'Landmark' : a.category === 'tab-order' ? `Tab ${v.order || a.number}` : a.category === 'reading-order' ? `Read ${v.order || a.number}` : a.category === 'other' ? v.title || 'Note' : KIT[a.category].label;
}
export function annotationSize(format: Annotation['format']) {
  return format === 'summary' ? {width:640,height:440} : format === 'card' ? {width:360,height:520} : format === 'sticky' ? {width:260,height:200} : format === 'lasso' || format === 'bracket' ? {width:240,height:160} : {width:200,height:64};
}
export function annotationHeight(a: Annotation, width=360): number {
  if(a.format!=='card')return annotationSize(a.format).height;
  const fields=annotationFields(a).filter(f=>a.library==='designer'?!!a.values[f.key]:a.values[f.key]||(!['notes','code','hidden','cssOnly'].includes(f.key)&&f.key!=='title'));
  return 124 + fields.reduce((height,f)=>height + 32 + Math.max(1, Math.ceil((a.values[f.key]||`Add ${f.label.toLowerCase()}`).length/Math.max(12,(width-26)/7))) * 18,0);
}
export function createAnnotation(category: Category, format: Annotation['format'], center: {x:number;y:number}, number=1): DiagramNode {
  const annotation:Annotation={category,format,number,position:'above',audience:'Default',resolved:false,showNumber:true,values:{}};
  const size = {...annotationSize(format),height:annotationHeight(annotation)};
  return {id:nanoid(10),kind:'rect',color:'neutral',text:'',...size,x:center.x-size.width/2,y:center.y-size.height/2,
    annotation};
}
export const ANNOTATION_MIME = 'application/x-dreamscape-accessibility';
export const ANNOTATION_DRAG = 'dreamscape:accessibility-drag';
export function readAnnotationPreset(raw:string): {category:Category;format:Annotation['format'];template?:DesignerKind} | null {
  try { const parsed=z.object({category:z.enum(CATEGORIES),format:z.enum(FORMATS),template:z.enum(DESIGNER_KINDS).optional()}).safeParse(JSON.parse(raw)); return parsed.success?parsed.data:null; } catch {return null;}
}

export function annotationMeta(a: Annotation) {
  if(a.library==='designer'&&a.template) {
    const meta=DESIGNER_KIT[a.template];
    return a.template==='note'?{...meta,color:a.values.type==='Concern'?'#3E1A70':a.values.type==='Question'?'#5E3B8C':meta.color}:meta;
  }
  return KIT[a.category];
}
export function createDesignerAnnotation(template:DesignerKind,format:Annotation['format'],center:{x:number;y:number},number=1):DiagramNode {
  const node=createAnnotation('other',template==='post-it'?'sticky':format,center,number);
  const annotation:Annotation={...node.annotation!,library:'designer',template,values:{}};
  const height=annotationHeight(annotation,node.width);
  return {...node,height,y:center.y-height/2,annotation};
}
