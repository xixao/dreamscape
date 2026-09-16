import {describe,it,expect} from 'vitest';
import {createAnnotation,CATEGORIES,FORMATS,annotationSchema,readAnnotationPreset} from './kit';
import {createInitialDiagramState,diagramReducer} from '@/lib/diagram/store';
import {validateDiagram} from '@/lib/files/validate';
import {renderDiagramSvg} from '@/lib/diagram/export';

describe('accessibility kit',()=>{
  it('creates every category and format with valid persisted data',()=>{
    for(const category of CATEGORIES)for(const format of FORMATS){
      const node=createAnnotation(category,format,{x:400,y:300});
      expect(annotationSchema.safeParse(node.annotation).success).toBe(true);
      const result=validateDiagram({nodes:[node],edges:[]});
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).toContain(category);
      expect(node.x+node.width/2).toBe(400);
    }
  });
  it('undoes and redoes property changes, conversion, and deletion',()=>{
    const node=createAnnotation('image','pin',{x:400,y:300});
    let state=diagramReducer(createInitialDiagramState(),{type:'add',node});
    const annotation={...node.annotation!,format:'card' as const,values:{alt:'A tree & a <bridge>'},resolved:true};
    state=diagramReducer(state,{type:'setAnnotation',id:node.id,annotation});
    expect(state.nodes[0].width).toBe(360);
    expect(node.annotation!.values).toEqual({});
    state=diagramReducer(state,{type:'undo'});
    expect(state.nodes[0].annotation!.format).toBe('pin');
    state=diagramReducer(state,{type:'redo'});
    expect(state.nodes[0].annotation!.values.alt).toContain('<bridge>');
    state=diagramReducer(state,{type:'delete',ids:[node.id]});
    expect(state.nodes).toHaveLength(0);
    state=diagramReducer(state,{type:'undo'});
    expect(state.nodes[0].annotation).toEqual(annotation);
  });
  it('rejects bad drag payloads and annotation data',()=>{
    expect(readAnnotationPreset('not json')).toBeNull();
    expect(readAnnotationPreset('{"category":"image","format":"card"}')).toEqual({category:'image',format:'card'});
    expect(readAnnotationPreset('{"category":"invalid","format":"card"}')).toBeNull();
    const node=createAnnotation('image','card',{x:0,y:0});
    expect(validateDiagram({nodes:[{...node,annotation:{...node.annotation!,number:-1}}],edges:[]}).ok).toBe(false);
  });
  it('exports annotation content with escaped text instead of an empty rectangle',()=>{
    const node=createAnnotation('image','card',{x:400,y:300});
    node.annotation!.values.alt='A tree & a <bridge>';
    const svg=renderDiagramSvg({nodes:[node],edges:[],frames:[],measureText:t=>t.length*7});
    expect(svg?.svg).toContain('A tree &amp; a &lt;bridge&gt;');
    expect(svg?.svg).toContain('data-annotation="image"');
  });
});

describe('designer toolkit',()=>{
 it('keeps Designer metadata through edits, duplication, undo, and validation',async()=>{
  const {createDesignerAnnotation}=await import('./kit');
  const node=createDesignerAnnotation('form','card',{x:400,y:300});
  const a={...node.annotation!,values:{type:'Text Area',required:'Yes',error:'Enter a message'}};
  let state=diagramReducer(createInitialDiagramState({nodes:[node],edges:[]}),{type:'setAnnotation',id:node.id,annotation:a});
  state=diagramReducer(state,{type:'duplicate',pairs:[{sourceId:node.id,newId:'copy'}]});
  expect(state.nodes[1].annotation).toEqual(a);
  expect(validateDiagram({nodes:state.nodes,edges:[]}).ok).toBe(true);
  state=diagramReducer(state,{type:'undo'});
  expect(state.nodes).toHaveLength(1);
  expect(state.nodes[0].annotation!.library).toBe('designer');
 });
});
