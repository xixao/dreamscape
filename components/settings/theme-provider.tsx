'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { DARK, DEFAULTS, PRESET_THEMES, parsePreferences, STORAGE_KEY, themeVariables, type ThemePreferences, type UITheme } from '@/lib/ui-theme';
function apply(theme: UITheme) {
 const root=document.documentElement;
 for(const [key,value] of Object.entries(themeVariables(theme))) root.style.setProperty(key,value);
 root.style.colorScheme=theme.mode;
 root.dataset.chromeMode=theme.mode;
}
const Context=createContext<{
 preferences: ThemePreferences; theme: UITheme; ready: boolean; error: string;
 select: (id:string)=>void; save: (theme:UITheme)=>void; remove: (id:string)=>void; preview:(theme:UITheme|null)=>void;
}|null>(null);
export function ThemeProvider({children}:{children:ReactNode}) {
 const [preferences,setPreferences]=useState<ThemePreferences>({selected:'dark',custom:[]});
 const [ready,setReady]=useState(false), [error,setError]=useState('');
 const [draft,setDraft]=useState<UITheme|null>(null);
 const theme=[...DEFAULTS,...PRESET_THEMES,...preferences.custom].find(t=>t.id===preferences.selected)??DARK;
 useLayoutEffect(()=>{
  // One-time browser-storage hydration must happen after SSR, before paint.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  try {setPreferences(parsePreferences(localStorage.getItem(STORAGE_KEY)));} catch {setError('Theme storage is unavailable. Changes will last for this visit.');}
  setReady(true);
 },[]);
 useLayoutEffect(()=>{if(ready) apply(draft??theme);},[theme,draft,ready]);
 useEffect(()=>{
  const sync=(event:StorageEvent)=>{if(event.key===STORAGE_KEY) setPreferences(parsePreferences(event.newValue));};
  window.addEventListener('storage',sync); return()=>window.removeEventListener('storage',sync);
 },[]);
 function update(next:ThemePreferences) {
  setPreferences(next);setDraft(null);
  try {localStorage.setItem(STORAGE_KEY,JSON.stringify(next));setError('');} catch {setError('Could not save this theme on this device. Changes will last for this visit.');}
 }
 return <Context.Provider value={{preferences,theme,ready,error,preview:setDraft,
  select:id=>update({...preferences,selected:id}),
  save:theme=>{if(!theme.id.startsWith('custom-'))return;update({selected:theme.id,custom:[...preferences.custom.filter(t=>t.id!==theme.id),theme]});},
  remove:id=>update({selected:preferences.selected===id?'dark':preferences.selected,custom:preferences.custom.filter(t=>t.id!==id)}),
 }}>{children}</Context.Provider>;
}
export function useUITheme(){const value=useContext(Context);if(!value)throw new Error('ThemeProvider missing');return value;}
