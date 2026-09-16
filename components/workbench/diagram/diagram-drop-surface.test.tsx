import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiagramDropSurface } from './diagram-drop-surface';
import { DiagramToolTray } from './diagram-tool-tray';
import { DiagramPalette } from './diagram-palette';
import { DIAGRAM_SHAPE_MIME } from '@/lib/diagram/insertion';

function transfer() {
  const data = new Map<string, string>();
  return { types: [DIAGRAM_SHAPE_MIME], setData: (key: string, value: string) => data.set(key, value), getData: (key: string) => data.get(key) ?? '', effectAllowed: '', dropEffect: '' };
}

describe('diagram palette drops', () => {
  it.each(['right', 'bottom'])('places a dragged shape from the %s panel at the cursor with pan, zoom and canvas offset', panel => {
    const onInsert = vi.fn();
    const onClick = vi.fn();
    render(<>
      {panel === 'right' ? <DiagramToolTray onSelectDiagramTool={onClick} /> : <DiagramPalette open tool={{kind:'pointer'}} onSelectTool={onClick} onClose={vi.fn()} />}
      <DiagramDropSurface viewport={{x:100,y:50,zoom:2}} onInsert={onInsert} />
    </>);
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByRole('button', {name:'Decision'}), {dataTransfer});
    expect(dataTransfer.getData(DIAGRAM_SHAPE_MIME)).toBe('decision');
    expect(onInsert).not.toHaveBeenCalled();
    const surface = screen.getByTestId('diagram-drop-surface');
    vi.spyOn(surface,'getBoundingClientRect').mockReturnValue({left:20,top:30} as DOMRect);
    const event = new Event('drop',{bubbles:true,cancelable:true});
    Object.assign(event,{dataTransfer,clientX:420,clientY:280});
    fireEvent(surface,event);
    expect(onInsert).toHaveBeenCalledExactlyOnceWith('decision',{x:150,y:100});
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('diagram-drop-surface')).not.toBeInTheDocument();
  });

  it('cancels a drag without inserting or leaving a blocking overlay', () => {
    const onInsert=vi.fn();
    render(<><DiagramToolTray/><DiagramDropSurface viewport={{x:0,y:0,zoom:1}} onInsert={onInsert}/></>);
    const button=screen.getByRole('button',{name:'Note'});
    fireEvent.dragStart(button,{dataTransfer:transfer()});
    expect(screen.getByTestId('diagram-drop-surface')).toBeInTheDocument();
    act(()=>window.dispatchEvent(new Event('dragend')));
    expect(screen.queryByTestId('diagram-drop-surface')).not.toBeInTheDocument();
    expect(onInsert).not.toHaveBeenCalled();
  });
});
