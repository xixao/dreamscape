import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { PlayProvider, usePlay, type PlayContextValue } from './play-context';

function Probe() {
  const play = usePlay();
  return (
    <output data-testid="probe">
      {play.mode}:{String(play.isDialogOpen('d1'))}
    </output>
  );
}

describe('usePlay', () => {
  it('defaults to design mode with no-op functions when there is no provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('design:false');
  });

  it('does not throw when the default no-op functions are called', () => {
    function CallDefaultsInEffect() {
      const play = usePlay();
      useEffect(() => {
        play.navigate('somewhere');
        play.back();
        play.openDialog('d1');
        play.closeDialog('d1');
      }, [play]);
      return <output data-testid="result">{String(play.isDialogOpen('d1'))}</output>;
    }
    expect(() => render(<CallDefaultsInEffect />)).not.toThrow();
    expect(screen.getByTestId('result')).toHaveTextContent('false');
  });

  it('reflects the value given to PlayProvider', () => {
    const value: PlayContextValue = {
      mode: 'play',
      navigate: vi.fn(),
      back: vi.fn(),
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      isDialogOpen: (nodeId) => nodeId === 'd1',
    };
    render(
      <PlayProvider value={value}>
        <Probe />
      </PlayProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('play:true');
  });
});
