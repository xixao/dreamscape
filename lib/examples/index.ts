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
