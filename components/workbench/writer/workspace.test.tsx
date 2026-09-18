import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Screen } from '@/lib/files/repository';
import { WriterWorkspace } from './workspace';
const node = (type: string, props = {}, parent: string | null = 'ROOT') => ({ type: { resolvedName: type }, props, parent, nodes: [] as string[], linkedNodes: {}, custom: {}, displayName: type, hidden: false, isCanvas: type === 'LayoutBox' });
const layout = JSON.stringify({ ROOT: { ...node('LayoutBox', {}, null), nodes: ['text','image','input'] }, text: node('Text', { text: 'Original copy' }), image: node('Image', { src: '/test.png', alt: '' }), input: node('Input', { label: 'Search applications', helpText: 'Enter a name' }) });
function Harness({ changed = vi.fn() }: { changed?: (layout: string) => void }) {
 const [screens, setScreens] = useState<Screen[]>([{ id: 'one', pageId: 'page', name: 'First', stageWidth: 800, layout }]);
 return <WriterWorkspace fileName="Test" pages={[{ id: 'page', name: 'Page 1' }]} screens={screens} screenId="one" pageId="page" appearance="light" saveState="saved" onSelectScreen={() => {}} onSelectPage={() => {}} onChange={(id, layout) => { changed(layout); setScreens(screens.map(s => s.id === id ? { ...s, layout } : s)); }} onClose={() => {}} onRetry={() => {}} />;
}
describe('Writer workspace', () => {
 it('edits text inline, undoes and redoes without exposing structural actions', async () => {
   const changed = vi.fn(); render(<Harness changed={changed} />);
   const text = await within(screen.getByRole('main', { name: 'Writer canvas' })).findByText('Original copy');
   fireEvent.doubleClick(text); expect(text).toHaveAttribute('contenteditable','true');
   text.textContent = 'Revised copy'; fireEvent.blur(text);
   await within(screen.getByRole('main', { name: 'Writer canvas' })).findByText('Revised copy'); expect(changed).toHaveBeenCalledTimes(1);
   fireEvent.click(screen.getByRole('button', { name: 'Undo content edit' })); await within(screen.getByRole('main', { name: 'Writer canvas' })).findByText('Original copy');
   fireEvent.click(screen.getByRole('button', { name: 'Redo content edit' })); await within(screen.getByRole('main', { name: 'Writer canvas' })).findByText('Revised copy');
   fireEvent.keyDown(window, { key: 'Delete' }); expect(changed).toHaveBeenCalledTimes(3);
   expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
   expect(screen.queryByRole('complementary', { name: 'Writer inspector' })).not.toBeInTheDocument();
   expect(screen.getByLabelText('Writer zoom').closest('header')).not.toBeNull();
   expect(screen.getByLabelText('Writer viewport').closest('header')).not.toBeNull();
 });
 it('filters missing alt, saves to the renderer and respects decorative intent', async () => {
   const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 300, top: 100, right: 500, bottom: 180, width: 200, height: 80, x: 300, y: 100, toJSON: () => ({}) });
   render(<Harness />);
   fireEvent.click(screen.getByRole('checkbox', { name: /Missing accessibility/ }));
   fireEvent.click(within(screen.getByRole('complementary', { name: 'Writer content' })).getByRole('button', { name: /Image/ }));
   const field = await screen.findByRole('textbox', { name: 'Alternative text' });
   fireEvent.change(field, { target: { value: 'Northline logo' } }); fireEvent.blur(field);
   await waitFor(() => expect(screen.getByRole('img', { name: 'Northline logo' })).toBeInTheDocument());
   fireEvent.click(screen.getByRole('checkbox', { name: 'Decorative image' }));
   await waitFor(() => expect(document.querySelector('img')).toHaveAttribute('alt',''));
   rect.mockRestore();
 });
 it('associates form labels and help text with actual controls', async () => {
   render(<Harness />);
   const input = await screen.findByLabelText('Search applications');
   expect(input).toHaveAccessibleDescription('Enter a name');
 });
});

it('previews field errors without persisting the preview state', async () => {
 const changed = vi.fn(); render(<Harness changed={changed} />);
 fireEvent.click(screen.getByRole('button', {name:'Error'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Please check this value.');
 expect(changed).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', {name:/Back to default/}));
 await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
 expect(changed).not.toHaveBeenCalled();
});
