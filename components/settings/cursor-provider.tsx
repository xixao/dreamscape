'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {CURSOR_SIZE_STORAGE_KEY,CURSOR_STORAGE_KEY,DEFAULT_CURSOR_SIZE,parseCursor,parseCursorSize,cursorStyles,type CursorSize} from '@/lib/ui-cursor';
const Context=createContext({selected:'default',size:DEFAULT_CURSOR_SIZE as CursorSize,ready:false,error:'',select:(_id:string)=>{},setSize:(_size:CursorSize)=>{}});
export function CursorProvider({children}:{children:ReactNode}) {
 const [selected,setSelected]=useState('default'),[size,setSizeState]=useState<CursorSize>(DEFAULT_CURSOR_SIZE),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  // Browser-only preference hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  try{setSelected(parseCursor(localStorage.getItem(CURSOR_STORAGE_KEY)));setSizeState(parseCursorSize(localStorage.getItem(CURSOR_SIZE_STORAGE_KEY)));}catch{setError('Cursor storage is unavailable. Changes will last for this visit.');}
  setReady(true);
  const sync=(e:StorageEvent)=>{if(e.key===CURSOR_STORAGE_KEY||e.key===null)setSelected(parseCursor(e.newValue));if(e.key===CURSOR_SIZE_STORAGE_KEY||e.key===null)setSizeState(parseCursorSize(e.newValue));};
  window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
 },[]);
 useEffect(()=>{
  const style=document.createElement('style');style.dataset.dreamscapeCursor='';style.textContent=cursorStyles(selected,size);document.head.appendChild(style);
  return()=>style.remove();
 },[selected,size]);
 function persist(key:string,value:string){try{localStorage.setItem(key,value);setError('');}catch{setError('Could not save your cursor. Changes will last for this visit.');}}
 function select(id:string){const value=parseCursor(id);setSelected(value);persist(CURSOR_STORAGE_KEY,value);}
 function setSize(next:CursorSize){const value=parseCursorSize(String(next));setSizeState(value);persist(CURSOR_SIZE_STORAGE_KEY,String(value));}
 return <Context.Provider value={{selected,size,ready,error,select,setSize}}>{children}</Context.Provider>;
}
export const useUICursor=()=>useContext(Context);
