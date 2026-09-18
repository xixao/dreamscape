import type { Metadata } from 'next';
import { ThemeSettings } from '@/components/settings/theme-settings';
export const metadata: Metadata = { title: 'Settings — Dreamscape' };
export default function SettingsPage() { return <ThemeSettings />; }
