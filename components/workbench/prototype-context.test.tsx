import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Screen } from '@/lib/files/repository';
import { PrototypeProvider, usePrototypeContext } from './prototype-context';

function Probe() {
  const { panelMode, screens } = usePrototypeContext();
  return (
    <output data-testid="probe">
      {panelMode}:{screens.map((screen) => screen.name).join(',')}
    </output>
  );
}

describe('usePrototypeContext', () => {
  it('defaults to design mode with no screens when there is no provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('design:');
  });

  it('reflects the value given to PrototypeProvider', () => {
    const screens: Screen[] = [{ id: 's1', name: 'Login', layout: '{}', stageWidth: 1440 }];
    render(
      <PrototypeProvider value={{ panelMode: 'prototype', screens }}>
        <Probe />
      </PrototypeProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('prototype:Login');
  });
});
