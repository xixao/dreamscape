import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CommentLayer, DEFAULT_STAGE_COMMENTS } from './comment-layer';
import { createCommentStore } from '@/lib/comments/store';

it('previews a zoomed pin drag, saves once on release, and suppresses opening the thread', () => {
  const store=createCommentStore('drag-test');
  const thread=store.add({x:40,y:60,text:'Keep this comment',author:'Designer',canvas:true});
  const onMovePin=vi.fn((id,position)=>store.move(id,position));
  const onPinClick=vi.fn();
  render(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[thread]} zoom={0.5} artboardRect={{left:100,top:200,width:500,height:500}} onMovePin={onMovePin} onPinClick={onPinClick}/>);
  const pin=screen.getByRole('button',{name:'Comment 1'});
  fireEvent.pointerDown(pin,{button:0,pointerId:1,clientX:130,clientY:210});
  fireEvent.pointerMove(pin,{pointerId:1,clientX:160,clientY:230});
  expect(pin).toHaveStyle({left:'150px',top:'222px'});
  expect(onMovePin).not.toHaveBeenCalled();
  fireEvent.pointerUp(pin,{pointerId:1,clientX:160,clientY:230});
  fireEvent.click(pin);
  expect(onPinClick).not.toHaveBeenCalled();
  expect(onMovePin).toHaveBeenCalledTimes(1);
  expect(createCommentStore('drag-test').list()[0]).toMatchObject({x:100,y:100,text:'Keep this comment',canvas:true});
  fireEvent.pointerDown(pin,{button:0,pointerId:2,clientX:130,clientY:210});
  fireEvent.pointerUp(pin,{pointerId:2,clientX:130,clientY:210});
  fireEvent.click(pin);
  expect(onPinClick).toHaveBeenCalledWith(thread.id);
});

it('cancels a drag with Escape without saving a position', () => {
  const store=createCommentStore('cancel-drag-test');
  const thread=store.add({x:40,y:60,text:'Note',author:'Designer'});
  const onMovePin=vi.fn();
  render(<CommentLayer {...DEFAULT_STAGE_COMMENTS} threads={[thread]} zoom={1} artboardRect={{left:0,top:0,width:500,height:500}} onMovePin={onMovePin}/>);
  const pin=screen.getByRole('button',{name:'Comment 1'});
  fireEvent.pointerDown(pin,{button:0,pointerId:1,clientX:40,clientY:40});
  fireEvent.pointerMove(pin,{pointerId:1,clientX:80,clientY:80});
  fireEvent.keyDown(window,{key:'Escape'});
  fireEvent.pointerUp(pin,{pointerId:1,clientX:80,clientY:80});
  expect(onMovePin).not.toHaveBeenCalled();
  expect(pin).toHaveStyle({left:'40px',top:'32px'});
});
