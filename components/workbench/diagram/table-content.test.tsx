import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createDiagramNode } from '@/lib/diagram/insertion';
import { TableContent } from './table-content';
import { TableFields } from './table-fields';

describe('diagram table editing', () => {
  it('commits a cell on Enter and discards an edit on Escape', async () => {
    const onChange = vi.fn();
    render(<TableContent node={createDiagramNode('table', { x: 0, y: 0 })} onChange={onChange} />);
    await userEvent.dblClick(screen.getByText('Column 1'));
    const input = screen.getByRole('textbox', { name: 'Row 1, column 1' });
    await userEvent.clear(input); await userEvent.type(input, 'Status{Enter}');
    expect(onChange.mock.calls[0][0][0][0]).toBe('Status');
    onChange.mockClear();
    await userEvent.dblClick(screen.getByText('Column 2'));
    await userEvent.type(screen.getByRole('textbox', { name: 'Row 1, column 2' }), 'Discard{Escape}');
    expect(onChange).not.toHaveBeenCalled();
  });
  it('changes dimensions and edits cell text in the inspector', async () => {
    const onChange = vi.fn();
    render(<TableFields node={createDiagramNode('table', { x: 0, y: 0 })} onChange={onChange} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Rows' }), { target: { value: '4' } });
    expect(onChange.mock.calls[0][0]).toHaveLength(4);
    const cell = screen.getByRole('textbox', { name: 'Row 2, column 1' });
    await userEvent.type(cell, 'Example'); fireEvent.blur(cell);
    expect(onChange.mock.calls.at(-1)?.[0][1][0]).toBe('Example');
  });
});

it('pastes a list into a focused cell by inserting rows, including while editing', () => {
  const onChange = vi.fn();
  const node = {...createDiagramNode('table', {x:0,y:0}), table:[['Name','Value'],['Existing','Keep']]};
  render(<TableContent node={node} onChange={onChange}/>);
  const cell = screen.getByRole('cell', {name:'Row 2, column 2'});
  fireEvent.click(cell);
  expect(cell).toHaveFocus();
  fireEvent.paste(cell, {clipboardData:{getData:(type:string)=>type==='text/plain'?'apple\nbanana':''}});
  expect(onChange).toHaveBeenLastCalledWith([['Name','Value'],['','apple'],['','banana'],['Existing','Keep']],expect.any(Object));
  onChange.mockClear();
  fireEvent.doubleClick(cell);
  fireEvent.paste(screen.getByRole('textbox'), {clipboardData:{getData:(type:string)=>type==='text/plain'?'carrot\npeach':''}});
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange).toHaveBeenCalledWith([['Name','Value'],['','carrot'],['','peach'],['Existing','Keep']],expect.any(Object));
});

it('selects rows, duplicates by keyboard, and preserves table Undo routing', () => {
  const onChange=vi.fn(),onHistory=vi.fn();
  render(<TableContent node={{...createDiagramNode('table',{x:0,y:0}),table:[['A','B'],['C','D']]}} onChange={onChange} onHistory={onHistory}/>);
  fireEvent.click(screen.getByRole('button',{name:'Select row 2'}));
  const cell=screen.getByRole('cell',{name:'Row 2, column 1'});
  fireEvent.keyDown(cell,{key:'d',metaKey:true});
  expect(onChange.mock.calls.at(-1)?.[0]).toEqual([['A','B'],['C','D'],['C','D']]);
  fireEvent.keyDown(cell,{key:'z',metaKey:true});expect(onHistory).toHaveBeenCalledWith(false);
  fireEvent.keyDown(cell,{key:'Tab'});expect(screen.getByRole('cell',{name:'Row 2, column 2'})).toHaveFocus();
});

it('formats and merges a selected range without deleting source text', () => {
  const onChange=vi.fn();
  render(<TableContent node={{...createDiagramNode('table',{x:0,y:0}),table:[['A','B'],['C','D']]}} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('cell',{name:'Row 1, column 1'}));
  fireEvent.click(screen.getByRole('cell',{name:'Row 1, column 2'}),{shiftKey:true});
  fireEvent.click(screen.getByRole('button',{name:'Table actions and formatting'}));
  fireEvent.click(screen.getByRole('button',{name:'Merge cells'}));
  expect(onChange.mock.calls.at(-1)?.[0]).toEqual([['A','B'],['C','D']]);
  expect(onChange.mock.calls.at(-1)?.[1].merges).toEqual([{row:0,column:0,rows:1,columns:2}]);
  fireEvent.click(screen.getByRole('button',{name:'Bold'}));
  expect(onChange.mock.calls.at(-1)?.[1].styles['0:0'].bold).toBe(true);
  expect(onChange.mock.calls.at(-1)?.[1].styles['0:1'].bold).toBe(true);
});

it('selects the whole table on first click and deletes it without clearing cells', () => {
  const onChange=vi.fn(), onSelectTable=vi.fn(), onDeleteTable=vi.fn();
  const node=createDiagramNode('table',{x:0,y:0});
  const props={node,onChange,onSelectTable,onDeleteTable};
  const {rerender}=render(<TableContent {...props} active={false}/>);
  const cell=screen.getByRole('cell',{name:'Row 1, column 1'});
  fireEvent.pointerDown(cell);
  // Diagram selection updates between pointerdown and click.
  rerender(<TableContent {...props} active/>);
  fireEvent.click(cell);
  const handle=screen.getByRole('button',{name:'Select entire table'});
  expect(handle).toHaveFocus();
  expect(onSelectTable).toHaveBeenCalledOnce();
  fireEvent.keyDown(handle,{key:'Delete'});
  expect(onDeleteTable).toHaveBeenCalledOnce();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.pointerDown(cell); fireEvent.click(cell);
  fireEvent.keyDown(cell,{key:'Delete'});
  expect(onChange).toHaveBeenCalledOnce();
  expect(onDeleteTable).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button',{name:'Table actions and formatting'}));
  fireEvent.click(screen.getByRole('button',{name:'Delete table'}));
  expect(onDeleteTable).toHaveBeenCalledTimes(2);
});
