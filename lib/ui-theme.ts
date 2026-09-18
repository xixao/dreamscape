import auditedPalettes from './ui-theme-palettes.json';
export const ROLE_GROUPS = {
  Backgrounds: { 'bg-canvas': 'Canvas', 'bg-app': 'Application', 'bg-panel': 'Panels and menus', 'bg-surface': 'Controls and surfaces', 'bg-hover': 'Hover and selection' },
  'Text and icons': { 'text-primary': 'Primary text', 'text-secondary': 'Secondary text', 'text-muted': 'Labels', 'text-faint': 'Hints and placeholders', 'text-on-accent': 'Text on accent' },
  Accents: { 'accent-primary': 'Primary action', 'accent-focus': 'Focus and links', 'accent-secondary': 'Secondary accent' },
  Status: { 'status-success': 'Success', 'status-warning': 'Warning', 'status-error': 'Error' },
} as const;
export type Role = keyof typeof ROLE_GROUPS.Backgrounds | keyof typeof ROLE_GROUPS['Text and icons'] | keyof typeof ROLE_GROUPS.Accents | keyof typeof ROLE_GROUPS.Status;
export type Colors = Record<Role, string>;
export type Mode = 'dark' | 'light';
export type UITheme = { id: string; name: string; mode: Mode; colors: Colors };
export const ROLES = Object.values(ROLE_GROUPS).flatMap(group => Object.keys(group)) as Role[];
export const STORAGE_KEY = 'dreamscape.ui-themes.v1';
const palette = (values: string): Colors => Object.fromEntries(ROLES.map((role, i) => [role, values.split(' ')[i]])) as Colors;
export const DARK: UITheme = { id: 'dark', name: 'Dark', mode: 'dark', colors: palette('#14121B #1B1922 #23212C #2A2836 #373444 #EAE8F0 #C6C2D4 #918CA3 #5C5870 #FFFFFF #5568C4 #8C97DB #9BA6EC #4CAF7D #E8B34B #E05D5D') };

