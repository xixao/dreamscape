import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ExplorationSetup } from './setup';

describe('exploration entry',()=>{
  it('accepts optional instructions without teaching or count controls',async()=>{
    const create=vi.fn();
    render(<ExplorationSetup name="Loan pipeline" onClose={()=>{}} onCreate={create}/>);
    expect(screen.getByText('Starting from Loan pipeline')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Generate variations'})).toBeDisabled();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.type(screen.getByRole('textbox'),'Create three layouts with clearer hierarchy');
    await userEvent.click(screen.getByRole('button',{name:'Generate variations'}));
    expect(create).toHaveBeenCalledWith('Create three layouts with clearer hierarchy');
  });
  it('links the lucky action to the static demo without generating',async()=>{
    const create=vi.fn();
    render(<ExplorationSetup name="Loan pipeline" onClose={()=>{}} onCreate={create}/>);
    expect(screen.getByRole('link',{name:'I’m feeling lucky'})).toHaveAttribute('href','/demos/variations');
    expect(create).not.toHaveBeenCalled();
  });
  it('supports scratch entry and cancel without creating an exploration',async()=>{
    const create=vi.fn(),close=vi.fn();
    render(<ExplorationSetup name={null} onClose={close} onCreate={create}/>);
    expect(screen.queryByText('Starting from scratch')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Cancel'}));
    expect(close).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
});
