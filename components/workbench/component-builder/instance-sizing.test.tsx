import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InstanceSizing } from './instance-sizing';
import { designStyle, type DesignProps } from '@/components/blocks/design-controls';

describe('instance sizing', () => {
  it('offers container sizing without a misleading pixel value and allows percentage sizing', () => {
    const onChange = vi.fn();
    const { rerender } = render(<InstanceSizing props={{}} onChange={onChange} />);
    expect(screen.queryByLabelText('Component width')).toBeNull();
    fireEvent.change(screen.getByLabelText('Width sizing'), { target: { value: 'percent' } });
    expect(onChange).toHaveBeenCalledWith({ widthMode: 'percent' });
    rerender(<InstanceSizing props={{ widthMode: 'percent', widthPercent: 80 }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Component width'), { target: { value: '75' } });
    expect(onChange).toHaveBeenCalledWith({ widthPercent: 75 });
    fireEvent.change(screen.getByLabelText('Maximum width unit'), { target: { value: 'px' } });
    expect(onChange).toHaveBeenCalledWith({ maxWidth: { value: 800, unit: 'px' } });
  });
  it('renders the chosen units and caps fill width', () => {
    const style = (props: Partial<DesignProps>) => designStyle(props as DesignProps);
    expect(style({ widthMode: 'fill', maxWidth: { value: 800, unit: 'px' } })).toMatchObject({ width: '100%', maxWidth: '800px' });
    expect(style({ widthMode: 'percent', widthPercent: 75 })).toMatchObject({ width: '75%' });
    expect(style({ widthMode: 'fixed', widthPx: 480, maxWidth: { value: 90, unit: '%' } })).toMatchObject({ width: 480, maxWidth: '90%' });
  });
});

it('steps instance width and maximum width by ten', () => {
  const onChange = vi.fn();
  render(<InstanceSizing props={{ widthMode: 'fixed', widthPx: 320, maxWidth: { value: 800, unit: 'px' } }} onChange={onChange} />);
  fireEvent.keyDown(screen.getByLabelText('Component width'), { key: 'ArrowUp', shiftKey: true });
  expect(onChange).toHaveBeenCalledWith({ widthPx: 330 });
  fireEvent.keyDown(screen.getByLabelText('Maximum width'), { key: 'ArrowDown', shiftKey: true });
  expect(onChange).toHaveBeenCalledWith({ maxWidth: { value: 790, unit: 'px' } });
});
