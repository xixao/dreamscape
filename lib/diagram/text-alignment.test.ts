import { expect, it } from 'vitest';
import { createInitialDiagramState, diagramReducer } from './store';
it('aligns multiple shapes and restores alignment with undo/redo', () => {
 const original = createInitialDiagramState({nodes:['a','b'].map(id=>({id,kind:'rect',x:0,y:0,width:200,height:100,text:'Text',color:'neutral'})),edges:[]});
 const changed = diagramReducer(original,{type:'setTextStyle',ids:['a','b'],textAlign:'right'});
 expect(changed.nodes.map(n=>n.textAlign)).toEqual(['right','right']);
 const undone = diagramReducer(changed,{type:'undo'});
 expect(undone.nodes.map(n=>n.textAlign)).toEqual([undefined,undefined]);
 expect(diagramReducer(undone,{type:'redo'}).nodes.map(n=>n.textAlign)).toEqual(['right','right']);
});
