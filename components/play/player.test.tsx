import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FileRecord, Screen } from '@/lib/files/repository';
import { Player } from './player';

// Hand-built Craft serialized trees (the JSON string shape `Screen.layout`
// and the repository always use - see lib/files/validate.ts's Screen type).
// Every node omits any prop that matches its block's own craft.props
// default: Craft's deserializer merges those in for any key a node's saved
// props does not have (confirmed in components/blocks/layout-box.tsx's own
// comment on this exact mechanism), so only the props each test cares about
// need to be spelled out.
const SCREEN_1_TREE = {
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: {},
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['navButton', 'dialogButton', 'dialog1', 'emailInput'],
    linkedNodes: {},
    parent: null,
  },
  navButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Go to second screen' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i1', trigger: 'click', action: 'navigate', targetScreenId: 'screen2' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  dialogButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Open confirm' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i2', trigger: 'click', action: 'openDialog', targetNodeId: 'dialog1' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  dialog1: {
    type: { resolvedName: 'Dialog' },
    isCanvas: false,
    props: { title: 'Confirm action', triggerLabel: 'Confirm', previewOpen: false },
    displayName: 'Dialog',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: { content: 'dialog1Content' },
    parent: 'ROOT',
  },
  dialog1Content: {
    type: { resolvedName: 'DialogContent' },
    isCanvas: true,
    props: {},
    displayName: 'DialogContent',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'dialog1',
  },
  emailInput: {
    type: { resolvedName: 'Input' },
    isCanvas: false,
    props: { placeholder: 'you@example.com' },
    displayName: 'Input',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
};

const SCREEN_2_TREE = {
  ROOT: {
    type: { resolvedName: 'LayoutBox' },
    isCanvas: true,
    props: {},
    displayName: 'LayoutBox',
    custom: {},
    hidden: false,
    nodes: ['greeting', 'backButton'],
    linkedNodes: {},
    parent: null,
  },
  greeting: {
    type: { resolvedName: 'Text' },
    isCanvas: false,
    props: { text: 'Hello world' },
    displayName: 'Text',
    custom: {},
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
  backButton: {
    type: { resolvedName: 'Button' },
    isCanvas: false,
    props: { label: 'Go back' },
    displayName: 'Button',
    custom: { interactions: [{ id: 'i3', trigger: 'click', action: 'back' }] },
    hidden: false,
    nodes: [],
    linkedNodes: {},
    parent: 'ROOT',
  },
};

function makeFile(): FileRecord {
  const screens: Screen[] = [
    { id: 'screen1', name: 'Login', layout: JSON.stringify(SCREEN_1_TREE), stageWidth: 1440 },
    { id: 'screen2', name: 'Second screen', layout: JSON.stringify(SCREEN_2_TREE), stageWidth: 1440 },
  ];
  return {
    id: 'file1',
    name: 'Sign-in flow',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    screens,
  };
}

describe('Player', () => {
  it('navigates to screen 2 when the wired button is clicked', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Go to second screen' }));

    expect(await screen.findByText('Hello world')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to second screen' })).toBeNull();
  });

  it('returns to screen 1 when Back is clicked', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Go to second screen' }));
    await user.click(await screen.findByRole('button', { name: 'Go back' }));

    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
    expect(screen.queryByText('Hello world')).toBeNull();
  });

  it('opens the real dialog with its title when the openDialog interaction fires', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Open confirm' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Confirm action')).toBeInTheDocument();
  });

  it('lets an input be typed into', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    const input = await screen.findByPlaceholderText('you@example.com');

    await user.type(input, 'matt@example.com');

    expect(input).toHaveValue('matt@example.com');
  });

  it('never renders a selection outline', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });
    expect(screen.queryByTestId('selection-outline')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Open confirm' }));
    await screen.findByRole('dialog');
    expect(screen.queryByTestId('selection-outline')).toBeNull();
  });

  it('shows the screen name and a close link back to the editor in the overlay', async () => {
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Esc to exit')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen1');
  });

  it('updates the close link target after navigating to another screen', async () => {
    const user = userEvent.setup();
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await user.click(await screen.findByRole('button', { name: 'Go to second screen' }));
    await screen.findByText('Hello world');

    expect(screen.getByText('Second screen')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/f/file1#s=screen2');
  });

  it('calls window.location.assign with the editor link when Escape is pressed', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<Player file={makeFile()} initialScreenId="screen1" />);
    await screen.findByRole('button', { name: 'Go to second screen' });

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(assign).toHaveBeenCalledWith('/f/file1#s=screen1');
    vi.unstubAllGlobals();
  });

  it('falls back to the first screen when initialScreenId names no screen of this file', async () => {
    render(<Player file={makeFile()} initialScreenId="not-a-real-screen" />);
    expect(await screen.findByRole('button', { name: 'Go to second screen' })).toBeInTheDocument();
  });
});
