import {act,fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {AnnotationLibrary} from './annotation-library';
import {DiagramDropSurface} from '../diagram/diagram-drop-surface';
import {ANNOTATION_MIME} from '@/lib/accessibility/kit';

describe('annotation library',()=>{
 it('filters categories and inserts the chosen format',()=>{
  const onInsert=vi.fn();render(<AnnotationLibrary onInsert={onInsert} onClose={vi.fn()} onNote={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Search accessibility annotations'),{target:{value:'heading'}});
  expect(screen.queryByRole('button',{name:'Add Image pin'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Card'}));
  fireEvent.click(screen.getByRole('button',{name:'Add Heading card'}));
  expect(onInsert).toHaveBeenCalledWith('heading','card');
 });
 it('drops annotation metadata at the pointer location across pan and zoom',()=>{
  const onAnnotation=vi.fn(),onInsert=vi.fn();
  render(<><AnnotationLibrary onInsert={vi.fn()} onClose={vi.fn()} onNote={vi.fn()}/><DiagramDropSurface viewport={{x:100,y:50,zoom:2}} onInsert={onInsert} onAnnotation={onAnnotation}/></>);
  const data=new Map<string,string>();const dataTransfer={types:[ANNOTATION_MIME],setData:(k:string,v:string)=>data.set(k,v),getData:(k:string)=>data.get(k)??'',effectAllowed:'',dropEffect:''};
  fireEvent.dragStart(screen.getByRole('button',{name:'Add Landmark pin'}),{dataTransfer});
  const surface=screen.getByTestId('diagram-drop-surface');vi.spyOn(surface,'getBoundingClientRect').mockReturnValue({left:20,top:30} as DOMRect);
  const drop=new Event('drop',{bubbles:true,cancelable:true});Object.assign(drop,{dataTransfer,clientX:420,clientY:280});fireEvent(surface,drop);
  expect(onAnnotation).toHaveBeenCalledExactlyOnceWith('landmark','pin',{x:150,y:100});
  expect(onInsert).not.toHaveBeenCalled();expect(screen.queryByTestId('diagram-drop-surface')).not.toBeInTheDocument();
  fireEvent.dragStart(screen.getByRole('button',{name:'Add Landmark pin'}),{dataTransfer});act(()=>window.dispatchEvent(new Event('dragend')));
  expect(screen.queryByTestId('diagram-drop-surface')).not.toBeInTheDocument();
 });
});
