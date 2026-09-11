import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StageProvider, useStage } from './stage-context';

function Probe() {
  const stage = useStage();
  return (
    <div>
      <output data-testid="width">{stage.width}</output>
      <output data-testid="breakpoint">{stage.breakpoint}</output>
      <output data-testid="preset">{stage.preset ?? 'none'}</output>
      <output data-testid="zoom">{stage.zoom}</output>
      <button onClick={() => stage.setWidth(700)}>seven hundred</button>
      <button onClick={() => stage.setWidth(50)}>too small</button>
      <button onClick={() => stage.setPreset('mobile')}>mobile</button>
      <button onClick={() => stage.setZoom(0.5)}>half</button>
    </div>
  );
}

describe('StageProvider', () => {
  it('starts at the desktop preset and derives breakpoint and preset', () => {
    render(
      <StageProvider>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('width')).toHaveTextContent('1440');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('desktop');
    expect(screen.getByTestId('preset')).toHaveTextContent('desktop');
    expect(screen.getByTestId('zoom')).toHaveTextContent('1');
  });

  it('updates width, clamps it, and reports the change', async () => {
    const onWidthChange = vi.fn();
    render(
      <StageProvider initialWidth={375} onWidthChange={onWidthChange}>
        <Probe />
      </StageProvider>,
    );
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('mobile');

    await userEvent.click(screen.getByText('seven hundred'));
    expect(screen.getByTestId('width')).toHaveTextContent('700');
    expect(screen.getByTestId('breakpoint')).toHaveTextContent('mobile');
    expect(screen.getByTestId('preset')).toHaveTextContent('none');
    expect(onWidthChange).toHaveBeenLastCalledWith(700);

    await userEvent.click(screen.getByText('too small'));
    expect(screen.getByTestId('width')).toHaveTextContent('320');
    expect(onWidthChange).toHaveBeenLastCalledWith(320);

    await userEvent.click(screen.getByRole('button', { name: 'mobile' }));
    expect(screen.getByTestId('width')).toHaveTextContent('375');

    await userEvent.click(screen.getByText('half'));
    expect(screen.getByTestId('zoom')).toHaveTextContent('0.5');
  });

  it('throws outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useStage must be used inside StageProvider');
    spy.mockRestore();
  });
});
