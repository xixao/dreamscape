import loginScreen from './login-screen.json';

export type Example = { slug: 'login'; name: string; layout: string; stageWidth: number };

export const EXAMPLES: Example[] = [
  { slug: 'login', name: 'Login screen', layout: JSON.stringify(loginScreen), stageWidth: 1440 },
];

export function findExample(slug: string): Example | undefined {
  return EXAMPLES.find((example) => example.slug === slug);
}