export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05);
}
const backgrounds: Role[] = ['bg-canvas', 'bg-app', 'bg-panel', 'bg-surface', 'bg-hover'];
const readable: Role[] = ['text-primary','text-secondary','text-muted','text-faint','accent-focus','accent-secondary','status-success','status-warning','status-error'];
// Keep the hue/saturation, moving HSL lightness the smallest passing amount.
function nudge(hex: string, passes: (color: string) => boolean): string {
  if (passes(hex)) return hex;
  const [r,g,b] = hex.slice(1).match(/../g)!.map(v => parseInt(v,16)/255);
  const max = Math.max(r,g,b), min = Math.min(r,g,b), delta = max-min, l = (max+min)/2;
  const s = delta === 0 ? 0 : delta/(1-Math.abs(2*l-1));
  const h = delta === 0 ? 0 : max === r ? ((g-b)/delta+6)%6 : max === g ? (b-r)/delta+2 : (r-g)/delta+4;
  const at = (lightness: number) => {
    const c=(1-Math.abs(2*lightness-1))*s, x=c*(1-Math.abs(h%2-1)), m=lightness-c/2;
    const rgb = h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
    return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  };
  for(let step=1;step<=10000;step++) for(const sign of [-1,1]) {
    const next=l+sign*step/10000;
    if(next>=0 && next<=1) { const color=at(next); if(passes(color)) return color; }
  }
  throw new Error('No accessible shade for this palette');
}
export function accessiblePalette(input: Colors): Colors {
  const colors={...input};
  for(const role of readable) colors[role]=nudge(colors[role], c=>backgrounds.every(bg=>contrast(c,colors[bg])>=4.5));
  colors['accent-primary']=nudge(colors['accent-primary'],c=>backgrounds.every(bg=>contrast(c,colors[bg])>=3));
  colors['text-on-accent']=nudge(colors['text-on-accent'],c=>contrast(c,colors['accent-primary'])>=4.5);
  return colors;
}
export function contrastChecks(colors: Colors) {
  return [
    ...readable.flatMap(role=>backgrounds.map(bg=>({role, background:bg, ratio:contrast(colors[role],colors[bg]), minimum:4.5}))),
    ...backgrounds.map(bg=>({role:'accent-primary',background:bg,ratio:contrast(colors['accent-primary'],colors[bg]),minimum:3})),
    {role:'text-on-accent',background:'accent-primary',ratio:contrast(colors['text-on-accent'],colors['accent-primary']),minimum:4.5},
  ];
}
export const LIGHT: UITheme = {id:'light',name:'Light',mode:'light',colors:auditedPalettes.light};
const RAW_PRESETS = {
 naruto: {
  dark: palette('#151311 #1C1A17 #24211C #2C2822 #3A3529 #F7F1E8 #D6C9B8 #A3957F #665C4E #1C1A17 #F28C28 #F7A94F #F5D44A #4CAF7D #F5D44A #E0453A'),
  light: palette('#F3ECE2 #FFF8EF #FFFFFF #FFEBD6 #F5DCBF #1F2A44 #3E4660 #6B7186 #A9AEBD #FFFFFF #1F3A93 #3355C2 #F28C28 #2E8B57 #B8860B #C62828'),
 },
 kuromi: {
  dark: palette('#0C0C0E #111113 #19181D #222027 #2E2B36 #F7F5F2 #D2CFD9 #9A97A6 #5B5866 #111113 #F04E98 #F77BB4 #9B6BD9 #4CAF7D #E8B34B #FF5A5F'),
  light: palette('#EFEDEA #F7F5F2 #FFFFFF #F3E6EE #F9C6D9 #111111 #3A3942 #6E6C78 #ABA9B4 #FFFFFF #C2185B #E0338A #7A4BC2 #2E8B57 #B8860B #D32F2F'),
 },
 // Missing roles are completed with matching neutral shades; all palettes
 // then pass through the same hue-preserving contrast adjustment.
 spartans: {
  dark: palette('#101614 #151D19 #1A2320 #22302B #2E3F38 #EAF0EC #C2CFC8 #96AA9E #657C70 #0F1A15 #0DB14B #3DCB74 #18453B #4CAF7D #E8B34B #E05D5D'),
  light: palette('#EEF3F0 #F7FAF8 #FFFFFF #DDEAE3 #C9DDD1 #0F1A15 #3D5347 #657B6E #91A398 #FFFFFF #18453B #0DB14B #4A7D6A #2E8B57 #B8860B #C62828'),
 },
 wolverines: {
  dark: palette('#0B1524 #101B2F #14223A #1C2E4A #27406A #EEF2F8 #C4CEDF #97AAC7 #647A9A #00274C #FFCB05 #FFD84D #4A7BC7 #4CAF7D #E8B34B #E05D5D'),
  light: palette('#EEF1F6 #F8FAFD #FFFFFF #FFF4C2 #E5EAF3 #00274C #3F5670 #687C96 #9BA9BB #FFFFFF #00274C #2B5FA6 #FFCB05 #2E8B57 #B8860B #C62828'),
 },
 sonic: {
  dark: palette('#0C1424 #101A31 #142040 #1B2B55 #26397A #EEF3FF #C3CEEA #94A7D1 #6075A4 #FFFFFF #2A63FF #5C8CFF #FFD400 #43B54A #FFD400 #E53935'),
  light: palette('#EAF1FF #F6F9FF #FFFFFF #FFF3B8 #DEE7FA #0E1A3A #3A507A #667BA1 #95A5C3 #FFFFFF #1B4FD8 #2A63FF #E8383A #43B54A #B8860B #E53935'),
 },
 goth: {
  dark: palette('#070607 #0D0C0F #141317 #1C1A20 #29262E #E6E1E8 #B8B2BD #7D7885 #5F5968 #F2EDF2 #7A1F2E #A83A4B #4E3B6B #3F7A5A #B08D3C #C62828'),
  light: palette('#E9E5E6 #F3F0F1 #FFFFFF #E1DADC #D3C9CD #141317 #4B444E #756C79 #A59BAA #FFFFFF #5E1523 #7A1F2E #3E2E56 #3F7A5A #B08D3C #C62828'),
 },
};
// Audited ahead of time: never run the shade-search algorithm during rendering.
export const EASTER_EGG_THEMES: Record<string,Record<Mode,Colors>> = auditedPalettes.presets;
export const PRESET_ALIASES: Record<string, string> = { msu: 'spartans', umich: 'wolverines' };
export function hiddenPreset(name: string, mode: Mode): Colors | undefined {
 const input = name.trim().toLowerCase();
 const key = Object.hasOwn(PRESET_ALIASES, input) ? PRESET_ALIASES[input] : input;
 return Object.hasOwn(EASTER_EGG_THEMES,key) ? {...EASTER_EGG_THEMES[key][mode]} : undefined;
}
export const PRESET_ADJUSTMENTS = Object.entries(RAW_PRESETS).flatMap(([name,modes])=>(['dark','light'] as const).flatMap(mode=>ROLES.filter(role=>modes[mode][role]!==EASTER_EGG_THEMES[name][mode][role]).map(role=>({name,mode,role,from:modes[mode][role],to:EASTER_EGG_THEMES[name][mode][role]}))));
export const DEFAULTS = [DARK,LIGHT];
export const PRESET_THEMES: UITheme[] = Object.entries(EASTER_EGG_THEMES).flatMap(([name,modes]) =>
 (['dark','light'] as const).map(mode => ({id:`preset-${name}-${mode}`,name,mode,colors:modes[mode]})));

