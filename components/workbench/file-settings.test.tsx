import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppearanceContext } from './appearance-context';
import { FileSettings } from './file-settings';
import { LeftPanelContext, LeftPanelFooter } from './left-panel-tabs';
it('edits the existing file theme and trims file names',()=>{
 const theme=vi.fn(),rename=vi.fn();render(<AppearanceContext.Provider value={{appearance:'light',setAppearance:theme}}><FileSettings open onOpenChange={()=>{}} fileName="Demo" onRename={rename}/></AppearanceContext.Provider>);
 fireEvent.change(screen.getByLabelText('File appearance'),{target:{value:'internal-dark'}});expect(theme).toHaveBeenCalledWith('internal-dark');
 const name=screen.getByLabelText('File name in settings');fireEvent.change(name,{target:{value:' New name '}});fireEvent.blur(name);expect(rename).toHaveBeenCalledWith('New name');
});
it('keeps file settings accessible from a collapsed panel',()=>{
 const open=vi.fn();render(<LeftPanelContext.Provider value={{chatOpen:true,setChatOpen:()=>{},collapsed:true,onOpenFileSettings:open}}><LeftPanelFooter/></LeftPanelContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'File settings'}));expect(open).toHaveBeenCalledOnce();
});
