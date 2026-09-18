import type { Metadata } from 'next';
import { Archivo, Geist, Geist_Mono, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { CursorProvider } from '@/components/settings/cursor-provider';
import { ThemeProvider } from '@/components/settings/theme-provider';

const archivo = Archivo({ subsets: ['latin'], variable: '--font-archivo' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
});
const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'Dreamscape',
  description: 'Drag shadcn components onto a responsive stage.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${plexMono.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body className="font-sans"><ThemeProvider><CursorProvider>{children}</CursorProvider></ThemeProvider></body>
    </html>
  );
}