export type ThemePreferences = { selected: string; custom: UITheme[] };
export function parsePreferences(raw: string | null): ThemePreferences {
 try {
  const data=JSON.parse(raw??'null');
  const custom: UITheme[]=Array.isArray(data?.custom)?data.custom.filter((t: UITheme)=>t && typeof t.id==='string' && t.id.startsWith('custom-') && typeof t.name==='string' && t.name.trim().length>0 && t.name.length<=60 && ['dark','light'].includes(t.mode) && t.colors && ROLES.every(r=>/^#[0-9a-f]{6}$/i.test(t.colors[r]))):[];
  return {custom,selected:[...DEFAULTS,...PRESET_THEMES,...custom].some(t=>t.id===data?.selected)?data.selected:'dark'};
 } catch {return {selected:'dark',custom:[]};}
}
export function themeVariables(theme: UITheme): Record<string,string> {
 const c=theme.colors, dark=theme.mode==='dark', ink=dark?'255,255,255':'24,20,36';
 const vars: Record<string,string> = {};
 const map: Record<Role,string[]> = {
  'bg-canvas':['canvas'], 'bg-app':['background'], 'bg-panel':['card','popover','sidebar'], 'bg-surface':['secondary','muted'], 'bg-hover':['accent','sidebar-accent'],
  'text-primary':['foreground','card-foreground','popover-foreground','sidebar-foreground','secondary-foreground','accent-foreground','sidebar-accent-foreground'],
  'text-secondary':['t2'], 'text-muted':['muted-foreground'], 'text-faint':['t4'], 'text-on-accent':['primary-foreground','sidebar-primary-foreground'],
  'accent-primary':['primary','sidebar-primary'], 'accent-focus':['ring','sidebar-ring','acc'], 'accent-secondary':['acc2'], 'status-success':['ok'], 'status-warning':['warn'], 'status-error':['bad','destructive'],
 };
 for(const role of ROLES) for(const token of map[role]) vars['--'+token]=c[role];
 for(const name of ['border','input','sidebar-border','bevel-line']) vars['--'+name]=`rgba(${ink},${dark?.09:.16})`;
 Object.assign(vars,{
  '--line-soft':`rgba(${ink},.06)`, '--line-strong':`rgba(${ink},${dark?.14:.25})`, '--chip':`rgba(${ink},.055)`,
  '--segment-track':dark?'rgba(0,0,0,.25)':'rgba(24,20,36,.06)', '--segment-active':dark?'rgba(255,255,255,.13)':'#FFFFFF',
  '--segment-border':`rgba(${ink},.05)`, '--segment-shadow':`inset 0 1px 2px rgba(0,0,0,${dark?.4:.08})`,
  '--segment-active-shadow':`inset 0 1px 0 rgba(255,255,255,${dark?.09:.8}),0 1px 2px rgba(0,0,0,${dark?.35:.12})`,
  '--bevel-hi':`inset 0 1px 0 rgba(255,255,255,${dark?.06:.8})`, '--bevel-drop':`0 1px 2px rgba(0,0,0,${dark?.35:.08})`,
  '--sf-shadow':`0 8px 22px rgba(16,14,22,${dark?.45:.1})`, '--sf-shadow-lg':`0 12px 32px rgba(16,14,22,${dark?.5:.16})`,
  '--grad':theme.id==='dark'?'linear-gradient(135deg,#8C97DB,#5568C4)':`linear-gradient(${c['accent-primary']},${c['accent-primary']})`,
 });
 return vars;
}
