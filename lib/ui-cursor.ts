import hotspots from './ui-cursor-hotspots.json';
export const CURSOR_STORAGE_KEY = 'dreamscape.ui-cursor.v1';
export const CURSORS = [
 {id:'default',name:'System default'},
 ...['Unicorn','Cat','UFO','Dragon','Rocket','Magic Wand','Butterfly','Hummingbird','Fox','Lightning Bolt','Naruto','Kuromi'].map(name=>({id:({'Magic Wand':'wand','Lightning Bolt':'lightning'} as Record<string,string>)[name]??name.toLowerCase(),name})),
 {id:'d20',name:'D20'}, {id:'sword',name:'Sword'}, {id:'staff',name:'Wizard Staff'}, {id:'claw',name:'Dragon Claw'}, {id:'chest',name:'Treasure Chest'},
];
export function parseCursor(value:string|null) { return CURSORS.some(cursor=>cursor.id===value)?value!:'default'; }
export const CURSOR_SIZE_STORAGE_KEY = 'dreamscape.ui-cursor-size.v1';
// Every cursor ships as /cursors/<id>-<size>.png for each size below, made
// from <id>-original.png with `sips -z <size> <size>`. The hotspots in
// ui-cursor-hotspots.json are measured on the 48 px image and scale with it.
// Browsers ignore cursor images larger than 128 px, so sizes stay under that.
export const DEFAULT_CURSOR_SIZE = 48;
export const CURSOR_SIZES = [{size:48,name:'Default'},{size:64,name:'Large'},{size:96,name:'Extra large'}] as const;
export type CursorSize = (typeof CURSOR_SIZES)[number]['size'];
export function parseCursorSize(value:string|null):CursorSize { const size=Number(value); return CURSOR_SIZES.some(option=>option.size===size)?size as CursorSize:DEFAULT_CURSOR_SIZE; }
export function cursorValue(id:string,size:CursorSize=DEFAULT_CURSOR_SIZE) { const valid=parseCursor(id); if(valid==='default')return 'auto'; const [x,y]=hotspots[valid as keyof typeof hotspots]; const scale=size/DEFAULT_CURSOR_SIZE; return `url("/cursors/${valid}-${size}.png") ${Math.round(x*scale)} ${Math.round(y*scale)}, auto`; }
export function cursorStyles(id:string,size:CursorSize=DEFAULT_CURSOR_SIZE) {
 if(parseCursor(id)==='default') return '';
 const value=cursorValue(id,size);
 return `html, body { cursor: ${value}; }
 :where(button:not(:disabled), a, [role="button"], [role="radio"], [role="tab"], select:not(:disabled), summary), .cursor-pointer, .cursor-default { cursor: ${value}; }
 input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, [contenteditable="true"], .cursor-text { cursor: text; }
 .cursor-grab { cursor: grab; } .cursor-grabbing { cursor: grabbing; }
 .cursor-crosshair { cursor: crosshair; } .cursor-move { cursor: move; }
 :disabled, .cursor-not-allowed { cursor: not-allowed; }`;
}
