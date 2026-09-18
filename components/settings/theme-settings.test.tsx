import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from './theme-provider';
import { ThemeSettings } from './theme-settings';
import { DARK, EASTER_EGG_THEMES, STORAGE_KEY } from '@/lib/ui-theme';
const setup=()=>render(<ThemeProvider><ThemeSettings/></ThemeProvider>);
beforeEach(()=>localStorage.clear());
describe('theme settings',()=>{
 it('shows an old unchanged Naruto copy only once and preserves modified copies',()=>{
  localStorage.setItem(STORAGE_KEY,JSON.stringify({selected:'custom-old',custom:[
   {id:'custom-old',name:'Naruto',mode:'dark',colors:EASTER_EGG_THEMES.naruto.dark},
   {id:'custom-edited',name:'Naruto',mode:'dark',colors:{...EASTER_EGG_THEMES.naruto.dark,'bg-panel':'#123456'}},
  ]}));setup();
  expect(screen.getAllByRole('heading',{name:'Naruto'})).toHaveLength(1);
  expect(screen.getByRole('heading',{name:'Naruto · Custom'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Customize Naruto'})).toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).custom).toHaveLength(2);
 });

 it('applies a gallery preset without opening customization or creating a copy, and restores it',async()=>{
  const user=userEvent.setup();const view=setup();
  await user.selectOptions(screen.getByLabelText('Theme gallery appearance'),'light');
  await user.click(screen.getByRole('button',{name:'Apply Sonic'}));
  expect(screen.queryByLabelText('Theme name')).toBeNull();
  expect(screen.getByRole('button',{name:'Apply Sonic'})).toHaveAttribute('aria-pressed','true');
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({selected:'preset-sonic-light',custom:[]});
  view.unmount();setup();
  expect(document.documentElement.style.getPropertyValue('--primary')).toBe(EASTER_EGG_THEMES.sonic.light['accent-primary']);
  expect(document.documentElement.dataset.chromeMode).toBe('light');
 });

 it('selects and persists locked defaults without offering a name or color editor',async()=>{const user=userEvent.setup();setup();expect(screen.queryByLabelText('Theme name')).toBeNull();expect(screen.getAllByText('Locked default')).toHaveLength(2);await user.click(screen.getByRole('button',{name:'Use Light'}));expect(document.documentElement.dataset.chromeMode).toBe('light');expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).selected).toBe('light');});
 it('unlocks a preset, changes its baseline, saves and restores it on remount',async()=>{const user=userEvent.setup();const view=setup();await user.click(screen.getAllByRole('button',{name:'Customize'})[0]);await user.type(screen.getByLabelText('Theme name'),'  KuRoMi  ');expect(document.documentElement.style.getPropertyValue('--primary')).toBe(EASTER_EGG_THEMES.kuromi.dark['accent-primary']);await user.selectOptions(screen.getByLabelText('Baseline'),'light');expect(document.documentElement.style.getPropertyValue('--primary')).toBe(EASTER_EGG_THEMES.kuromi.light['accent-primary']);await user.click(screen.getByRole('button',{name:'Save theme'}));expect(screen.getByRole('heading',{name:'Kuromi'})).toBeInTheDocument();view.unmount();setup();expect(document.documentElement.dataset.chromeMode).toBe('light');expect(screen.getByRole('heading',{name:'Kuromi'})).toBeInTheDocument();});
 it('edits a hex color, previews it, and cancels without modifying Dark',async()=>{const user=userEvent.setup();setup();await user.click(screen.getAllByRole('button',{name:'Customize'})[0]);await user.click(screen.getByLabelText('Edit Canvas color'));fireEvent.change(screen.getByLabelText('Canvas hex color'),{target:{value:'#123456'}});expect(document.documentElement.style.getPropertyValue('--canvas')).toBe('#123456');await user.click(screen.getByRole('button',{name:'Cancel'}));expect(document.documentElement.style.getPropertyValue('--canvas')).toBe(DARK.colors['bg-canvas']);expect(localStorage.getItem(STORAGE_KEY)).toBeNull();});
 it('deleting the active custom theme returns to Dark',async()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify({selected:'custom-test',custom:[{...DARK,id:'custom-test',name:'Test'}]}));vi.spyOn(window,'confirm').mockReturnValue(true);const user=userEvent.setup();setup();await user.click(screen.getByRole('button',{name:'Delete Test'}));expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({selected:'dark',custom:[]});});
});
