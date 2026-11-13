import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { DemoSession } from '../components/demo-session';
import './globals.css';

const geistSans = localFont({
  src: '../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2',
  variable: '--font-geist-sans',
  display: 'swap',
  weight: '100 900',
});
const geistMono = localFont({
  src: '../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2',
  variable: '--font-geist-mono',
  display: 'swap',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'Northbook',
  description: 'An independent OTC workflow demonstration.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <DemoSession>{children}</DemoSession>
      </body>
    </html>
  );
}
