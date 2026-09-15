import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageSource } from './image-source';
it('reads a chosen image into a persistable data URL', async () => {
  const onChange = vi.fn();
  render(<ImageSource value="" onChange={onChange} />);
  await userEvent.upload(screen.getByLabelText('Choose image file'), new File(['image'], 'photo.png', { type: 'image/png' }));
  await waitFor(() => expect(onChange).toHaveBeenCalledWith('data:image/png;base64,aW1hZ2U='));
});
it('supports entering a URL and removing an image', async () => {
  const onChange = vi.fn();
  const { rerender } = render(<ImageSource value="" onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('Image URL'));
  await userEvent.paste('https://example.com/photo.jpg');
  expect(onChange).toHaveBeenCalledWith('https://example.com/photo.jpg');
  rerender(<ImageSource value="https://example.com/photo.jpg" onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Remove image' }));
  expect(onChange).toHaveBeenLastCalledWith('');
});
