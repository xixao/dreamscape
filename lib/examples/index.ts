import { nanoid } from 'nanoid';
import type { Screen } from '@/lib/files/repository';
import loginScreen from './login-screen.json';
import dashboard from './dashboard.json';
import settings from './settings.json';
import signUp from './sign-up.json';

export type ExampleSlug = 'login' | 'dashboard' | 'settings' | 'signup';

export type Example = { slug: ExampleSlug; name: string; layout: string; stageWidth: number };

export const EXAMPLES: Example[] = [
  { slug: 'login', name: 'Login screen', layout: JSON.stringify(loginScreen), stageWidth: 1440 },
  { slug: 'dashboard', name: 'Dashboard', layout: JSON.stringify(dashboard), stageWidth: 1440 },
  { slug: 'settings', name: 'Settings', layout: JSON.stringify(settings), stageWidth: 1440 },
  { slug: 'signup', name: 'Sign up', layout: JSON.stringify(signUp), stageWidth: 1440 },
];

export function findExample(slug: string): Example | undefined {
  return EXAMPLES.find((example) => example.slug === slug);
}

/**
 * Wraps an example's one layout into the single-screen array a new file's
 * `screens` expects, named after the example itself (so "New from example:
 * Dashboard" starts as a screen named "Dashboard", not "Frame 1"). A fresh
 * id every call, so creating two files from the same example back to back
 * does not hand them the same screen id.
 */
export function exampleToScreens(example: Example): Screen[] {
  return [{ id: nanoid(10), name: example.name, layout: example.layout, stageWidth: example.stageWidth }];
}
